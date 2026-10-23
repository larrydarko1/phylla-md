import fs from 'fs';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply } from './test-utils';
import { cleanup, register } from '@/main/services/speech';

const PATHS = vi.hoisted(() => {
    const { join } = process.getBuiltinModule('path');
    const { tmpdir } = process.getBuiltinModule('os');
    const modelRoot = join(tmpdir(), `phylla-speech-test-${process.pid}-${Date.now()}`);
    return { modelRoot };
});

const mockTranscriber = vi.hoisted(() =>
    vi.fn<(audio: Float32Array, options?: Record<string, unknown>) => Promise<unknown>>(),
);
const mockPipeline = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const mockFindActiveDictationLanguage = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock('electron', () => ({}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/main/lib/paths', () => ({
    getWhisperModelDir: () => PATHS.modelRoot,
}));

vi.mock('@huggingface/transformers', () => ({
    env: { cacheDir: '', allowRemoteModels: true },
    pipeline: mockPipeline,
}));

vi.mock('@/main/services/language', () => ({
    findActiveDictationLanguage: mockFindActiveDictationLanguage,
}));

const LOUD_CHUNK = Array.from({ length: 16000 }, () => 0.3);
const SILENT_CHUNK = Array.from({ length: 16000 }, () => 0);

function createModelFiles() {
    const modelDir = path.join(PATHS.modelRoot, 'Xenova', 'whisper-base');
    const onnxDir = path.join(modelDir, 'onnx');
    fs.mkdirSync(onnxDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'config.json'), '{}');
    fs.writeFileSync(path.join(onnxDir, 'encoder_model_quantized.onnx'), '');
    fs.writeFileSync(path.join(onnxDir, 'decoder_model_merged_quantized.onnx'), '');
}

/** Gives the stand-in pipeline the model and processor detection reads; returns them to assert on. */
function attachModelInternals(detectedToken = 50274) {
    const internals = {
        model: {
            generation_config: { lang_to_id: { '<|en|>': 50259, '<|it|>': 50274 } },
            generate: vi.fn().mockResolvedValue([{ tolist: () => [50258, detectedToken] }]),
        },
        processor: vi.fn().mockResolvedValue({ input_features: {} }),
    };
    Object.assign(mockTranscriber, internals);
    return internals;
}

function lastTranscribeOptions() {
    const calls = mockTranscriber.mock.calls;
    return calls[calls.length - 1]?.[1];
}

beforeEach(() => {
    cleanup();
    fs.rmSync(PATHS.modelRoot, { recursive: true, force: true });
    mockTranscriber.mockReset();
    mockTranscriber.mockResolvedValue({ text: 'text' });
    Reflect.deleteProperty(mockTranscriber, 'model');
    Reflect.deleteProperty(mockTranscriber, 'processor');
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(mockTranscriber);
    mockFindActiveDictationLanguage.mockReset();
    mockFindActiveDictationLanguage.mockResolvedValue(null);
});

afterEach(() => {
    fs.rmSync(PATHS.modelRoot, { recursive: true, force: true });
});

describe('cleanup', () => {
    it('runs without throwing', () => {
        expect(() => cleanup()).not.toThrow();
    });
});

describe('speech:getStatus', () => {
    it('reports not loaded and not loading on fresh state', async () => {
        const handlers = createFakeIpc();
        register(handlers);
        const status = z
            .object({ isModelLoaded: z.boolean(), isModelLoading: z.boolean() })
            .parse(await handlers.invoke('speech:getStatus'));
        expect(status.isModelLoaded).toBe(false);
        expect(status.isModelLoading).toBe(false);
    });
});

describe('speech:transcribe', () => {
    it('returns failure for an empty audio array', async () => {
        const handlers = createFakeIpc();
        register(handlers);
        const result = readReply(await handlers.invoke('speech:transcribe', []));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('returns failure for non-array audio data', async () => {
        const handlers = createFakeIpc();
        register(handlers);
        const result = readReply(await handlers.invoke('speech:transcribe', 'blob'));
        expect(result.success).toBe(false);
    });

    it('returns failure when the model is not loaded', async () => {
        const handlers = createFakeIpc();
        register(handlers);
        const result = readReply(await handlers.invoke('speech:transcribe', [0.1, 0.2]));
        expect(result.success).toBe(false);
        expect(result.error).toBe('MODEL_NOT_LOADED');
    });
});

describe('speech:init', () => {
    it('returns failure when a required model file is missing', async () => {
        const handlers = createFakeIpc();
        register(handlers);
        const result = readReply(await handlers.invoke('speech:init'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('NOT_FOUND');
    });

    it('loads model successfully when all files exist', async () => {
        createModelFiles();
        mockTranscriber.mockResolvedValue({ text: 'hello' });
        const handlers = createFakeIpc();
        register(handlers);
        const result = z
            .object({ success: z.boolean(), message: z.string().optional() })
            .parse(await handlers.invoke('speech:init'));
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/loaded/i);
    });

    it('returns "already loaded" when called twice', async () => {
        createModelFiles();
        const handlers = createFakeIpc();
        register(handlers);
        await handlers.invoke('speech:init');
        const result = z
            .object({ success: z.boolean(), message: z.string().optional() })
            .parse(await handlers.invoke('speech:init'));
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/already loaded/i);
    });

    it('transcribes audio successfully when model is loaded', async () => {
        createModelFiles();
        mockTranscriber.mockResolvedValue({ text: 'transcribed text' });
        const handlers = createFakeIpc();
        register(handlers);
        await handlers.invoke('speech:init');
        const result = z
            .object({ success: z.boolean(), text: z.string().optional() })
            .parse(await handlers.invoke('speech:transcribe', [0.1, 0.2, 0.3]));
        expect(result.success).toBe(true);
        expect(result.text).toBe('transcribed text');
    });

    it('transcribes audio when result is a plain string', async () => {
        createModelFiles();
        mockTranscriber.mockResolvedValue('plain text result');
        const handlers = createFakeIpc();
        register(handlers);
        await handlers.invoke('speech:init');
        const result = z
            .object({ success: z.boolean(), text: z.string().optional() })
            .parse(await handlers.invoke('speech:transcribe', [0.1, 0.2]));
        expect(result.success).toBe(true);
        expect(result.text).toBe('plain text result');
    });

    it('returns failure when transcription throws', async () => {
        createModelFiles();
        mockTranscriber.mockRejectedValueOnce(new Error('transcription error'));
        const handlers = createFakeIpc();
        register(handlers);
        await handlers.invoke('speech:init');
        const result = z
            .object({ success: z.boolean(), error: z.string().optional() })
            .parse(await handlers.invoke('speech:transcribe', [0.1]));
        expect(result.success).toBe(false);
    });

    it('returns "model is currently loading" when init is called while loading', async () => {
        createModelFiles();
        let resolvePipeline!: (v: typeof mockTranscriber) => void;
        mockPipeline.mockImplementationOnce(
            () =>
                new Promise<typeof mockTranscriber>((r) => {
                    resolvePipeline = r;
                }),
        );

        const handlers = createFakeIpc();
        register(handlers);

        const firstInitPromise = handlers.invoke('speech:init');
        const result = readReply(await handlers.invoke('speech:init'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('BUSY');

        resolvePipeline(mockTranscriber);
        await firstInitPromise;
    });
});

describe('dictation language', () => {
    async function initReady() {
        createModelFiles();
        const handlers = createFakeIpc();
        register(handlers);
        await handlers.invoke('speech:init');
        return handlers;
    }

    it('uses the language declared by the active locale', async () => {
        mockFindActiveDictationLanguage.mockResolvedValue('it');
        attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(lastTranscribeOptions()).toEqual({ language: 'it' });
    });

    it('does not run detection when the locale declares a supported language', async () => {
        mockFindActiveDictationLanguage.mockResolvedValue('it');
        const internals = attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(internals.processor).not.toHaveBeenCalled();
    });

    it('accepts a declared language regardless of case', async () => {
        mockFindActiveDictationLanguage.mockResolvedValue('IT');
        attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(lastTranscribeOptions()).toEqual({ language: 'it' });
    });

    it('falls back to detection when the locale declares a language the model lacks', async () => {
        mockFindActiveDictationLanguage.mockResolvedValue('eo');
        attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(lastTranscribeOptions()).toEqual({ language: 'it' });
    });

    it('detects when the locale declares nothing', async () => {
        attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(lastTranscribeOptions()).toEqual({ language: 'it' });
    });

    it('does not detect a language from a silent chunk', async () => {
        const internals = attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', SILENT_CHUNK);

        expect(internals.model.generate).not.toHaveBeenCalled();
        expect(lastTranscribeOptions()).toEqual({});
    });

    it('detects once and reuses the result for the rest of the session', async () => {
        const internals = attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);
        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(internals.model.generate).toHaveBeenCalledTimes(1);
        expect(lastTranscribeOptions()).toEqual({ language: 'it' });
    });

    it('detects again after the session is reset', async () => {
        const internals = attachModelInternals();
        const handlers = await initReady();

        await handlers.invoke('speech:transcribe', LOUD_CHUNK);
        await handlers.invoke('speech:resetSession');
        await handlers.invoke('speech:transcribe', LOUD_CHUNK);

        expect(internals.model.generate).toHaveBeenCalledTimes(2);
    });

    it('reports success from speech:resetSession', async () => {
        const handlers = await initReady();
        expect(await handlers.invoke('speech:resetSession')).toEqual({ success: true });
    });
});
