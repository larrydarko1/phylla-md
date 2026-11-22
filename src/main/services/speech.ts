/**
 * Speech-to-Text Service — local Whisper inference via @huggingface/transformers.
 * Runs in the Electron main process using onnxruntime-node for native ONNX inference.
 * Model is pre-downloaded and bundled; 100% offline at runtime.
 */

import { existsSync } from 'fs';
import path from 'path';

import type { pipeline as PipelineFn } from '@huggingface/transformers';
import { z } from 'zod';

import { IpcError, toIpcErrorCode } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import { getWhisperModelDir } from '@/main/lib/paths';
import { findActiveDictationLanguage } from '@/main/services/language';
import type {
    SpeechInitResult,
    SpeechResetSessionResult,
    SpeechStatus,
    SpeechTranscribeResult,
} from '@/schemas/speech';
import { TranscriptionResultSchema, type Transcriber } from '@/schemas/vault';

// Minimal shape of the pipeline internals we need for language detection
/* eslint-disable @typescript-eslint/naming-convention -- property names are @huggingface/transformers' own */
type WhisperInternals = {
    model: {
        generate(opts: Record<string, unknown>): Promise<ArrayLike<{ tolist(): (number | bigint)[] }>>;
        generation_config: { lang_to_id: Record<string, number> };
    };
    processor(audio: Float32Array): Promise<{ input_features: unknown }>;
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the transformers shape */

// Whisper decoder_start_token_id — constant across all Whisper models
const WHISPER_SOT = 50258;

// Below this RMS a chunk is silence or room tone — too weak to detect a language from
const MIN_DETECTION_RMS = 0.005;
const MIN_DETECTION_SAMPLES = 16000;

let pipelineFn: typeof PipelineFn | null = null;
let transcriber: Transcriber | null = null;
let isModelLoading = false;
let isModelReady = false;

let supportedLanguages: Set<string> | null = null;
let sessionLanguage: string | null = null;

export function cleanup(): void {
    transcriber = null;
    isModelReady = false;
    isModelLoading = false;
    supportedLanguages = null;
    sessionLanguage = null;
}

export function register(ipc: IpcMain): void {
    ipc.handle('speech:init', async (): Promise<SpeechInitResult> => initModel());
    ipc.handle('speech:transcribe', async (_event, audioData: unknown): Promise<SpeechTranscribeResult> => {
        const parsed = z.array(z.number()).nonempty().safeParse(audioData);
        if (!parsed.success) return { success: false, error: 'INVALID_ARGUMENTS' };
        return transcribe(parsed.data);
    });
    ipc.handle('speech:getStatus', (): SpeechStatus => getStatus());
    ipc.handle('speech:resetSession', (): SpeechResetSessionResult => resetSession());
}

/**
 * Dynamically import @huggingface/transformers (ESM module from CJS)
 * Same pattern used by ai-service.ts for node-llama-cpp.
 */
async function getTransformers(): Promise<typeof PipelineFn> {
    if (pipelineFn !== null) return pipelineFn;

    const transformers = await import('@huggingface/transformers');

    // Point cache to the bundled model directory
    const cacheDir = getWhisperModelDir();
    transformers.env.cacheDir = cacheDir;
    // No remote downloads — model is already bundled
    transformers.env.allowRemoteModels = false;

    // Verify model files exist before proceeding
    const modelDir = path.join(cacheDir, 'Xenova', 'whisper-base');
    const onnxDir = path.join(modelDir, 'onnx');
    const requiredFiles = [
        path.join(modelDir, 'config.json'),
        path.join(onnxDir, 'encoder_model_quantized.onnx'),
        path.join(onnxDir, 'decoder_model_merged_quantized.onnx'),
    ];
    for (const requiredFile of requiredFiles) {
        if (!existsSync(requiredFile)) {
            log.error('[Speech] Missing required model file:', requiredFile);
            throw new IpcError('NOT_FOUND', `Missing model file: ${path.basename(requiredFile)}`);
        }
    }
    log.info('[Speech] All model files verified at:', modelDir);

    pipelineFn = transformers.pipeline;
    return pipelineFn;
}

async function initModel(): Promise<SpeechInitResult> {
    if (transcriber !== null) return { success: true, message: 'Model already loaded' };
    if (isModelLoading) return { success: false, error: 'BUSY' };

    isModelLoading = true;

    try {
        const pipeline = await getTransformers();

        const loaded: unknown = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
            revision: 'main',
            dtype: 'q8',
        });
        if (!isTranscriber(loaded)) throw new IpcError('INVALID_STATE', 'The speech pipeline is not callable');
        transcriber = loaded;

        supportedLanguages = readSupportedLanguages();
        isModelReady = true;
        isModelLoading = false;

        log.info('[Speech] Whisper model loaded successfully');
        return { success: true, message: 'Whisper model loaded' };
    } catch (error) {
        isModelLoading = false;
        isModelReady = false;
        log.error('[Speech] Failed to load Whisper model:', error);

        return { success: false, error: toIpcErrorCode(error) };
    }
}

/** The `<|xx|>` keys of the model's own language table, as bare codes. */
function readSupportedLanguages(): Set<string> | null {
    if (!isWhisperInternals(transcriber)) return null;
    try {
        const langToId = transcriber.model.generation_config.lang_to_id;
        const codes = new Set<string>();
        for (const langKey of Object.keys(langToId)) {
            const match = /\|(.+)\|/.exec(langKey);
            if (match?.[1] !== undefined) codes.add(match[1]);
        }
        return codes.size > 0 ? codes : null;
    } catch (err) {
        log.warn('[Speech] Could not read model language table:', err);
        return null;
    }
}

async function resolveLanguage(float32Audio: Float32Array): Promise<string | null> {
    const declared = (await findActiveDictationLanguage())?.toLowerCase() ?? null;
    if (declared !== null && supportedLanguages?.has(declared) === true) return declared;
    if (sessionLanguage !== null) return sessionLanguage;
    // A guess made on silence would poison the whole session — wait for a chunk with speech in it
    if (!hasSpeechSignal(float32Audio)) return null;

    if (declared !== null) {
        log.warn('[Speech] Locale declares an unsupported dictation language, detecting instead:', declared);
    }
    sessionLanguage = await detectLanguage(float32Audio);
    return sessionLanguage;
}

/** True when the chunk is long and loud enough to be worth detecting a language from. */
function hasSpeechSignal(float32Audio: Float32Array): boolean {
    if (float32Audio.length < MIN_DETECTION_SAMPLES) return false;
    let sumSquares = 0;
    for (const sample of float32Audio) sumSquares += sample * sample;
    return Math.sqrt(sumSquares / float32Audio.length) >= MIN_DETECTION_RMS;
}

/**
 * Detects the spoken language by running a single decoder step with only the
 * start-of-transcript token and reading whichever language token the model predicts.
 * Called once per model session; result is cached in `detectedLanguage`.
 *
 * v3.8.1 of @huggingface/transformers does not implement automatic language detection
 * (the relevant code path is unimplemented upstream and defaults to English), so we do it
 * manually here via the model's internal generate API.
 */
async function detectLanguage(float32Audio: Float32Array): Promise<string | null> {
    if (!isWhisperInternals(transcriber)) return null;
    const pipe = transcriber;
    try {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- the processor's own output key
        const { input_features } = await pipe.processor(float32Audio);

        // max_new_tokens: 1 — generate only the language token after [<|startoftranscript|>]
        const outputs = await pipe.model.generate({
            inputs: input_features,
            decoder_input_ids: [WHISPER_SOT],
            max_new_tokens: 1,
        });

        // outputs[0] = [WHISPER_SOT, langToken]
        const tokens = outputs[0]?.tolist() ?? [];
        const langToken = Number(tokens[1]);

        const langToId = pipe.model.generation_config.lang_to_id;
        for (const [langKey, tokenId] of Object.entries(langToId)) {
            if (tokenId !== langToken) continue;
            const match = /\|(.+)\|/.exec(langKey);
            if (match?.[1] === undefined) continue;
            log.info('[Speech] Language detected:', match[1]);
            return match[1];
        }
        return null;
    } catch (err) {
        log.warn('[Speech] Language detection failed, falling back to model default:', err);
        return null;
    }
}

async function transcribe(audioData: number[]): Promise<SpeechTranscribeResult> {
    if (transcriber === null || !isModelReady) return { success: false, error: 'MODEL_NOT_LOADED' };

    try {
        const float32Audio = new Float32Array(audioData);

        const language = await resolveLanguage(float32Audio);

        const options: Record<string, unknown> = language !== null ? { language } : {};
        const result = TranscriptionResultSchema.parse(await transcriber(float32Audio, options));
        const text = typeof result === 'string' ? result : result.text;
        return { success: true, text: text.trim() };
    } catch (error) {
        log.error('[Speech] Transcription error:', error);
        return { success: false, error: toIpcErrorCode(error) };
    }
}

function getStatus(): SpeechStatus {
    return { isModelLoaded: isModelReady, isModelLoading };
}

/** Clears the detected-language fallback so the next dictation run starts fresh. */
function resetSession(): SpeechResetSessionResult {
    sessionLanguage = null;
    return { success: true };
}

function isTranscriber(value: unknown): value is Transcriber {
    return typeof value === 'function';
}

/** The pipeline exposes its model and processor; a stand-in or another backend may not. */
function isWhisperInternals(value: unknown): value is Transcriber & WhisperInternals {
    if (typeof value !== 'function' || !('model' in value) || !('processor' in value)) return false;
    const { model, processor } = value;
    if (typeof processor !== 'function' || typeof model !== 'object' || model === null) return false;
    if (!('generate' in model) || typeof model.generate !== 'function' || !('generation_config' in model)) return false;
    const config = model.generation_config;
    if (typeof config !== 'object' || config === null || !('lang_to_id' in config)) return false;
    return typeof config.lang_to_id === 'object' && config.lang_to_id !== null;
}
