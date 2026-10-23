/**
 * useAIModel — manages model discovery, loading/unloading, and status polling via IPC.
 */

import { ref, shallowRef, computed, onMounted, onUnmounted, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { toModelTurns } from '@/renderer/utils/chat';
import type { AiModelInfo, AiStatus } from '@/schemas/ai';
import type { ChatMessage } from '@/schemas/chat';
import type { IpcErrorCode } from '@/schemas/errors';

type UseAIModelReturn = {
    status: Ref<AiStatus>;
    availableModels: ShallowRef<AiModelInfo[]>;
    isLoading: Ref<boolean>;
    selectedModelPath: Ref<string>;
    lastUsedModelName: Ref<string | null>;
    showDropdown: Ref<boolean>;
    dropdownRef: Ref<HTMLElement | null>;
    dropdownPosition: Ref<{ top: string; left: string; minWidth: string }>;
    previousModelMatch: ComputedRef<AiModelInfo | null>;
    isReady: ComputedRef<boolean>;
    isAnyGenerating: ComputedRef<boolean>;
    selectedModelLabel: ComputedRef<string>;
    truncate: (text: string, max: number) => string;
    toggleDropdown: () => void;
    selectModel: (model: AiModelInfo) => void;
    refreshModels: () => Promise<void>;
    refreshStatus: () => Promise<void>;
    loadModel: (path?: string) => Promise<{ success: boolean; error?: IpcErrorCode }>;
    unloadModel: () => Promise<void>;
    loadPreviousModel: (
        chatHistory: Pick<ChatMessage, 'role' | 'content'>[],
        { hasActiveConversation }: { hasActiveConversation: boolean },
    ) => Promise<{ success: boolean; error?: IpcErrorCode }>;
    openModelsFolder: () => Promise<void>;
};

export function useAIModel(): UseAIModelReturn {
    const { t } = useI18n();

    const status = ref<AiStatus>({
        isModelLoaded: false,
        currentModelPath: null,
        currentModelName: null,
        isGenerating: false,
        modelsDir: '',
        contextTokens: 0,
        contextSize: 0,
    });
    const availableModels = shallowRef<AiModelInfo[]>([]);
    const isLoading = ref(false);
    const selectedModelPath = ref('');
    const lastUsedModelName = ref<string | null>(null);

    // Dropdown
    const showDropdown = ref(false);
    const dropdownRef = ref<HTMLElement | null>(null);
    const dropdownPosition = ref<{ top: string; left: string; minWidth: string }>({
        top: '0px',
        left: '0px',
        minWidth: '0px',
    });

    const previousModelMatch = computed(
        (): { name: string; path: string; size: number; sizeFormatted: string; modified: string } | null => {
            const modelName = lastUsedModelName.value;
            if (modelName === null || modelName === '' || status.value.isModelLoaded) {
                return null;
            }
            return (
                availableModels.value.find((m): boolean => m.name === modelName || m.path.endsWith(modelName)) ?? null
            );
        },
    );
    const isReady = computed((): boolean => status.value.isModelLoaded);
    const isAnyGenerating = computed((): boolean => status.value.isGenerating);

    const selectedModelLabel = computed((): string => {
        if (selectedModelPath.value === '') {
            return t('ai.select_model');
        }
        const model = availableModels.value.find((m): boolean => m.path === selectedModelPath.value);
        return model !== undefined ? truncate(model.name, 30) : t('ai.select_model');
    });

    function truncate(text: string, max: number): string {
        return text.length > max ? `${text.slice(0, max)}...` : text;
    }

    function toggleDropdown(): void {
        if (showDropdown.value) {
            showDropdown.value = false;
            return;
        }
        if (dropdownRef.value !== null) {
            const rect = dropdownRef.value.getBoundingClientRect();
            const menuWidth = Math.min(rect.width + 60, window.innerWidth - rect.left - 12);
            dropdownPosition.value = {
                top: `${rect.bottom + 4}px`,
                left: `${rect.left}px`,
                minWidth: `${menuWidth}px`,
            };
        }
        showDropdown.value = true;
    }

    function selectModel(model: AiModelInfo): void {
        selectedModelPath.value = model.path;
        showDropdown.value = false;
    }

    function handleDropdownClickOutside(event: MouseEvent): void {
        if (dropdownRef.value !== null && !(event.target instanceof Node && dropdownRef.value.contains(event.target))) {
            showDropdown.value = false;
        }
    }

    async function refreshModels(): Promise<void> {
        try {
            const result = await window.electronAPI.aiListModels();
            if (result.success) availableModels.value = result.models;
        } catch (error) {
            window.electronAPI.log.error('Failed to list models:', error);
        }
    }

    async function refreshStatus(): Promise<void> {
        try {
            status.value = await window.electronAPI.aiGetStatus();
        } catch (error) {
            window.electronAPI.log.error('Failed to get AI status:', error);
        }
    }

    /** Load a model by path (defaults to selectedModelPath). Caller handles post-load orchestration. */
    async function loadModel(
        path: string = selectedModelPath.value,
    ): Promise<{ success: boolean; error?: IpcErrorCode }> {
        if (path === '') {
            return { success: false, error: 'INVALID_ARGUMENTS' };
        }
        isLoading.value = true;
        try {
            const result = await window.electronAPI.aiLoadModel(path);
            if (result.success) {
                await refreshStatus();
                return { success: true };
            }
            return { success: false, ...(result.error === undefined ? {} : { error: result.error }) };
        } catch (error) {
            window.electronAPI.log.error('Failed to load model:', error);
            return { success: false, error: 'UNKNOWN' };
        } finally {
            isLoading.value = false;
        }
    }

    /** Bare unload — caller must stop generation and save conversation before calling. */
    async function unloadModel(): Promise<void> {
        try {
            if (status.value.currentModelName !== null && status.value.currentModelName !== '') {
                lastUsedModelName.value = status.value.currentModelName;
            }
            await window.electronAPI.aiUnloadModel();
            await refreshStatus();
            if (previousModelMatch.value !== null) {
                selectedModelPath.value = previousModelMatch.value.path;
            }
        } catch (error) {
            window.electronAPI.log.error('Failed to unload model:', error);
        }
    }

    /**
     * Load the previously used model and optionally restore chat history.
     * Caller handles `startNewConversation` if there was no active conversation.
     */
    async function loadPreviousModel(
        chatHistory: Pick<ChatMessage, 'role' | 'content'>[],
        { hasActiveConversation }: { hasActiveConversation: boolean },
    ): Promise<{ success: boolean; error?: IpcErrorCode }> {
        const previousPath = previousModelMatch.value !== null ? previousModelMatch.value.path : '';
        const result = await loadModel(previousPath);
        if (result.success && hasActiveConversation && chatHistory.length > 0) {
            try {
                await window.electronAPI.aiRestoreChatHistory(toModelTurns(chatHistory));
            } catch (err) {
                window.electronAPI.log.error('Failed to restore chat history:', err);
            }
        }
        return result;
    }

    async function openModelsFolder(): Promise<void> {
        try {
            await window.electronAPI.aiOpenPhyllaDir();
        } catch (error) {
            window.electronAPI.log.error('Failed to open models dir:', error);
        }
    }

    onMounted((): void => {
        document.addEventListener('click', handleDropdownClickOutside);
    });

    onUnmounted((): void => {
        document.removeEventListener('click', handleDropdownClickOutside);
    });

    return {
        status,
        availableModels,
        isLoading,
        selectedModelPath,
        lastUsedModelName,
        showDropdown,
        dropdownRef,
        dropdownPosition,
        previousModelMatch,
        isReady,
        isAnyGenerating,
        selectedModelLabel,
        truncate,
        toggleDropdown,
        selectModel,
        refreshModels,
        refreshStatus,
        loadModel,
        unloadModel,
        loadPreviousModel,
        openModelsFolder,
    };
}
