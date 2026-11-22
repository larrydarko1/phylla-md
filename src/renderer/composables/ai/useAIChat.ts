/**
 * useAIChat — coordinates streaming inference, message management, and editing.
 * Owns: send/stop, token streaming, markdown rendering, message CRUD.
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import type { Ref } from 'vue';

import { useThrottleFn } from '@/renderer/composables/useThrottle';
import { i18n } from '@/renderer/i18n';
import { toModelTurns } from '@/renderer/utils/chat';
import { formatIpcError } from '@/renderer/utils/ipcError';
import type { AiStatus } from '@/schemas/ai';
import type { ChatMessage } from '@/schemas/chat';
import type { IpcErrorCode } from '@/schemas/errors';
import type { FileInfo } from '@/schemas/vault';

type AiChatDeps = {
    messages: Ref<ChatMessage[]>;
    status: Ref<AiStatus>;
    conversationTokenCount: Ref<number>;
    currentConversationId: Ref<string | null>;
};

type AiChatActions = {
    createNewConversation: () => Promise<void>;
    saveCurrentConversation: () => Promise<void>;
    saveTokenCountToConversation: () => Promise<void>;
    refreshConversationList: () => Promise<void>;
    refreshStatus: () => Promise<void>;
};

type UseAIChatReturn = {
    messagesContainer: Ref<HTMLElement | null>;
    inputField: Ref<HTMLTextAreaElement | null>;
    inputMessage: Ref<string>;
    isStreaming: Ref<boolean>;
    showThinking: Ref<boolean>;
    contextFiles: Ref<FileInfo[]>;
    addContextFile: (file: FileInfo) => void;
    removeContextFile: (path: string) => void;
    copiedIndex: Ref<number | null>;
    editingIndex: Ref<number | null>;
    editContent: Ref<string>;
    editInputRef: Ref<HTMLTextAreaElement[] | null>;
    scrollToBottom: (force?: boolean) => void;
    onMessagesScroll: (() => void) & { cancel: () => void };
    renderMarkdown: (content: string) => string;
    copyMessage: (content: string, index: number) => Promise<void>;
    startEditMessage: (index: number) => void;
    cancelEditMessage: () => void;
    confirmEditMessage: (index: number) => Promise<void>;
    resendMessage: (index: number) => Promise<void>;
    deleteLastMessagePair: () => Promise<void>;
    regenerateLastResponse: () => Promise<void>;
    sendMessage: () => Promise<void>;
    stopGeneration: () => Promise<void>;
    formatTokenCount: (n: number) => string;
};

// Maximum number of files a user can attach as additional context
export const MAX_CONTEXT_FILES = 10;

export function useAIChat(deps: AiChatDeps, actions: AiChatActions): UseAIChatReturn {
    const { messages, status, conversationTokenCount, currentConversationId } = deps;
    const {
        createNewConversation,
        saveCurrentConversation,
        saveTokenCountToConversation,
        refreshConversationList,
        refreshStatus,
    } = actions;

    // DOM refs (bound via template ref="...")
    const messagesContainer = ref<HTMLElement | null>(null);
    const inputField = ref<HTMLTextAreaElement | null>(null);

    // Chat state
    const inputMessage = ref('');
    const isStreaming = ref(false);
    const showThinking = ref(false);
    const contextFiles = ref<FileInfo[]>([]);
    const copiedIndex = ref<number | null>(null);
    const userScrolledUp = ref(false);

    // Message editing state
    const editingIndex = ref<number | null>(null);
    const editContent = ref('');
    const editInputRef = ref<HTMLTextAreaElement[] | null>(null);

    const isReady = computed((): boolean => status.value.isModelLoaded);
    const isAnyGenerating = computed((): boolean => status.value.isGenerating);

    // Context file management

    function addContextFile(file: FileInfo): void {
        if (contextFiles.value.length >= MAX_CONTEXT_FILES) return;
        if (contextFiles.value.some((f): boolean => f.path === file.path)) return;
        contextFiles.value.push(file);
    }

    function removeContextFile(path: string): void {
        contextFiles.value = contextFiles.value.filter((f): boolean => f.path !== path);
    }

    async function readFileForContext(file: FileInfo): Promise<string | null> {
        try {
            const result = await window.electronAPI.readFile(file.path);
            if (result.success && result.content !== undefined) return result.content;
        } catch (error) {
            window.electronAPI.log.error('Failed to read file for context:', error);
        }
        return null;
    }

    /** Collects the files the user attached as context, de-duplicated by path. */
    function collectContextFiles(): FileInfo[] {
        const files: FileInfo[] = [];
        const seen = new Set<string>();
        for (const file of contextFiles.value) {
            if (!seen.has(file.path)) {
                files.push(file);
                seen.add(file.path);
            }
        }
        return files;
    }

    /**
     * Builds the note-context string passed to the model, supporting multiple
     * attached files. Returns null when there is nothing to include.
     */
    async function collectNoteContext(): Promise<string | null> {
        const files = collectContextFiles();
        if (files.length === 0) return null;

        // Single file: pass raw content.
        if (files.length === 1 && files[0] !== undefined) return await readFileForContext(files[0]);

        // Multiple files: label each clearly so the model can tell them apart.
        const parts: string[] = [];
        for (const file of files) {
            const content = await readFileForContext(file);
            if (content !== null) parts.push(`File: ${file.relativePath}\n\`\`\`\n${content}\n\`\`\``);
        }
        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    // Scroll helpers

    function scrollToBottom(force = false): void {
        if (!force && userScrolledUp.value) return;
        void nextTick((): void => {
            if (messagesContainer.value !== null) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
            }
        });
    }

    function onMessagesScroll(): void {
        if (messagesContainer.value === null || !isStreaming.value) return;
        const el = messagesContainer.value;
        userScrolledUp.value = el.scrollHeight - el.scrollTop - el.clientHeight >= 40;
    }

    const throttledMessagesScroll = useThrottleFn(onMessagesScroll, 100);

    // Markdown and clipboard

    function renderMarkdown(content: string): string {
        if (content.length === 0) return '';
        const html = marked.parse(content, { async: false });
        // Sanitize marked output to prevent XSS from user/AI-generated markdown
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'h1',
                'h2',
                'h3',
                'h4',
                'h5',
                'h6',
                'p',
                'br',
                'strong',
                'b',
                'em',
                'i',
                'u',
                'del',
                'mark',
                'code',
                'pre',
                'blockquote',
                'ol',
                'ul',
                'li',
                'table',
                'thead',
                'tbody',
                'tr',
                'th',
                'td',
                'a',
                'hr',
                'span',
            ],
            ALLOWED_ATTR: ['href', 'target', 'alt', 'title', 'class'],
        });
    }

    async function copyMessage(content: string, index: number): Promise<void> {
        try {
            await window.electronAPI.writeClipboard(content);
            copiedIndex.value = index;
            void setTimeout((): void => {
                if (copiedIndex.value !== null && copiedIndex.value === index) copiedIndex.value = null;
            }, 2000);
        } catch (err) {
            window.electronAPI.log.error('Failed to copy:', err);
        }
    }

    // Message editing

    function startEditMessage(index: number): void {
        if (messages.value[index]?.role !== 'user') return;
        editingIndex.value = index;
        editContent.value = messages.value[index].content;
        void nextTick((): void => editInputRef.value?.[0]?.focus());
    }

    function cancelEditMessage(): void {
        editingIndex.value = null;
        editContent.value = '';
    }

    async function confirmEditMessage(index: number): Promise<void> {
        const newContent = editContent.value.trim();
        const edited = messages.value[index];
        if (newContent.length === 0 || edited === undefined) {
            cancelEditMessage();
            return;
        }
        edited.content = newContent;
        messages.value.splice(index + 1);
        await window.electronAPI.aiResetChat();
        conversationTokenCount.value = 0;
        // Restore context of messages before the edited one so subsequent
        // sends have conversation history available.
        const priorMessages = messages.value.slice(0, index).filter((m): boolean => m.role !== 'system');
        if (priorMessages.length > 0) await window.electronAPI.aiRestoreChatHistory(toModelTurns(priorMessages));
        await saveCurrentConversation();
        await saveTokenCountToConversation();
        await refreshConversationList();
        editingIndex.value = null;
        editContent.value = '';
        scrollToBottom();
    }

    // Resend, delete, and regenerate

    async function resendMessage(index: number): Promise<void> {
        const msg = messages.value[index];
        if (msg?.role !== 'user' || !status.value.isModelLoaded || status.value.isGenerating) return;
        await window.electronAPI.aiResetChat();
        conversationTokenCount.value = 0;
        // Restore context of messages that preceded this one so the AI
        // doesn't lose conversation history on regenerate/resend.
        const priorMessages = messages.value.slice(0, index).filter((m): boolean => m.role !== 'system');
        if (priorMessages.length > 0) await window.electronAPI.aiRestoreChatHistory(toModelTurns(priorMessages));
        messages.value.push({ role: 'assistant', content: '' });
        isStreaming.value = true;
        userScrolledUp.value = false;
        scrollToBottom(true);
        const noteContext = await collectNoteContext();
        try {
            const result = await window.electronAPI.aiChat(msg.content, noteContext);
            if (!result.success) {
                const lastMsg = messages.value[messages.value.length - 1];
                if (lastMsg?.role === 'assistant') lastMsg.content = formatChatFailure(result.error);
            }
            const assistantMsg = messages.value[messages.value.length - 1];
            if (currentConversationId.value !== null && assistantMsg?.role === 'assistant') {
                await window.electronAPI.conversationAddMessage(currentConversationId.value, {
                    role: 'assistant',
                    content: assistantMsg.content,
                });
            }
        } catch (error) {
            window.electronAPI.log.error('Chat request failed:', error);
            const lastMsg = messages.value[messages.value.length - 1];
            if (lastMsg?.role === 'assistant') lastMsg.content = formatChatFailure('UNKNOWN');
        } finally {
            isStreaming.value = false;
            userScrolledUp.value = false;
            await refreshStatus();
            conversationTokenCount.value = status.value.contextTokens;
            await saveTokenCountToConversation();
            await refreshConversationList();
            scrollToBottom(true);
        }
    }

    async function deleteLastMessagePair(): Promise<void> {
        if (messages.value.length === 0 || isStreaming.value) return;
        messages.value.pop();
        await window.electronAPI.aiResetChat();
        conversationTokenCount.value = 0;
        // Restore context of remaining messages so the AI retains
        // conversation history after the deletion.
        const remainingMessages = messages.value.filter((m): boolean => m.role !== 'system');
        if (remainingMessages.length > 0) {
            await window.electronAPI.aiRestoreChatHistory(toModelTurns(remainingMessages));
        }
        await saveCurrentConversation();
        await saveTokenCountToConversation();
        await refreshConversationList();
        scrollToBottom();
    }

    async function regenerateLastResponse(): Promise<void> {
        if (messages.value.length < 2 || isStreaming.value) return;
        const lastMsg = messages.value[messages.value.length - 1];
        if (lastMsg?.role !== 'assistant') return;
        messages.value.pop();
        await saveCurrentConversation();
        const lastIndex = messages.value.length - 1;
        if (messages.value[lastIndex]?.role === 'user') await resendMessage(lastIndex);
    }

    // Send and stop

    async function sendMessage(): Promise<void> {
        const text = inputMessage.value.trim();
        if (text.length === 0 || !isReady.value || isAnyGenerating.value) return;
        if (currentConversationId.value === null) await createNewConversation();
        const userMsg: ChatMessage = { role: 'user', content: text };
        messages.value.push(userMsg);
        inputMessage.value = '';
        if (currentConversationId.value !== null) {
            await window.electronAPI.conversationAddMessage(currentConversationId.value, {
                role: 'user',
                content: userMsg.content,
            });
        }
        messages.value.push({ role: 'assistant', content: '' });
        isStreaming.value = true;
        userScrolledUp.value = false;
        scrollToBottom(true);

        const noteContext = await collectNoteContext();

        try {
            const result = await window.electronAPI.aiChat(text, noteContext);
            if (!result.success) {
                const lastMsg = messages.value[messages.value.length - 1];
                if (lastMsg?.role === 'assistant') lastMsg.content = formatChatFailure(result.error);
            }
            const assistantMsg = messages.value[messages.value.length - 1];
            if (currentConversationId.value !== null && assistantMsg?.role === 'assistant') {
                await window.electronAPI.conversationAddMessage(currentConversationId.value, {
                    role: 'assistant',
                    content: assistantMsg.content,
                });
            }
            if (result.compacted === true) {
                messages.value.push({
                    role: 'system',
                    content:
                        'Context memory was getting full — conversation has been summarized to free up space. All messages are preserved.',
                });
            }
        } catch (error) {
            window.electronAPI.log.error('Chat request failed:', error);
            const lastMsg = messages.value[messages.value.length - 1];
            if (lastMsg?.role === 'assistant') lastMsg.content = formatChatFailure('UNKNOWN');
        } finally {
            isStreaming.value = false;
            userScrolledUp.value = false;
            await refreshStatus();
            conversationTokenCount.value = status.value.contextTokens;
            await saveTokenCountToConversation();
            await refreshConversationList();
            scrollToBottom(true);
        }
    }

    async function stopGeneration(): Promise<void> {
        try {
            await window.electronAPI.aiStopChat();
        } catch (error) {
            window.electronAPI.log.error('Failed to stop generation:', error);
        } finally {
            isStreaming.value = false;
            userScrolledUp.value = false;
            await refreshStatus();
            conversationTokenCount.value = status.value.contextTokens;
            await saveTokenCountToConversation();
        }
    }

    // Token streaming and utilities

    function handleToken(token: string): void {
        const lastMsg = messages.value[messages.value.length - 1];
        if (lastMsg?.role === 'assistant') {
            lastMsg.content += token;
            scrollToBottom();
        }
    }

    function handleThinkingToken(token: string): void {
        const lastMsg = messages.value[messages.value.length - 1];
        if (lastMsg?.role === 'assistant') {
            lastMsg.thinking = (lastMsg.thinking ?? '') + token;
            scrollToBottom();
        }
    }

    function formatTokenCount(n: number): string {
        if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
        return String(n);
    }

    void watch(
        (): number => messages.value.length,
        (): void => {
            scrollToBottom();
        },
    );

    onMounted((): void => {
        window.electronAPI.onAiToken(handleToken);
        window.electronAPI.onAiThinkingToken(handleThinkingToken);
    });
    onUnmounted((): void => {
        throttledMessagesScroll.cancel();
        window.electronAPI.removeAiTokenListener();
        window.electronAPI.removeAiThinkingTokenListener();
    });

    return {
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
        editInputRef,
        scrollToBottom,
        onMessagesScroll: throttledMessagesScroll,
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
        formatTokenCount,
    };
}

function formatChatFailure(code: IpcErrorCode | undefined): string {
    const { t } = i18n.global;
    return t('errors.chat_failed', { reason: formatIpcError(t, code) });
}

// Configure marked once at module level
marked.setOptions({ breaks: true, gfm: true });
