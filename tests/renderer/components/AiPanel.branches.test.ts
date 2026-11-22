import { flushPromises, shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { z } from 'zod';

import AiHistoryPanel from '@/renderer/components/ai/AiHistoryPanel.vue';
import AiMessageList from '@/renderer/components/ai/AiMessageList.vue';
import AiModelBar from '@/renderer/components/ai/AiModelBar.vue';
import AiPanel from '@/renderer/components/AiPanel.vue';
import { i18n } from '@/renderer/i18n';
import type { FileInfo } from '@/schemas/vault';

vi.mock('@/renderer/composables/useThrottle', () => ({
    useThrottleFn: (fn: (...a: unknown[]) => unknown) => Object.assign(fn, { cancel: vi.fn() }),
}));

const mockStatus = ref({
    isModelLoaded: false,
    isGenerating: false,
    currentModelPath: null as string | null,
    currentModelName: null as string | null,
    contextSize: 0,
    contextTokens: 0,
    modelsDir: '',
});

const mockAvailableModels = ref<unknown[]>([]);
const mockIsLoading = ref(false);
const mockSelectedModelPath = ref<string | null>(null);
const mockLastUsedModelName = ref<string | null>(null);
const mockIsReady = computed(() => mockStatus.value.isModelLoaded);
const mockIsAnyGenerating = computed(() => mockStatus.value.isGenerating);
const mockSelectedModelLabel = ref('');
const mockShowDropdown = ref(false);
const mockDropdownRef = ref(null);
const mockDropdownPosition = ref({ top: 0, left: 0 });
const mockPreviousModelMatch = ref(null);
const mockToggleDropdown = vi.fn();
const mockSelectModel = vi.fn();
const mockRefreshModels = vi.fn().mockResolvedValue(undefined);
const mockRefreshStatus = vi.fn().mockResolvedValue(undefined);
const mockOpenModelsFolder = vi.fn();
const mockLoadModel = vi.fn().mockResolvedValue({ success: true });
const mockUnloadModel = vi.fn().mockResolvedValue(undefined);
const mockLoadPreviousModel = vi.fn().mockResolvedValue({ success: false, error: null });

vi.mock('@/renderer/composables/ai/useAIModel', () => ({
    useAIModel: vi.fn(() => ({
        status: mockStatus,
        availableModels: mockAvailableModels,
        isLoading: mockIsLoading,
        selectedModelPath: mockSelectedModelPath,
        lastUsedModelName: mockLastUsedModelName,
        isReady: mockIsReady,
        isAnyGenerating: mockIsAnyGenerating,
        selectedModelLabel: mockSelectedModelLabel,
        showDropdown: mockShowDropdown,
        dropdownRef: mockDropdownRef,
        dropdownPosition: mockDropdownPosition,
        previousModelMatch: mockPreviousModelMatch,
        toggleDropdown: mockToggleDropdown,
        selectModel: mockSelectModel,
        refreshModels: mockRefreshModels,
        refreshStatus: mockRefreshStatus,
        openModelsFolder: mockOpenModelsFolder,
        loadModel: mockLoadModel,
        unloadModel: mockUnloadModel,
        loadPreviousModel: mockLoadPreviousModel,
    })),
}));

const mockShowHistory = ref(false);
const mockConversationList = ref<unknown[]>([]);
const mockCurrentConversationId = ref<string | null>(null);
const mockConversationTokenCount = ref(0);
const mockRenamingConversationId = ref<string | null>(null);
const mockRenameValue = ref('');
const mockToggleHistory = vi.fn();
const mockOpenHistory = vi.fn();
const mockRefreshConversationList = vi.fn().mockResolvedValue(undefined);
const mockCreateNewConversation = vi.fn().mockResolvedValue(undefined);
const mockSaveCurrentConversation = vi.fn().mockResolvedValue(undefined);
const mockSaveTokenCountToConversation = vi.fn().mockResolvedValue(undefined);
const mockDeleteConversation = vi.fn().mockResolvedValue(undefined);
const mockStartRename = vi.fn();
const mockConfirmRename = vi.fn().mockResolvedValue(undefined);
const mockCancelRename = vi.fn();
const mockStartNewConversation = vi.fn().mockResolvedValue(undefined);
const mockLoadConversation = vi.fn().mockResolvedValue(undefined);

vi.mock('@/renderer/composables/ai/useConversationHistory', () => ({
    useConversationHistory: vi.fn(() => ({
        showHistory: mockShowHistory,
        conversationList: mockConversationList,
        currentConversationId: mockCurrentConversationId,
        conversationTokenCount: mockConversationTokenCount,
        renamingConversationId: mockRenamingConversationId,
        renameValue: mockRenameValue,
        toggleHistory: mockToggleHistory,
        openHistory: mockOpenHistory,
        refreshConversationList: mockRefreshConversationList,
        createNewConversation: mockCreateNewConversation,
        saveCurrentConversation: mockSaveCurrentConversation,
        saveTokenCountToConversation: mockSaveTokenCountToConversation,
        deleteConversation: mockDeleteConversation,
        startRename: mockStartRename,
        confirmRename: mockConfirmRename,
        cancelRename: mockCancelRename,
        startNewConversation: mockStartNewConversation,
        loadConversation: mockLoadConversation,
    })),
}));

const mockInputField = ref<HTMLTextAreaElement | null>(null);
const mockScrollToBottom = vi.fn();
const mockStopGeneration = vi.fn().mockResolvedValue(undefined);

vi.mock('@/renderer/composables/ai/useAIChat', () => ({
    MAX_CONTEXT_FILES: 10,
    useAIChat: vi.fn(() => ({
        messagesContainer: ref(null),
        inputField: mockInputField,
        inputMessage: ref(''),
        isStreaming: ref(false),
        showThinking: ref(false),
        contextFiles: ref([]),
        addContextFile: vi.fn(),
        removeContextFile: vi.fn(),
        copiedIndex: ref(null),
        editingIndex: ref(null),
        editContent: ref(''),
        onMessagesScroll: vi.fn(),
        renderMarkdown: vi.fn(),
        copyMessage: vi.fn(),
        startEditMessage: vi.fn(),
        cancelEditMessage: vi.fn(),
        confirmEditMessage: vi.fn(),
        resendMessage: vi.fn(),
        deleteLastMessagePair: vi.fn(),
        regenerateLastResponse: vi.fn(),
        sendMessage: vi.fn(),
        stopGeneration: mockStopGeneration,
        scrollToBottom: mockScrollToBottom,
    })),
}));

const defaultProps: { activeFile: FileInfo | null; workspacePath: string | null } = {
    activeFile: null,
    workspacePath: '/vault',
};

/** The messages AiPanel hands its message list to render. */
function listedMessages(wrapper: ReturnType<typeof mountPanel>) {
    return z
        .array(z.object({ role: z.string(), content: z.string() }))
        .parse(wrapper.findComponent(AiMessageList).props('messages'));
}

function mountPanel(props = defaultProps) {
    return shallowMount(AiPanel, {
        props,
        global: { plugins: [i18n] },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.value = {
        isModelLoaded: false,
        isGenerating: false,
        currentModelPath: null,
        currentModelName: null,
        contextSize: 0,
        contextTokens: 0,
        modelsDir: '',
    };
    mockConversationTokenCount.value = 0;
    mockCurrentConversationId.value = null;
    mockShowHistory.value = false;
    mockLoadModel.mockResolvedValue({ success: true });
    mockLoadPreviousModel.mockResolvedValue({ success: false, error: null });
    mockRefreshStatus.mockResolvedValue(undefined);
    mockRefreshModels.mockResolvedValue(undefined);
    mockRefreshConversationList.mockResolvedValue(undefined);
    mockSaveCurrentConversation.mockResolvedValue(undefined);
    mockStopGeneration.mockResolvedValue(undefined);
    mockStartNewConversation.mockResolvedValue(undefined);
    mockLoadConversation.mockResolvedValue(undefined);
    mockInputField.value = null;
});

describe('tokenUsagePercent', () => {
    it('returns 0 when contextSize is 0', async () => {
        mockStatus.value.contextSize = 0;
        mockConversationTokenCount.value = 50;
        const wrapper = mountPanel();
        const msgList = wrapper.findComponent({ name: 'AiMessageList' });
        expect(msgList.props('tokenUsagePercent')).toBe(0);
        wrapper.unmount();
    });

    it('computes correct percentage', async () => {
        mockStatus.value.contextSize = 1000;
        mockConversationTokenCount.value = 300;
        const wrapper = mountPanel();
        const msgList = wrapper.findComponent({ name: 'AiMessageList' });
        expect(msgList.props('tokenUsagePercent')).toBe(30);
        wrapper.unmount();
    });

    it('clamps to 100 when over capacity', async () => {
        mockStatus.value.contextSize = 100;
        mockConversationTokenCount.value = 200;
        const wrapper = mountPanel();
        const msgList = wrapper.findComponent({ name: 'AiMessageList' });
        expect(msgList.props('tokenUsagePercent')).toBe(100);
        wrapper.unmount();
    });
});

describe('onMounted', () => {
    it('calls refreshStatus, refreshModels, refreshConversationList', async () => {
        mountPanel();
        await new Promise((r) => setTimeout(r, 0));
        expect(mockRefreshStatus).toHaveBeenCalled();
        expect(mockRefreshModels).toHaveBeenCalled();
        expect(mockRefreshConversationList).toHaveBeenCalled();
    });

    it('focuses inputField when model is loaded and inputField exists', async () => {
        mockStatus.value.isModelLoaded = true;
        const mockFocus = vi.fn();
        mockInputField.value = Object.assign(document.createElement('textarea'), { focus: mockFocus });
        mountPanel();
        await new Promise((r) => setTimeout(r, 0));
        expect(mockFocus).toHaveBeenCalled();
    });

    it('does not focus when model is not loaded', async () => {
        mockStatus.value.isModelLoaded = false;
        const mockFocus = vi.fn();
        mockInputField.value = Object.assign(document.createElement('textarea'), { focus: mockFocus });
        mountPanel();
        await new Promise((r) => setTimeout(r, 0));
        expect(mockFocus).not.toHaveBeenCalled();
    });
});

describe('loadSelectedModel', () => {
    it('calls startNewConversation on success', async () => {
        mockLoadModel.mockResolvedValue({ success: true });
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('load-model');
        await flushPromises();
        expect(mockStartNewConversation).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('pushes error message on failure (visible in AiMessageList messages prop)', async () => {
        mockLoadModel.mockResolvedValue({ success: false, error: 'NOT_FOUND' });
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('load-model');
        await flushPromises();
        expect(listedMessages(wrapper)).toContainEqual({
            role: 'assistant',
            content: 'Failed to load model: It could not be found.',
        });
        wrapper.unmount();
    });
});

describe('unloadModel', () => {
    it('calls stopGeneration when model is generating', async () => {
        mockStatus.value.isGenerating = true;
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('unload-model');
        await flushPromises();
        expect(mockStopGeneration).toHaveBeenCalled();
        expect(mockSaveCurrentConversation).toHaveBeenCalled();
        expect(mockUnloadModel).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('skips stopGeneration when not generating', async () => {
        mockStatus.value.isGenerating = false;
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('unload-model');
        await flushPromises();
        expect(mockStopGeneration).not.toHaveBeenCalled();
        expect(mockUnloadModel).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('resets conversationTokenCount to 0', async () => {
        mockConversationTokenCount.value = 500;
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('unload-model');
        await flushPromises();
        expect(mockConversationTokenCount.value).toBe(0);
        wrapper.unmount();
    });
});

describe('startNewConversation', () => {
    it('calls conversation.startNewConversation', async () => {
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('new-conversation');
        await flushPromises();
        expect(mockStartNewConversation).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('focuses input field if available', async () => {
        const mockFocus = vi.fn();
        mockInputField.value = Object.assign(document.createElement('textarea'), { focus: mockFocus });
        const wrapper = mountPanel();
        wrapper.findComponent(AiModelBar).vm.$emit('new-conversation');
        await flushPromises();
        expect(mockFocus).toHaveBeenCalled();
        wrapper.unmount();
    });
});

describe('loadConversation', () => {
    it('calls conversation.loadConversation and scrollToBottom', async () => {
        mockShowHistory.value = true;
        const wrapper = mountPanel();
        await wrapper.vm.$nextTick();
        wrapper.findComponent(AiHistoryPanel).vm.$emit('load', 'conv-1');
        await flushPromises();
        expect(mockLoadConversation).toHaveBeenCalledWith('conv-1');
        expect(mockScrollToBottom).toHaveBeenCalled();
        wrapper.unmount();
    });
});

describe('loadPreviousModel', () => {
    it('success + no conversation: calls startNewConversation', async () => {
        mockCurrentConversationId.value = null;
        mockLoadPreviousModel.mockResolvedValue({ success: true });
        const wrapper = mountPanel();
        wrapper.findComponent(AiMessageList).vm.$emit('load-previous-model');
        await flushPromises();
        expect(mockStartNewConversation).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('success + existing conversation: skips startNewConversation', async () => {
        mockCurrentConversationId.value = 'conv-1';
        mockLoadPreviousModel.mockResolvedValue({ success: true });
        const wrapper = mountPanel();
        wrapper.findComponent(AiMessageList).vm.$emit('load-previous-model');
        await flushPromises();
        expect(mockStartNewConversation).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('failure with error string: pushes error message', async () => {
        mockLoadPreviousModel.mockResolvedValue({ success: false, error: 'NOT_FOUND' });
        const wrapper = mountPanel();
        wrapper.findComponent(AiMessageList).vm.$emit('load-previous-model');
        await flushPromises();
        expect(listedMessages(wrapper)).toContainEqual({
            role: 'assistant',
            content: 'Failed to load model: It could not be found.',
        });
        wrapper.unmount();
    });

    it('failure without an error code: does not push a message', async () => {
        mockLoadPreviousModel.mockResolvedValue({ success: false });
        const wrapper = mountPanel();
        wrapper.findComponent(AiMessageList).vm.$emit('load-previous-model');
        await flushPromises();
        expect(listedMessages(wrapper)).toEqual([]);
        wrapper.unmount();
    });
});

describe('v-if panel rendering', () => {
    it('renders AiHistoryPanel when showHistory is true', async () => {
        mockShowHistory.value = true;
        const wrapper = mountPanel();
        await wrapper.vm.$nextTick();
        expect(wrapper.findComponent({ name: 'AiHistoryPanel' }).exists()).toBe(true);
        wrapper.unmount();
    });

    it('does not render AiHistoryPanel when showHistory is false', () => {
        mockShowHistory.value = false;
        const wrapper = mountPanel();
        expect(wrapper.findComponent({ name: 'AiHistoryPanel' }).exists()).toBe(false);
        wrapper.unmount();
    });
});

describe('decreaseWidth / increaseWidth', () => {
    it('decreaseWidth reduces panelWidth by 50 (keyboard ArrowLeft on handle)', async () => {
        const wrapper = mountPanel();
        const handle = wrapper.find('.ai-panel-resize-handle');
        await handle.trigger('keydown.left');
        expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 340px');
        wrapper.unmount();
    });

    it('increaseWidth increases panelWidth by 50 (keyboard ArrowRight on handle)', async () => {
        const wrapper = mountPanel();
        const handle = wrapper.find('.ai-panel-resize-handle');
        await handle.trigger('keydown.right');
        expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 390px');
        wrapper.unmount();
    });

    it('increaseWidth clamps to maxWidth (600)', async () => {
        const wrapper = mountPanel();
        const handle = wrapper.find('.ai-panel-resize-handle');
        for (let i = 0; i < 20; i++) await handle.trigger('keydown.right');
        expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 600px');
        wrapper.unmount();
    });
});

describe('onBeforeUnmount', () => {
    it('sets isResizing to false on unmount', () => {
        const wrapper = mountPanel();
        expect(() => wrapper.unmount()).not.toThrow();
    });
});
