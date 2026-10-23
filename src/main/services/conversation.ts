/**
 * Conversation Service — persists LLM chat conversations as JSON files.
 * Stored in the app's userData directory (e.g. ~/Library/Application Support/Phylla/conversations/).
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { z } from 'zod';

import { IpcError, toIpcErrorCode, ipcFailure } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import { assertSafeFileName, resolveInsideBoundary } from '@/main/lib/validation';
import {
    type Conversation,
    type ConversationMessage,
    ConversationSchema,
    ConversationMessageSchema,
    type AiSimpleResult,
    type ConversationCreateResult,
    type ConversationListResult,
    type ConversationLoadResult,
} from '@/schemas/ai';

type ConversationSummary = {
    id: string;
    title: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    tokenCount: number;
};

let conversationsDir: string | null = null;

/**
 * Initialize the conversations directory.
 * Must be called after app.whenReady() since it uses app.getPath().
 */
export function init(userDataPath: string): void {
    conversationsDir = path.join(userDataPath, 'conversations');
    if (!existsSync(conversationsDir)) {
        mkdirSync(conversationsDir, { recursive: true });
    }
}

export function register(ipc: IpcMain): void {
    ipc.handle('conversations:list', async (): Promise<ConversationListResult> => readConversations());

    ipc.handle('conversations:create', async (_event, modelName: unknown): Promise<ConversationCreateResult> => {
        const parsed = z.string().min(1).safeParse(modelName);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return createConversation(parsed.data);
    });

    ipc.handle('conversations:load', async (_event, id: unknown): Promise<ConversationLoadResult> => {
        const parsed = z.string().min(1).safeParse(id);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return loadConversation(parsed.data);
    });

    ipc.handle('conversations:save', async (_event, conversation: unknown): Promise<AiSimpleResult> => {
        const parsed = ConversationSchema.safeParse(conversation);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return saveConversation(parsed.data);
    });

    ipc.handle(
        'conversations:addMessage',
        async (_event, conversationId: unknown, message: unknown): Promise<AiSimpleResult> => {
            const idParsed = z.string().min(1).safeParse(conversationId);
            const msgParsed = ConversationMessageSchema.safeParse(message);
            if (!idParsed.success || !msgParsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
            return addMessage(idParsed.data, msgParsed.data);
        },
    );

    ipc.handle('conversations:delete', async (_event, id: unknown): Promise<AiSimpleResult> => {
        const parsed = z.string().min(1).safeParse(id);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return deleteConversation(parsed.data);
    });

    ipc.handle('conversations:rename', async (_event, id: unknown, newTitle: unknown): Promise<AiSimpleResult> => {
        const idParsed = z.string().min(1).safeParse(id);
        const titleParsed = z.string().min(1).safeParse(newTitle);
        if (!idParsed.success || !titleParsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return renameConversation(idParsed.data, titleParsed.data);
    });
}

async function createConversation(modelName: string): Promise<ConversationCreateResult> {
    try {
        const now = new Date().toISOString();
        const conversation: Conversation = {
            id: generateId(),
            title: 'New Conversation',
            model: modelName.trim() !== '' ? modelName.trim() : 'unknown',
            createdAt: now,
            updatedAt: now,
            messages: [],
            tokenCount: 0,
        };

        await writeFileAtomic(getConversationPath(conversation.id), JSON.stringify(conversation, null, 2));

        return { success: true, conversation };
    } catch (error) {
        log.error('Failed to create conversation:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

async function saveConversation(conversation: Conversation): Promise<AiSimpleResult> {
    try {
        conversation.updatedAt = new Date().toISOString();
        if (conversation.title === 'New Conversation' && conversation.messages.length > 0) {
            conversation.title = deriveTitle(conversation.messages);
        }

        await writeFileAtomic(getConversationPath(conversation.id), JSON.stringify(conversation, null, 2));

        return { success: true };
    } catch (error) {
        log.error('Failed to save conversation:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

async function addMessage(conversationId: string, message: ConversationMessage): Promise<AiSimpleResult> {
    try {
        const conversation = await findConversation(conversationId);
        if (conversation === null) {
            return { success: false, error: 'NOT_FOUND' };
        }

        message.timestamp = new Date().toISOString();
        conversation.messages.push(message);

        return await saveConversation(conversation);
    } catch (error) {
        log.error('Failed to add message:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

async function findConversation(id: string): Promise<Conversation | null> {
    try {
        const filePath = getConversationPath(id);
        const data = await fs.readFile(filePath, 'utf-8');
        const result = ConversationSchema.safeParse(JSON.parse(data));
        if (!result.success) {
            log.error('Corrupt conversation file:', result.error.message);
            return null;
        }
        return result.data;
    } catch {
        return null;
    }
}

async function readConversations(): Promise<ConversationListResult> {
    try {
        if (conversationsDir === null) {
            return { success: false, conversations: [], error: 'INVALID_STATE' };
        }
        const dir = conversationsDir;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const conversations: ConversationSummary[] = [];

        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
            const summary = await findConversationSummary(dir, entry.name);
            if (summary !== null) conversations.push(summary);
        }

        conversations.sort((a, b): number => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        return { success: true, conversations };
    } catch (error) {
        log.error('Failed to read conversations', error);
        return { success: false, conversations: [], error: toIpcErrorCode(error) };
    }
}

async function loadConversation(id: string): Promise<ConversationLoadResult> {
    try {
        const conversation = await findConversation(id);
        if (conversation === null) {
            return { success: false, error: 'NOT_FOUND' };
        }
        return { success: true, conversation };
    } catch (error) {
        return ipcFailure('conversation loadConversation', error);
    }
}

async function deleteConversation(id: string): Promise<AiSimpleResult> {
    try {
        const filePath = getConversationPath(id);
        await fs.unlink(filePath);
        return { success: true };
    } catch (error) {
        log.error('Failed to delete conversation:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

async function renameConversation(id: string, newTitle: string): Promise<AiSimpleResult> {
    try {
        const conversation = await findConversation(id);
        if (conversation === null) {
            return { success: false, error: 'NOT_FOUND' };
        }
        conversation.title = newTitle;
        return await saveConversation(conversation);
    } catch (error) {
        return ipcFailure('conversation renameConversation', error);
    }
}

/** Write content to a file atomically: write to .tmp, then rename into place. */
async function writeFileAtomic(filePath: string, data: string): Promise<void> {
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, data, 'utf-8');
    await fs.rename(tmp, filePath);
}

function generateId(): string {
    return randomUUID();
}

function deriveTitle(messages: ConversationMessage[]): string {
    const firstUserMsg = messages.find((m): boolean => m.role === 'user');
    if (firstUserMsg === undefined) return 'New Conversation';
    const text = firstUserMsg.content.trim();
    if (text.length <= 60) return text;
    return `${text.slice(0, 57)}...`;
}

function getConversationPath(id: string): string {
    // Prevent path traversal via crafted IDs like "../../etc/passwd"
    if (conversationsDir === null) {
        throw new IpcError('INVALID_STATE', 'Conversations directory not initialized');
    }
    assertSafeFileName(id);
    const filePath = path.join(conversationsDir, `${id}.json`);
    resolveInsideBoundary(filePath, conversationsDir);
    return filePath;
}

async function findConversationSummary(dir: string, fileName: string): Promise<ConversationSummary | null> {
    try {
        const data = await fs.readFile(path.join(dir, fileName), 'utf-8');
        const parsed = ConversationSchema.safeParse(JSON.parse(data));
        if (!parsed.success) {
            log.error('Skipping corrupt conversation file', { file: fileName, error: parsed.error.message });
            return null;
        }
        const conv = parsed.data;
        return {
            id: conv.id,
            title: conv.title,
            model: conv.model,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            messageCount: Array.isArray(conv.messages) ? conv.messages.length : 0,
            tokenCount: conv.tokenCount !== undefined && conv.tokenCount !== 0 ? conv.tokenCount : 0,
        };
    } catch (err) {
        log.error('Failed to read conversation file', { file: fileName }, err);
        return null;
    }
}
