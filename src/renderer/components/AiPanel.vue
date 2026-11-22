<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import AiHistoryPanel from '@/renderer/components/ai/AiHistoryPanel.vue';
import AiInputArea from '@/renderer/components/ai/AiInputArea.vue';
import AiMessageList from '@/renderer/components/ai/AiMessageList.vue';
import AiModelBar from '@/renderer/components/ai/AiModelBar.vue';
import { useAIChat } from '@/renderer/composables/ai/useAIChat';
import { MAX_CONTEXT_FILES } from '@/renderer/composables/ai/useAIChat';
import { useAIModel } from '@/renderer/composables/ai/useAIModel';
import { useConversationHistory } from '@/renderer/composables/ai/useConversationHistory';
import { useThrottleFn } from '@/renderer/composables/useThrottle';
import { formatIpcError } from '@/renderer/utils/ipcError';
import type { ChatMessage } from '@/schemas/chat';
import type { FileInfo } from '@/schemas/vault';

type Props = {
    files?: FileInfo[];
};

const props = withDefaults(defineProps<Props>(), {
    files: (): FileInfo[] => [],
});

defineEmits<{
    close: [];
}>();

const minWidth = 340;
const maxWidth = 600;

const { t } = useI18n();

const model = useAIModel();
const {
    status,
    availableModels,
    isLoading,
    selectedModelPath,
    lastUsedModelName,
    isReady,
    isAnyGenerating,
    selectedModelLabel,
    previousModelMatch,
    selectModel,
    refreshModels,
    refreshStatus,
    openModelsFolder,
} = model;
const messages = ref<ChatMessage[]>([]);
const conversation = useConversationHistory(status, lastUsedModelName, messages);
const {
    showHistory,
    conversationList,
    currentConversationId,
    conversationTokenCount,
    renamingConversationId,
    renameValue,
    toggleHistory,
    openHistory,
    refreshConversationList,
    createNewConversation,
    saveCurrentConversation,
    saveTokenCountToConversation,
    deleteConversation,
    startRename,
    confirmRename,
    cancelRename,
} = conversation;

const chat = useAIChat(
    {
        messages,
        status,
        conversationTokenCount,
        currentConversationId,
    },
    {
        createNewConversation,
        saveCurrentConversation,
        saveTokenCountToConversation,
        refreshConversationList,
        refreshStatus,
    },
);
const {
    messagesContainer,
    inputField,
    inputMessage,
    isStreaming,
    showThinking,
    contextFiles,
    addContextFile,
    removeContextFile,
    copiedIndex,
    editingIndex,
    editContent,
    onMessagesScroll,
    renderMarkdown,
    copyMessage,
    startEditMessage,
    cancelEditMessage,
    confirmEditMessage,
    resendMessage,
    deleteLastMessagePair,
    regenerateLastResponse,
    sendMessage,
    stopGeneration,
    scrollToBottom,
} = chat;

const panelWidth = ref(340);

const isResizing = ref(false);

// Files selectable as additional context: text/markdown files not already attached
const availableContextFiles = computed(() =>
    props.files.filter(
        (f) => (f.extension === '.md' || f.extension === '.txt') && !contextFiles.value.some((c) => c.path === f.path),
    ),
);

const tokenUsagePercent = computed(() => {
    if (status.value.contextSize === 0) return 0;
    return Math.min(100, Math.round((conversationTokenCount.value / status.value.contextSize) * 100));
});

// The two children own their DOM nodes; mirror them into the chat composable's refs.
const messageList = useTemplateRef<{ messagesContainer: HTMLElement | null }>('messageList');
const inputArea = useTemplateRef<{ inputField: HTMLTextAreaElement | null }>('inputArea');

// `undefined` means the child never exposed the element (a stub in tests) — leave the ref alone.
function syncChildElements(): void {
    if (messageList.value?.messagesContainer !== undefined) {
        messagesContainer.value = messageList.value.messagesContainer;
    }
    if (inputArea.value?.inputField !== undefined) inputField.value = inputArea.value.inputField;
}

async function loadSelectedModel(): Promise<void> {
    const result = await model.loadModel();
    if (result.success) {
        await startNewConversation();
    } else {
        messages.value.push({
            role: 'assistant',
            content: t('ai.failed_to_load_model', { error: formatIpcError(t, result.error) }),
        });
    }
}

async function unloadModel(): Promise<void> {
    if (status.value.isGenerating) await stopGeneration();
    await saveCurrentConversation();
    await model.unloadModel();
    conversationTokenCount.value = 0;
}

async function startNewConversation(): Promise<void> {
    await conversation.startNewConversation();
    inputField.value?.focus();
}

async function loadConversation(id: string): Promise<void> {
    await conversation.loadConversation(id);
    scrollToBottom();
}

async function loadPreviousModel(): Promise<void> {
    const hasConversation = currentConversationId.value !== null && currentConversationId.value !== '';
    const history = messages.value.map((m) => ({ role: m.role, content: m.content }));
    const result = await model.loadPreviousModel(history, { hasActiveConversation: hasConversation });
    if (result.success) {
        if (!hasConversation) await startNewConversation();
        inputField.value?.focus();
    } else if (result.error !== undefined) {
        messages.value.push({
            role: 'assistant',
            content: t('ai.failed_to_load_model', { error: formatIpcError(t, result.error) }),
        });
    }
}

function startResize(e: MouseEvent): void {
    isResizing.value = true;
    const startX = e.clientX;
    const startWidth = panelWidth.value;

    const onMouseMove = useThrottleFn((moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        panelWidth.value = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
    }, 16);

    function onMouseUp(): void {
        isResizing.value = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        onMouseMove.cancel();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function decreaseWidth(): void {
    panelWidth.value = Math.max(minWidth, panelWidth.value - 50);
}

function increaseWidth(): void {
    panelWidth.value = Math.min(maxWidth, panelWidth.value + 50);
}

watch([messageList, inputArea], syncChildElements);

onMounted(async () => {
    syncChildElements();
    await refreshStatus();
    await refreshModels();
    await refreshConversationList();
    if (status.value.isModelLoaded && inputField.value !== null) inputField.value.focus();
});

onBeforeUnmount(() => {
    isResizing.value = false;
});
</script>

<template>
    <main
        class="ai-panel"
        :style="{ width: panelWidth + 'px' }"
        :aria-label="t('ai.assistant_panel')">
        <div
            class="ai-panel-resize-handle"
            role="slider"
            aria-orientation="vertical"
            :aria-label="t('ai.resize_panel')"
            :aria-valuenow="panelWidth"
            aria-valuemin="340"
            aria-valuemax="600"
            tabindex="0"
            @mousedown.prevent="startResize"
            @keydown.left="decreaseWidth"
            @keydown.right="increaseWidth" />

        <AiModelBar
            :status="status"
            :available-models="availableModels"
            :is-loading="isLoading"
            :selected-model-path="selectedModelPath"
            :selected-model-label="selectedModelLabel"
            :show-history="showHistory"
            :aria-label="t('ai.model_selection_and_controls')"
            @select-model="selectModel"
            @load-model="loadSelectedModel"
            @unload-model="unloadModel"
            @open-models-folder="openModelsFolder"
            @refresh-models="refreshModels"
            @toggle-history="toggleHistory"
            @new-conversation="startNewConversation"
            @close="$emit('close')" />

        <AiHistoryPanel
            v-if="showHistory"
            :conversation-list="conversationList"
            :current-conversation-id="currentConversationId"
            :renaming-conversation-id="renamingConversationId"
            :rename-value="renameValue"
            :aria-label="t('ai.conversation_history')"
            :aria-hidden="!showHistory"
            @load="loadConversation"
            @start-rename="startRename"
            @confirm-rename="confirmRename"
            @cancel-rename="cancelRename"
            @delete="deleteConversation"
            @update:rename-value="renameValue = $event" />

        <AiMessageList
            ref="messageList"
            :messages="messages"
            :status="status"
            :available-models="availableModels"
            :is-streaming="isStreaming"
            :is-ready="isReady"
            :editing-index="editingIndex"
            :edit-content="editContent"
            :copied-index="copiedIndex"
            :previous-model-match="previousModelMatch"
            :is-loading="isLoading"
            :token-usage-percent="tokenUsagePercent"
            :conversation-token-count="conversationTokenCount"
            :render-markdown="renderMarkdown"
            :show-thinking="showThinking"
            role="log"
            :aria-label="t('ai.conversation_messages')"
            aria-live="polite"
            aria-atomic="false"
            @scroll="onMessagesScroll"
            @copy="copyMessage"
            @start-edit="startEditMessage"
            @cancel-edit="cancelEditMessage"
            @confirm-edit="confirmEditMessage"
            @update:edit-content="editContent = $event"
            @resend="resendMessage"
            @regenerate="regenerateLastResponse"
            @delete-last-pair="deleteLastMessagePair"
            @open-models-folder="openModelsFolder"
            @open-history="openHistory"
            @load-previous-model="loadPreviousModel" />

        <AiInputArea
            ref="inputArea"
            :show-thinking="showThinking"
            :input-message="inputMessage"
            :is-ready="isReady"
            :is-any-generating="isAnyGenerating"
            :is-streaming="isStreaming"
            :context-files="contextFiles"
            :available-files="availableContextFiles"
            :max-context-files="MAX_CONTEXT_FILES"
            :aria-label="t('ai.message_input_area')"
            @update:input-message="inputMessage = $event"
            @update:show-thinking="showThinking = $event"
            @add-context-file="addContextFile"
            @remove-context-file="removeContextFile"
            @send="sendMessage"
            @stop="stopGeneration" />
    </main>
</template>

<style lang="scss" scoped>
.ai-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: $base1;
    border-left: $border-width-thin $text3;
    position: relative;
    flex-shrink: 0;
}

.ai-panel-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: $size-2;
    cursor: col-resize;
    z-index: $z-raised;
    transition: background $transition-fast;

    &:hover,
    &:active {
        background: $accent-color;
        opacity: $opacity-mid-low;
    }
}
</style>
