import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useAIModel } from '@/renderer/composables/ai/useAIModel';
import type { AiModelInfo, AiStatus } from '@/schemas/ai';
import type { ChatMessage } from '@/schemas/chat';
import type { ElectronAPI } from '@/schemas/electron';

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'ai.select_model': 'Select a model...',
            };
            return translations[key] ?? key;
        },
    }),
}));

const mockAiListModels = vi.fn();
const mockAiLoadModel = vi.fn();
const mockAiUnloadModel = vi.fn();
const mockAiGetStatus = vi.fn();
const mockAiRestoreChatHistory = vi.fn<ElectronAPI['aiRestoreChatHistory']>().mockResolvedValue({ success: true });
const mockAiOpenPhyllaDir = vi.fn().mockResolvedValue(undefined);

function makeModel(overrides: Partial<AiModelInfo> = {}): AiModelInfo {
    return {
        name: 'test.gguf',
        path: '/models/test.gguf',
        size: 1_000_000,
        sizeFormatted: '1 MB',
        modified: new Date().toISOString(),
        ...overrides,
    };
}

function makeStatus(overrides: Partial<AiStatus> = {}): AiStatus {
    return {
        isModelLoaded: false,
        currentModelPath: null,
        currentModelName: null,
        isGenerating: false,
        modelsDir: '/models',
        contextTokens: 0,
        contextSize: 4096,
        ...overrides,
    };
}

Object.defineProperty(globalThis, 'window', {
    value: {
        electronAPI: {
            aiListModels: mockAiListModels,
            aiLoadModel: mockAiLoadModel,
            aiUnloadModel: mockAiUnloadModel,
            aiGetStatus: mockAiGetStatus,
            aiRestoreChatHistory: mockAiRestoreChatHistory,
            aiOpenPhyllaDir: mockAiOpenPhyllaDir,
            log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
        },
    },
    writable: true,
});

describe('useAIModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAiGetStatus.mockResolvedValue(makeStatus());
        mockAiListModels.mockResolvedValue({ success: true, models: [] });
        mockAiLoadModel.mockResolvedValue({ success: true });
        mockAiUnloadModel.mockResolvedValue({ success: true });
    });

    describe('initial state', () => {
        it('starts with model not loaded', () => {
            const m = useAIModel();
            expect(m.status.value.isModelLoaded).toBe(false);
        });

        it('starts with empty model list', () => {
            const m = useAIModel();
            expect(m.availableModels.value).toHaveLength(0);
        });

        it('isReady is false when model is not loaded', () => {
            const m = useAIModel();
            expect(m.isReady.value).toBe(false);
        });

        it('isAnyGenerating is false initially', () => {
            const m = useAIModel();
            expect(m.isAnyGenerating.value).toBe(false);
        });
    });

    describe('previousModelMatch', () => {
        it('returns null when lastUsedModelName is not set', () => {
            const m = useAIModel();
            m.availableModels.value = [makeModel()];
            expect(m.previousModelMatch.value).toBeNull();
        });

        it('returns null when model is currently loaded', () => {
            const m = useAIModel();
            m.lastUsedModelName.value = 'test.gguf';
            m.status.value = makeStatus({ isModelLoaded: true });
            m.availableModels.value = [makeModel()];
            expect(m.previousModelMatch.value).toBeNull();
        });

        it('matches by exact name', () => {
            const m = useAIModel();
            const model = makeModel({ name: 'llama.gguf', path: '/models/llama.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'llama.gguf';
            expect(m.previousModelMatch.value).toEqual(model);
        });

        it('matches by path suffix', () => {
            const m = useAIModel();
            const model = makeModel({ name: 'sub/llama.gguf', path: '/models/sub/llama.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'llama.gguf';
            expect(m.previousModelMatch.value).toEqual(model);
        });

        it('returns null when no model matches', () => {
            const m = useAIModel();
            m.availableModels.value = [makeModel({ name: 'other.gguf' })];
            m.lastUsedModelName.value = 'missing.gguf';
            expect(m.previousModelMatch.value).toBeNull();
        });
    });

    describe('selectedModelLabel', () => {
        it('shows placeholder when no model selected', () => {
            const m = useAIModel();
            expect(m.selectedModelLabel.value).toBe('Select a model...');
        });

        it('shows model name when a model is selected', () => {
            const m = useAIModel();
            const model = makeModel({ name: 'llama.gguf', path: '/models/llama.gguf' });
            m.availableModels.value = [model];
            m.selectedModelPath.value = '/models/llama.gguf';
            expect(m.selectedModelLabel.value).toBe('llama.gguf');
        });

        it('truncates long model names at 30 characters', () => {
            const m = useAIModel();
            const longName = 'a-very-long-model-name-that-exceeds-thirty-chars.gguf';
            const model = makeModel({ name: longName, path: '/models/long.gguf' });
            m.availableModels.value = [model];
            m.selectedModelPath.value = '/models/long.gguf';
            expect(m.selectedModelLabel.value).toBe(`${longName.slice(0, 30)}...`);
        });

        it('shows placeholder when selected path not in model list', () => {
            const m = useAIModel();
            m.availableModels.value = [];
            m.selectedModelPath.value = '/models/ghost.gguf';
            expect(m.selectedModelLabel.value).toBe('Select a model...');
        });
    });

    describe('selectModel', () => {
        it('sets selectedModelPath', () => {
            const m = useAIModel();
            const model = makeModel({ path: '/models/llama.gguf' });
            m.selectModel(model);
            expect(m.selectedModelPath.value).toBe('/models/llama.gguf');
        });

        it('closes the dropdown', () => {
            const m = useAIModel();
            m.showDropdown.value = true;
            m.selectModel(makeModel());
            expect(m.showDropdown.value).toBe(false);
        });
    });

    describe('loadModel', () => {
        it('returns error when no path is provided', async () => {
            const m = useAIModel();
            m.selectedModelPath.value = '';
            const result = await m.loadModel();
            expect(result.success).toBe(false);
            expect(result.error).toBe('INVALID_ARGUMENTS');
            expect(mockAiLoadModel).not.toHaveBeenCalled();
        });

        it('calls aiLoadModel with the given path', async () => {
            const m = useAIModel();
            await m.loadModel('/models/test.gguf');
            expect(mockAiLoadModel).toHaveBeenCalledWith('/models/test.gguf');
        });

        it('uses selectedModelPath when no path argument given', async () => {
            const m = useAIModel();
            m.selectedModelPath.value = '/models/selected.gguf';
            await m.loadModel();
            expect(mockAiLoadModel).toHaveBeenCalledWith('/models/selected.gguf');
        });

        it('sets isLoading to true during load and false after', async () => {
            const m = useAIModel();
            let capturedDuring = false;
            mockAiLoadModel.mockImplementation(async () => {
                capturedDuring = m.isLoading.value;
                return { success: true };
            });
            await m.loadModel('/models/test.gguf');
            expect(capturedDuring).toBe(true);
            expect(m.isLoading.value).toBe(false);
        });

        it('calls refreshStatus on success', async () => {
            const m = useAIModel();
            await m.loadModel('/models/test.gguf');
            expect(mockAiGetStatus).toHaveBeenCalledOnce();
        });

        it('returns error message on failure', async () => {
            const m = useAIModel();
            mockAiLoadModel.mockResolvedValue({ success: false, error: 'File not found' });
            const result = await m.loadModel('/models/missing.gguf');
            expect(result.success).toBe(false);
            expect(result.error).toBe('File not found');
        });

        it('clears isLoading even when load fails', async () => {
            const m = useAIModel();
            mockAiLoadModel.mockResolvedValue({ success: false, error: 'Oops' });
            await m.loadModel('/models/test.gguf');
            expect(m.isLoading.value).toBe(false);
        });
    });

    describe('unloadModel', () => {
        it('saves currentModelName to lastUsedModelName before unloading', async () => {
            const m = useAIModel();
            m.status.value = makeStatus({ currentModelName: 'current.gguf', isModelLoaded: true });
            await m.unloadModel();
            expect(m.lastUsedModelName.value).toBe('current.gguf');
        });

        it('calls aiUnloadModel', async () => {
            const m = useAIModel();
            await m.unloadModel();
            expect(mockAiUnloadModel).toHaveBeenCalledOnce();
        });

        it('calls refreshStatus after unloading', async () => {
            const m = useAIModel();
            await m.unloadModel();
            expect(mockAiGetStatus).toHaveBeenCalledOnce();
        });
    });

    describe('loadPreviousModel', () => {
        it('returns error when there is no previous model match', async () => {
            const m = useAIModel();
            const result = await m.loadPreviousModel([], { hasActiveConversation: false });
            expect(result.success).toBe(false);
        });

        it('restores chat history when model loads and has active conversation with messages', async () => {
            const m = useAIModel();
            const model = makeModel({ name: 'prev.gguf', path: '/models/prev.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'prev.gguf';

            const history: ChatMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' },
            ];
            await m.loadPreviousModel(history, { hasActiveConversation: true });

            expect(mockAiRestoreChatHistory).toHaveBeenCalledWith([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' },
            ]);
        });

        it('does not restore history when hasActiveConversation is false', async () => {
            const m = useAIModel();
            const model = makeModel({ name: 'prev.gguf', path: '/models/prev.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'prev.gguf';

            await m.loadPreviousModel([{ role: 'user', content: 'Hi' }], { hasActiveConversation: false });
            expect(mockAiRestoreChatHistory).not.toHaveBeenCalled();
        });

        it('does not restore history when chat history is empty', async () => {
            const m = useAIModel();
            const model = makeModel({ name: 'prev.gguf', path: '/models/prev.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'prev.gguf';

            await m.loadPreviousModel([], { hasActiveConversation: true });
            expect(mockAiRestoreChatHistory).not.toHaveBeenCalled();
        });

        it('strips system messages from history restore', async () => {
            const m = useAIModel();
            const model = makeModel({ name: 'prev.gguf', path: '/models/prev.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'prev.gguf';

            const history: ChatMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'system', content: 'Compacted.' },
                { role: 'assistant', content: 'Hi' },
            ];
            await m.loadPreviousModel(history, { hasActiveConversation: true });

            const restored = mockAiRestoreChatHistory.mock.calls[0]![0];
            expect(restored.every((m) => m.role !== 'system')).toBe(true);
        });
    });

    describe('refreshModels', () => {
        it('populates availableModels on success', async () => {
            const m = useAIModel();
            const models = [makeModel({ name: 'a.gguf' }), makeModel({ name: 'b.gguf' })];
            mockAiListModels.mockResolvedValue({ success: true, models });
            await m.refreshModels();
            expect(m.availableModels.value).toEqual(models);
        });

        it('does not update models on failure', async () => {
            const m = useAIModel();
            m.availableModels.value = [makeModel()];
            mockAiListModels.mockResolvedValue({ success: false, error: 'Disk error' });
            await m.refreshModels();
            expect(m.availableModels.value).toHaveLength(1); // unchanged
        });
    });

    describe('openModelsFolder', () => {
        it('calls aiOpenPhyllaDir', async () => {
            const m = useAIModel();
            await m.openModelsFolder();
            expect(mockAiOpenPhyllaDir).toHaveBeenCalledOnce();
        });

        it('logs error when aiOpenPhyllaDir throws', async () => {
            const m = useAIModel();
            mockAiOpenPhyllaDir.mockRejectedValueOnce(new Error('permission denied'));
            await expect(m.openModelsFolder()).resolves.not.toThrow();
            expect(window.electronAPI.log.error).toHaveBeenCalled();
        });
    });

    describe('unloadModel (error path)', () => {
        it('logs error when aiUnloadModel throws', async () => {
            const m = useAIModel();
            mockAiUnloadModel.mockRejectedValueOnce(new Error('model busy'));
            await expect(m.unloadModel()).resolves.not.toThrow();
            expect(window.electronAPI.log.error).toHaveBeenCalled();
        });
    });

    describe('loadPreviousModel (error path)', () => {
        it('logs error when aiRestoreChatHistory throws', async () => {
            const m = useAIModel();
            const model = makeModel({ name: 'prev.gguf', path: '/models/prev.gguf' });
            m.availableModels.value = [model];
            m.lastUsedModelName.value = 'prev.gguf';
            mockAiRestoreChatHistory.mockRejectedValueOnce(new Error('restore failed'));

            await expect(
                m.loadPreviousModel([{ role: 'user', content: 'Hi' }], { hasActiveConversation: true }),
            ).resolves.not.toThrow();
            expect(window.electronAPI.log.error).toHaveBeenCalled();
        });
    });

    describe('truncate', () => {
        it('returns string unchanged when within limit', () => {
            const m = useAIModel();
            expect(m.truncate('short', 10)).toBe('short');
        });

        it('truncates and appends ellipsis when over limit', () => {
            const m = useAIModel();
            expect(m.truncate('hello world', 5)).toBe('hello...');
        });

        it('does not truncate at exactly the limit', () => {
            const m = useAIModel();
            expect(m.truncate('exact', 5)).toBe('exact');
        });
    });
});
