/**
 * useConversationHistory — persists and navigates LLM conversation sessions via IPC.
 */

import { ref, shallowRef, nextTick, type ShallowRef } from 'vue';
import type { Ref } from 'vue';

import { toModelTurns } from '@/renderer/utils/chat';
import type { AiStatus, ConversationMessage, ConversationMeta } from '@/schemas/ai';
import type { ChatMessage } from '@/schemas/chat';

type UseConversationHistoryReturn = {
    showHistory: Ref<boolean>;
    conversationList: ShallowRef<ConversationMeta[]>;
    currentConversationId: Ref<string | null>;
    conversationTokenCount: Ref<number>;
    renamingConversationId: Ref<string | null>;
    renameValue: Ref<string>;
    renameInputRef: Ref<HTMLInputElement[] | null>;
    toggleHistory: () => void;
    openHistory: () => void;
    refreshConversationList: () => Promise<void>;
    createNewConversation: () => Promise<void>;
    startNewConversation: () => Promise<void>;
    saveCurrentConversation: () => Promise<void>;
    saveTokenCountToConversation: () => Promise<void>;
    loadConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    startRename: (conv: ConversationMeta) => Promise<void>;
    confirmRename: (id: string) => Promise<void>;
    cancelRename: () => void;
    formatRelativeDate: (dateStr: string) => string;
};

export function useConversationHistory(
    status: Ref<AiStatus>,
    lastUsedModelName: Ref<string | null>,
    messages: Ref<ChatMessage[]>,
): UseConversationHistoryReturn {
    const showHistory = ref(false);
    const conversationList = shallowRef<ConversationMeta[]>([]);
    const currentConversationId = ref<string | null>(null);
    const conversationTokenCount = ref(0);

    // Rename state
    const renamingConversationId = ref<string | null>(null);
    const renameValue = ref('');
    const renameInputRef = ref<HTMLInputElement[] | null>(null);

    function toggleHistory(): void {
        showHistory.value = !showHistory.value;
        if (showHistory.value) void refreshConversationList();
    }

    function openHistory(): void {
        showHistory.value = true;
        void refreshConversationList();
    }

    async function refreshConversationList(): Promise<void> {
        try {
            const result = await window.electronAPI.conversationList();
            if (result.success) conversationList.value = result.conversations;
        } catch (error) {
            window.electronAPI.log.error('Failed to list conversations:', error);
        }
    }

    /** Create a new conversation record (internal, called before the first message). */
    async function createNewConversation(): Promise<void> {
        try {
            const modelName = status.value.currentModelName ?? 'unknown';
            const result = await window.electronAPI.conversationCreate(modelName);
            if (result.success && result.conversation != null) currentConversationId.value = result.conversation.id;
        } catch (error) {
            window.electronAPI.log.error('Failed to create conversation:', error);
        }
    }

    /**
     * Reset to a blank conversation. Saves the current one first.
     * Caller is responsible for focusing the input after this returns.
     */
    async function startNewConversation(): Promise<void> {
        await saveCurrentConversation();
        try {
            await window.electronAPI.aiResetChat();
        } catch (error) {
            window.electronAPI.log.error('Failed to reset chat:', error);
        }
        messages.value = [];
        currentConversationId.value = null;
        conversationTokenCount.value = 0;
        showHistory.value = false;
    }

    async function saveCurrentConversation(): Promise<void> {
        if (currentConversationId.value === null || currentConversationId.value === '') return;
        try {
            const result = await window.electronAPI.conversationLoad(currentConversationId.value);
            if (result.success && result.conversation != null) {
                const timestamp = new Date().toISOString();
                result.conversation.messages = messages.value.flatMap((m): ConversationMessage[] =>
                    m.role === 'system' ? [] : [{ role: m.role, content: m.content, thinking: m.thinking, timestamp }],
                );
                result.conversation.tokenCount = conversationTokenCount.value;
                await window.electronAPI.conversationSave(result.conversation);
            }
        } catch (error) {
            window.electronAPI.log.error('Failed to save conversation:', error);
        }
    }

    async function saveTokenCountToConversation(): Promise<void> {
        if (currentConversationId.value === null || currentConversationId.value === '') return;
        try {
            const result = await window.electronAPI.conversationLoad(currentConversationId.value);
            if (result.success && result.conversation != null) {
                result.conversation.tokenCount = conversationTokenCount.value;
                await window.electronAPI.conversationSave(result.conversation);
            }
        } catch (error) {
            window.electronAPI.log.error('Failed to save token count:', error);
        }
    }

    /**
     * Load a conversation from history. Saves the current one first.
     * Caller is responsible for scrolling to bottom after this returns.
     */
    async function loadConversation(id: string): Promise<void> {
        try {
            await saveCurrentConversation();
            const result = await window.electronAPI.conversationLoad(id);
            if (result.success && result.conversation != null) {
                if (status.value.isModelLoaded) await window.electronAPI.aiResetChat();
                currentConversationId.value = result.conversation.id;
                messages.value = result.conversation.messages.map((m): ChatMessage => ({
                    role: m.role,
                    content: m.content,
                    ...(m.thinking === undefined ? {} : { thinking: m.thinking }),
                }));
                if (result.conversation.model !== '') lastUsedModelName.value = result.conversation.model;
                conversationTokenCount.value = result.conversation.tokenCount ?? 0;
                if (status.value.isModelLoaded && messages.value.length > 0) {
                    await window.electronAPI.aiRestoreChatHistory(toModelTurns(messages.value));
                }
                showHistory.value = false;
            }
        } catch (error) {
            window.electronAPI.log.error('Failed to load conversation:', error);
        }
    }

    async function deleteConversation(id: string): Promise<void> {
        try {
            await window.electronAPI.conversationDelete(id);
            if (currentConversationId.value === id) {
                messages.value = [];
                currentConversationId.value = null;
                conversationTokenCount.value = 0;
                await window.electronAPI.aiResetChat();
            }
            await refreshConversationList();
        } catch (error) {
            window.electronAPI.log.error('Failed to delete conversation:', error);
        }
    }

    async function startRename(conv: ConversationMeta): Promise<void> {
        renamingConversationId.value = conv.id;
        renameValue.value = conv.title;
        await nextTick((): void => {
            const input = renameInputRef.value?.[0];
            if (input !== undefined) {
                input.focus();
                input.select();
            }
        });
    }

    async function confirmRename(id: string): Promise<void> {
        if (renameValue.value.trim() === '') {
            cancelRename();
            return;
        }
        try {
            await window.electronAPI.conversationRename(id, renameValue.value.trim());
            await refreshConversationList();
        } catch (error) {
            window.electronAPI.log.error('Failed to rename conversation:', error);
        }
        renamingConversationId.value = null;
        renameValue.value = '';
    }

    function cancelRename(): void {
        renamingConversationId.value = null;
        renameValue.value = '';
    }

    function formatRelativeDate(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        return date.toLocaleDateString();
    }

    return {
        showHistory,
        conversationList,
        currentConversationId,
        conversationTokenCount,
        renamingConversationId,
        renameValue,
        renameInputRef,
        toggleHistory,
        openHistory,
        refreshConversationList,
        createNewConversation,
        startNewConversation,
        saveCurrentConversation,
        saveTokenCountToConversation,
        loadConversation,
        deleteConversation,
        startRename,
        confirmRename,
        cancelRename,
        formatRelativeDate,
    };
}
