import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply } from './test-utils';
import { register, cleanup } from '@/main/services/ai';

vi.mock('fs/promises', async () => {
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    return {
        default: {
            ...actual,
            mkdir: vi.fn().mockResolvedValue(undefined),
        },
    };
});

vi.mock('electron', () => ({
    shell: { openPath: vi.fn().mockResolvedValue('') },
}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/main/lib/paths', () => ({
    DEFAULT_MODELS_DIR: '/fake/models',
    PHYLLA_HOME: '/fake/phylla-home',
}));

vi.mock('@/main/services/systemPrompt', () => ({
    getActiveSystemPrompt: vi.fn().mockResolvedValue(''),
}));

let ipc: ReturnType<typeof createFakeIpc>;

beforeEach(() => {
    ipc = createFakeIpc();
    register(ipc, () => null);
});

describe('cleanup', () => {
    it('resolves without error when no model is loaded', async () => {
        await expect(cleanup()).resolves.toBeUndefined();
    });
});

describe('ai:getStatus', () => {
    it('reports unloaded state on initial call', async () => {
        const status = z
            .object({
                isModelLoaded: z.boolean(),
                currentModelPath: z.string().nullable(),
                currentModelName: z.string().nullable(),
                isGenerating: z.boolean(),
                modelsDir: z.string(),
            })
            .parse(await ipc.invoke('ai:getStatus'));
        expect(status.isModelLoaded).toBe(false);
        expect(status.currentModelPath).toBeNull();
        expect(status.currentModelName).toBeNull();
        expect(status.isGenerating).toBe(false);
        expect(status.modelsDir).toBe('/fake/models');
    });
});

describe('ai:listModels', () => {
    it('returns an empty models list when the models directory does not exist', async () => {
        const result = z
            .object({ success: z.boolean(), models: z.array(z.unknown()), modelsDir: z.string() })
            .parse(await ipc.invoke('ai:listModels'));
        expect(result.success).toBe(true);
        expect(result.models).toHaveLength(0);
        expect(result.modelsDir).toBe('/fake/models');
    });
});

describe('ai:loadModel', () => {
    it('returns failure for non-string modelPath', async () => {
        const result = readReply(await ipc.invoke('ai:loadModel', 123));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('returns failure for an empty modelPath', async () => {
        const result = readReply(await ipc.invoke('ai:loadModel', ''));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('returns failure for a model path outside the models directory', async () => {
        const result = readReply(await ipc.invoke('ai:loadModel', '/etc/some-model.gguf'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('ACCESS_DENIED');
    });
});

describe('ai:chat', () => {
    it('returns failure for non-string userMessage', async () => {
        const result = readReply(await ipc.invoke('ai:chat', 123, ''));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('returns failure for an empty userMessage', async () => {
        const result = readReply(await ipc.invoke('ai:chat', '', ''));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });
});

describe('ai:stopChat', () => {
    it('returns failure when no generation is in progress', async () => {
        const result = readReply(await ipc.invoke('ai:stopChat'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_STATE');
    });
});

describe('ai:resetChat', () => {
    it('returns failure when no model is loaded', async () => {
        const result = readReply(await ipc.invoke('ai:resetChat'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('MODEL_NOT_LOADED');
    });
});

describe('ai:loadModel (file not found)', () => {
    it('returns failure when model file does not exist inside models directory', async () => {
        const result = readReply(await ipc.invoke('ai:loadModel', '/fake/models/nonexistent.gguf'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('NOT_FOUND');
    });
});

describe('ai:openPhyllaDir', () => {
    it('calls shell.openPath with PHYLLA_HOME and returns success', async () => {
        const { shell } = await import('electron');
        const result = readReply(await ipc.invoke('ai:openPhyllaDir'));
        expect(result.success).toBe(true);
        expect(shell.openPath).toHaveBeenCalled();
    });
});

describe('ai:restoreChatHistory', () => {
    it('returns failure for non-array messages', async () => {
        const result = readReply(await ipc.invoke('ai:restoreChatHistory', 'not an array'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('returns failure for messages with invalid role', async () => {
        const result = readReply(await ipc.invoke('ai:restoreChatHistory', [{ role: 'system', content: 'hi' }]));
        expect(result.success).toBe(false);
    });

    it('succeeds with an empty messages array', async () => {
        const result = readReply(await ipc.invoke('ai:restoreChatHistory', []));
        expect(result.success).toBe(true);
    });

    it('succeeds with valid user and assistant messages', async () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ];
        const result = readReply(await ipc.invoke('ai:restoreChatHistory', messages));
        expect(result.success).toBe(true);
    });
});
