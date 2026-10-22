/**
 * AI Service — manages local LLM inference via node-llama-cpp.
 * Runs in the Electron main process; handles model loading, unloading,
 * and chat inference with streaming token support.
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import type { BrowserWindow } from 'electron';
import { shell } from 'electron';
import type { Llama, LlamaModel, LlamaContext, LlamaChatSession, LlamaContextSequence } from 'node-llama-cpp';
import { z } from 'zod';

import { IpcError, toIpcErrorCode, ipcFailure } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import { DEFAULT_MODELS_DIR, PHYLLA_HOME } from '@/main/lib/paths';
import { getActiveSystemPrompt } from '@/main/services/systemPrompt';
import {
    type AiModelInfo,
    ConversationMessageSchema,
    type AiChatResult,
    type AiListModelsResult,
    type AiLoadResult,
    type AiSimpleResult,
    type AiStatus,
} from '@/schemas/ai';

type ModelEntry = AiModelInfo;

const COMPACTION_THRESHOLD = 0.9;
const NON_MODEL_PREFIXES: string[] = ['mmproj-', 'projector-', 'tokenizer', 'adapter'];

// Architectures whose Metal (GPU) backend has known execution failures.
// For these we force CPU-only inference (gpuLayers: 0).
// - mistral3: 262K-context YaRN model; Metal command buffers fail on decode
//   with status 5 (MTLCommandBufferStatusError) on Apple Silicon.
const CPU_ONLY_ARCHITECTURES = new Set(['mistral3']);

let llama: Llama | null = null;
let model: LlamaModel | null = null;
let context: LlamaContext | null = null;
let session: LlamaChatSession | null = null;

let isModelLoaded = false;
let currentModelPath: string | null = null;
let isGenerating = false;
let currentAbortController: AbortController | null = null;
let pendingConversationHistory: { role: string; content: string }[] | null = null;
let trackedMessages: { role: string; content: string }[] = [];

export function register(ipc: IpcMain, findMainWindow: () => BrowserWindow | null): void {
    ipc.handle('ai:listModels', async (): Promise<AiListModelsResult> => readModels());

    ipc.handle('ai:loadModel', async (_event, modelPath: unknown): Promise<AiLoadResult> => {
        const parsed = z.string().min(1).safeParse(modelPath);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return loadModel(parsed.data);
    });

    ipc.handle('ai:unloadModel', async (): Promise<AiSimpleResult> => unloadModel());

    ipc.handle('ai:chat', async (_event, userMessage: unknown, noteContext: unknown): Promise<AiChatResult> => {
        const msgParsed = z.string().min(1).safeParse(userMessage);
        const ctxParsed = z.string().nullish().safeParse(noteContext);
        if (!msgParsed.success || !ctxParsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return chat(
            msgParsed.data,
            (token): void => {
                const window = findMainWindow();
                if (window !== null && !window.isDestroyed()) window.webContents.send('ai:token', token);
            },
            (token): void => {
                const window = findMainWindow();
                if (window !== null && !window.isDestroyed()) window.webContents.send('ai:thinkingToken', token);
            },
            ctxParsed.data,
        );
    });

    ipc.handle('ai:stopChat', (): AiSimpleResult => stopChat());
    ipc.handle('ai:resetChat', async (): Promise<AiSimpleResult> => resetChat());

    ipc.handle('ai:restoreChatHistory', (_event, messages: unknown): AiSimpleResult => {
        const parsed = z.array(ConversationMessageSchema).safeParse(messages);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return restoreChatHistory(parsed.data);
    });

    ipc.handle('ai:getStatus', (): AiStatus => getStatus());
    ipc.handle('ai:openPhyllaDir', async (): Promise<AiSimpleResult> => await openPhyllaDir());
}

/** Graceful shutdown: unload the model and free resources. */
export async function cleanup(): Promise<void> {
    if (isModelLoaded) {
        await unloadModel();
    }
}

async function ensureModelsDir(): Promise<void> {
    try {
        await fs.mkdir(DEFAULT_MODELS_DIR, { recursive: true });
    } catch (err) {
        log.error('Failed to create models directory:', err);
    }
}

async function getLlamaInstance(): Promise<Llama> {
    if (llama !== null) return llama;
    const { getLlama } = await import('node-llama-cpp');
    llama = await getLlama();
    return llama;
}

function isModelFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    if (!lower.endsWith('.gguf')) return false;
    return !NON_MODEL_PREFIXES.some((prefix): boolean => lower.startsWith(prefix));
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const step = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(step));
    return `${parseFloat((bytes / Math.pow(step, i)).toFixed(2))} ${sizes[i]}`;
}

async function scanForModels(dir: string, baseDir: string): Promise<ModelEntry[]> {
    const models: ModelEntry[] = [];
    let entries;

    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return models;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const depth = path.relative(baseDir, fullPath).split(path.sep).length;
            if (depth <= 2) {
                const subModels = await scanForModels(fullPath, baseDir);
                models.push(...subModels);
            }
        } else if (entry.isFile() && isModelFile(entry.name)) {
            const stats = await fs.stat(fullPath);
            const relativePath = path.relative(baseDir, fullPath);
            const displayName = relativePath.includes(path.sep) ? relativePath : entry.name;

            models.push({
                name: displayName,
                path: fullPath,
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                modified: stats.mtime.toISOString(),
            });
        }
    }

    return models;
}

async function readModels(): Promise<AiListModelsResult> {
    await ensureModelsDir();

    try {
        const models = await scanForModels(DEFAULT_MODELS_DIR, DEFAULT_MODELS_DIR);
        models.sort((a, b): number => a.name.localeCompare(b.name));
        return { success: true, models, modelsDir: DEFAULT_MODELS_DIR };
    } catch (error) {
        log.warn('[ai] readModels failed:', error);
        return { success: false, error: toIpcErrorCode(error), models: [], modelsDir: DEFAULT_MODELS_DIR };
    }
}

async function getModelLoadOptions(modelPath: string): Promise<{ gpuLayers?: number }> {
    try {
        const { readGgufFileInfo } = await import('node-llama-cpp');
        const info = await readGgufFileInfo(modelPath);
        const arch = info.metadata['general']['architecture'] as string | undefined;
        if (arch != null && arch !== '' && CPU_ONLY_ARCHITECTURES.has(arch.toLowerCase())) {
            log.info('[ai] Architecture requires CPU-only inference — disabling GPU layers', { arch });
            return { gpuLayers: 0 };
        }
    } catch (err) {
        log.warn('[ai] Could not read GGUF metadata, using default load options:', err);
    }
    return {};
}

async function loadModel(modelPath: string): Promise<AiLoadResult> {
    try {
        if (isModelLoaded) {
            await unloadModel();
        }

        // Only allow loading models from the designated models directory
        const resolvedModel = path.resolve(modelPath);
        const resolvedModelsDir = path.resolve(DEFAULT_MODELS_DIR);
        if (resolvedModel !== resolvedModelsDir && !resolvedModel.startsWith(resolvedModelsDir + path.sep)) {
            return { success: false, error: 'ACCESS_DENIED' };
        }

        if (!existsSync(modelPath)) {
            return { success: false, error: 'NOT_FOUND' };
        }

        const llamaInstance = await getLlamaInstance();

        log.info('Loading model', { modelPath });
        const loadOptions = await getModelLoadOptions(modelPath);
        model = await llamaInstance.loadModel({ modelPath, ...loadOptions });
        context = await model.createContext();

        const { LlamaChatSession } = await import('node-llama-cpp');
        const systemPrompt = await getActiveSystemPrompt();
        session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            ...(systemPrompt !== '' ? { systemPrompt } : {}),
        });

        isModelLoaded = true;
        currentModelPath = modelPath;

        log.info('Model loaded successfully');
        return { success: true, modelName: path.basename(modelPath) };
    } catch (error) {
        log.error('Failed to load model:', error);
        isModelLoaded = false;
        currentModelPath = null;
        model = null;
        context = null;
        session = null;
        return { success: false, error: toIpcErrorCode(error) };
    }
}

async function unloadModel(): Promise<AiSimpleResult> {
    try {
        session = null;
        if (context !== null) {
            await context.dispose();
            context = null;
        }
        if (model !== null) {
            await model.dispose();
            model = null;
        }

        isModelLoaded = false;
        currentModelPath = null;
        isGenerating = false;
        pendingConversationHistory = null;
        trackedMessages = [];

        global.gc?.();

        return { success: true };
    } catch (error) {
        log.error('Failed to unload model:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

/**
 * Start a fresh chat session on a cleared context sequence, reusing `seq` when it is
 * still alive so compaction does not exhaust the model's sequence slots.
 */
async function startCompactedSession(seq: LlamaContextSequence): Promise<LlamaChatSession> {
    const { LlamaChatSession } = await import('node-llama-cpp');
    const systemPrompt = await getActiveSystemPrompt();
    const systemPromptOption = systemPrompt !== '' ? { systemPrompt } : {};
    if (!seq.disposed) {
        await seq.clearHistory();
        return new LlamaChatSession({ contextSequence: seq, ...systemPromptOption });
    }
    if (context !== null) {
        return new LlamaChatSession({ contextSequence: context.getSequence(), ...systemPromptOption });
    }
    throw new IpcError('INVALID_STATE', 'No context available to rebuild the chat session after compaction.');
}

async function chat(
    userMessage: string,
    onToken: (token: string) => void,
    onThinkingToken: (token: string) => void,
    noteContext: string | null = null,
): Promise<AiChatResult> {
    if (!isModelLoaded || session === null) {
        return { success: false, error: 'MODEL_NOT_LOADED' };
    }

    if (isGenerating) {
        return { success: false, error: 'BUSY' };
    }

    isGenerating = true;
    currentAbortController = new AbortController();

    try {
        let prompt = userMessage;

        if (pendingConversationHistory !== null) {
            const summary = buildConversationSummary(pendingConversationHistory);
            pendingConversationHistory = null;
            prompt = `Here is a summary of our previous conversation for context:\n\n---\n${summary}\n---\n\n${prompt}`;
        }

        if (noteContext !== null && noteContext !== '') {
            prompt = `Here is the content of the current note for context:\n\n---\n${noteContext}\n---\n\nUser question: ${prompt}`;
        }

        let fullResponse = '';

        await session.prompt(prompt, {
            signal: currentAbortController.signal,
            stopOnAbortSignal: true,
            onResponseChunk: (chunk): void => {
                if (chunk.text.length === 0) return;
                if (chunk.type === 'segment' && chunk.segmentType === 'thought') {
                    onThinkingToken(chunk.text);
                } else if (chunk.type === undefined) {
                    fullResponse += chunk.text;
                    onToken(chunk.text);
                }
            },
        });

        trackedMessages.push({ role: 'user', content: userMessage });
        trackedMessages.push({ role: 'assistant', content: fullResponse });

        let compacted = false;
        try {
            const seq = session.sequence;
            const usage = seq.nextTokenIndex / seq.contextSize;
            if (usage >= COMPACTION_THRESHOLD) {
                log.info('Context usage high — auto-compacting', { usagePercent: Math.round(usage * 100) });
                pendingConversationHistory = [...trackedMessages];
                session = await startCompactedSession(seq);
                compacted = true;
                log.info('Auto-compaction complete. Summary will be injected on next prompt.');
            }
        } catch (compactErr) {
            log.error('Auto-compaction check failed:', compactErr);
        }

        isGenerating = false;
        currentAbortController = null;
        return { success: true, response: fullResponse, compacted };
    } catch (error) {
        isGenerating = false;
        currentAbortController = null;
        log.error('Chat error:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

function stopChat(): AiSimpleResult {
    if (isGenerating && currentAbortController !== null) {
        currentAbortController.abort();
        isGenerating = false;
        currentAbortController = null;
        log.info('Generation stopped by user');
        return { success: true };
    }
    return { success: false, error: 'INVALID_STATE' };
}

async function resetChat(): Promise<AiSimpleResult> {
    if (!isModelLoaded || model === null || context === null) {
        return { success: false, error: 'MODEL_NOT_LOADED' };
    }

    try {
        pendingConversationHistory = null;
        trackedMessages = [];
        const { LlamaChatSession } = await import('node-llama-cpp');
        const systemPrompt = await getActiveSystemPrompt();
        const systemPromptOption = systemPrompt !== '' ? { systemPrompt } : {};
        // Reuse the existing sequence (clear its KV cache) instead of
        // calling context.getSequence() which allocates a new slot and
        // can exhaust the context's sequence limit, crashing Metal.
        const existingSeq: LlamaContextSequence | undefined = session?.sequence;
        if (existingSeq !== undefined && !existingSeq.disposed) {
            await existingSeq.clearHistory();
            session = new LlamaChatSession({
                contextSequence: existingSeq,
                ...systemPromptOption,
            });
        } else {
            session = new LlamaChatSession({
                contextSequence: context.getSequence(),
                ...systemPromptOption,
            });
        }
        return { success: true };
    } catch (error) {
        return ipcFailure('ai resetChat', error);
    }
}

function restoreChatHistory(messages: { role: string; content: string }[]): AiSimpleResult {
    if (messages.length === 0) {
        pendingConversationHistory = null;
        return { success: true };
    }

    try {
        // Convert ConversationMessage[] back to working format for llama session
        pendingConversationHistory = messages.map((m): { role: string; content: string } => ({
            role: m.role,
            content: m.content,
        }));
        trackedMessages = [...pendingConversationHistory];
        log.info('Stored messages for context restoration', { count: messages.length });
        return { success: true };
    } catch (error) {
        log.error('Failed to store chat history:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

function buildConversationSummary(messages: { role: string; content: string }[]): string {
    const MAX_MSG_LENGTH = 2000;
    const MAX_MESSAGES = 50;

    const recentMessages = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;

    return recentMessages
        .map((m): string => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            const content = m.content.length > MAX_MSG_LENGTH ? `${m.content.slice(0, MAX_MSG_LENGTH)}...` : m.content;
            return `${role}: ${content}`;
        })
        .join('\n');
}

function getStatus(): AiStatus {
    let contextTokens = 0;
    let contextSize = 0;

    if (isModelLoaded && session !== null) {
        try {
            const seq = session.sequence;
            contextTokens = seq.nextTokenIndex;
            contextSize = seq.contextSize;
        } catch {
            /* sequence may not be available yet */
        }
    }

    return {
        isModelLoaded,
        currentModelPath,
        currentModelName: currentModelPath !== null && currentModelPath !== '' ? path.basename(currentModelPath) : null,
        isGenerating,
        modelsDir: DEFAULT_MODELS_DIR,
        contextTokens,
        contextSize,
    };
}

async function openPhyllaDir(): Promise<{ success: boolean }> {
    await fs.mkdir(PHYLLA_HOME, { recursive: true });
    await shell.openPath(PHYLLA_HOME);
    return { success: true };
}
