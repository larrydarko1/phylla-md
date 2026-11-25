<script setup lang="ts">
import { watch, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import IconAlertCircle from '@/renderer/components/icons/IconAlertCircle.vue';
import IconCheck from '@/renderer/components/icons/IconCheck.vue';
import IconClose from '@/renderer/components/icons/IconClose.vue';
import IconCopy from '@/renderer/components/icons/IconCopy.vue';
import IconEdit from '@/renderer/components/icons/IconEdit.vue';
import IconRefresh from '@/renderer/components/icons/IconRefresh.vue';
import IconRetry from '@/renderer/components/icons/IconRetry.vue';
import IconTrash from '@/renderer/components/icons/IconTrash.vue';
import type { AiModelInfo, AiStatus } from '@/schemas/ai';
import type { ChatMessage } from '@/schemas/chat';

type Props = {
    messages: ChatMessage[];
    status: AiStatus;
    availableModels: AiModelInfo[];
    isStreaming: boolean;
    isReady: boolean;
    editingIndex: number | null;
    copiedIndex: number | null;
    previousModelMatch: AiModelInfo | null;
    isLoading: boolean;
    tokenUsagePercent: number;
    conversationTokenCount: number;
    renderMarkdown: (content: string) => string;
    showThinking: boolean;
};

const props = defineProps<Props>();

defineEmits<{
    'scroll': [];
    'cancel-edit': [];
    'regenerate': [];
    'delete-last-pair': [];
    'open-models-folder': [];
    'open-history': [];
    'load-previous-model': [];
    'copy': [content: string, index: number];
    'start-edit': [index: number];
    'confirm-edit': [index: number];
    'resend': [index: number];
}>();

const editContent = defineModel<string>('editContent', { required: true });

const copyIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const checkIconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const { t } = useI18n();

// Exposed so AiPanel can drive auto-scroll on the real element.
const messagesContainer = useTemplateRef<HTMLElement>('messagesContainer');
defineExpose({ messagesContainer });

const editInputRef = useTemplateRef<HTMLTextAreaElement[]>('editInputRef');

function truncate(str: string, len: number): string {
    return str.length > len ? `${str.slice(0, len)}…` : str;
}

function formatTokenCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

/**
 * Extract all fenced code blocks from a markdown string.
 * Returns an array of { code, lang } objects.
 */
function extractCodeBlocks(content: string): { code: string; lang: string }[] {
    const blocks: { code: string; lang: string }[] = [];
    const regex = /```([^\n]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) blocks.push({ lang: (match[1] ?? '').trim(), code: match[2] ?? '' });
    return blocks;
}

/**
 * Wraps each <pre> block in the rendered HTML with a relative-positioned
 * container that holds a copy button overlay.
 */
function renderWithCopyBtns(content: string): string {
    const html = props.renderMarkdown(content);
    let blockIdx = 0;
    return html
        .replace(/<pre>/g, () => {
            const btn = `<button class="ai-code-copy-btn" data-block-idx="${blockIdx++}" title="Copy code" aria-label="Copy code">${copyIconSvg}</button>`;
            return `<div class="ai-pre-wrapper">${btn}<pre>`;
        })
        .replace(/<\/pre>/g, '</pre></div>');
}

async function onMarkdownClick(content: string, event: MouseEvent): Promise<void> {
    const closest = event.target instanceof Element ? event.target.closest('.ai-code-copy-btn') : null;
    const btn = closest instanceof HTMLButtonElement ? closest : null;
    if (btn === null) return;

    const idx = parseInt(btn.dataset['blockIdx'] ?? '-1', 10);
    if (idx < 0) return;

    const code = extractCodeBlocks(content)[idx]?.code;
    if (code === undefined || code === '') return;

    try {
        await window.electronAPI.writeClipboard(code);
        btn.innerHTML = checkIconSvg;
        btn.title = t('ai.copied');
        btn.setAttribute('aria-label', t('ai.copied'));
        setTimeout(() => {
            btn.innerHTML = copyIconSvg;
            btn.title = t('ai.copy_code');
            btn.setAttribute('aria-label', t('ai.copy_code'));
        }, 2000);
    } catch (err) {
        window.electronAPI.log.error('Failed to copy code:', err);
    }
}

watch(
    () => props.editingIndex,
    async (index) => {
        if (index !== null) {
            await nextTick();
            editInputRef.value?.[0]?.focus();
        }
    },
);
</script>

<template>
    <!-- Chat messages container -->
    <section
        ref="messagesContainer"
        class="ai-messages stack fill scroll-y"
        :aria-label="t('ai.chat_messages')"
        aria-live="polite"
        @scroll="$emit('scroll')">
        <!-- Empty state -->
        <div
            v-if="messages.length === 0"
            class="ai-empty-state empty-state fill"
            role="status">
            <p class="ai-empty-text">
                {{ status.isModelLoaded ? t('ai.ask_anything') : t('ai.load_model_hint') }}
            </p>
            <button
                v-if="!status.isModelLoaded && availableModels.length === 0"
                class="ai-btn-secondary btn-secondary"
                :aria-label="t('ai.open_models_folder')"
                @click="$emit('open-models-folder')">
                {{ t('ai.open_models_folder') }}
            </button>
            <button
                v-if="!status.isModelLoaded && availableModels.length > 0"
                class="ai-btn-secondary btn-secondary"
                :aria-label="t('ai.browse_history')"
                @click="$emit('open-history')">
                {{ t('ai.browse_history') }}
            </button>
        </div>

        <!-- Messages list -->
        <div
            v-for="(msg, index) in messages"
            :key="index"
            v-memo="[
                msg.role,
                msg.content,
                msg.thinking,
                index >= messages.length - 2 && isStreaming,
                showThinking,
                copiedIndex === index,
                editingIndex === index,
                editingIndex === index && editContent,
            ]"
            class="ai-message"
            :class="msg.role"
            role="article"
            :aria-label="`${msg.role} message ${index + 1}`">
            <div class="ai-message-wrapper">
                <!-- User message: edit mode -->
                <div
                    v-if="msg.role === 'user' && editingIndex === index"
                    class="ai-message-edit stack">
                    <textarea
                        id="edit-input-user-msg"
                        ref="editInputRef"
                        v-model="editContent"
                        class="ai-edit-input field field-resize-y"
                        rows="2"
                        aria-label="Edit user message"
                        @keydown.enter.exact.prevent="$emit('confirm-edit', index)"
                        @keydown.escape.prevent="$emit('cancel-edit')" />
                    <div class="ai-edit-actions row">
                        <button
                            class="ai-btn-icon ai-btn-tiny icon-btn"
                            :aria-label="t('ai.cancel_editing')"
                            @click="$emit('cancel-edit')">
                            <IconClose
                                width="10"
                                height="10"
                                stroke-width="2.5" />
                        </button>
                        <button
                            class="ai-btn-icon ai-btn-tiny icon-btn"
                            :aria-label="t('ai.save_changes_and_resend')"
                            @click="$emit('confirm-edit', index)">
                            <IconCheck
                                width="10"
                                height="10"
                                stroke-width="2.5" />
                        </button>
                    </div>
                </div>

                <!-- User message: normal mode -->
                <div
                    v-else-if="msg.role === 'user'"
                    class="ai-message-content">
                    {{ msg.content }}
                </div>

                <!-- System message -->
                <div
                    v-else-if="msg.role === 'system'"
                    class="ai-message-content ai-system-notice"
                    role="status">
                    <IconAlertCircle
                        width="12"
                        height="12" />
                    <span>{{ msg.content }}</span>
                </div>

                <!-- Assistant message -->
                <template v-else>
                    <div
                        v-if="showThinking && msg.thinking"
                        class="ai-thinking-block">
                        <span
                            class="ai-thinking-label"
                            :class="{ 'thinking-progress': isStreaming && index === messages.length - 1 }">
                            {{ t('ai.thinking') }}
                        </span>
                        <div class="ai-thinking-content">{{ msg.thinking }}</div>
                    </div>
                    <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/no-static-element-interactions -->
                    <div
                        class="ai-message-content ai-markdown prose"
                        role="article"
                        @click="onMarkdownClick(msg.content, $event)">
                        <div v-html="renderWithCopyBtns(msg.content)"></div>
                    </div>
                </template>

                <!-- Streaming cursor -->
                <span
                    v-if="msg.role === 'assistant' && index === messages.length - 1 && isStreaming"
                    class="ai-cursor"
                    aria-hidden="true"
                    >▊</span
                >

                <!-- Message action buttons -->
                <div
                    v-if="
                        msg.role !== 'system' &&
                        msg.content &&
                        !(isStreaming && index >= messages.length - 2) &&
                        editingIndex !== index
                    "
                    class="ai-message-actions row actions-on-hover"
                    role="toolbar"
                    :aria-label="t('ai.message_actions', { role: msg.role, index: index + 1 })">
                    <button
                        class="ai-btn-action icon-btn-subtle"
                        :aria-label="copiedIndex === index ? t('ai.copied') : t('ai.copy_message')"
                        @click="$emit('copy', msg.content, index)">
                        <IconCopy
                            v-if="copiedIndex !== index"
                            width="11"
                            height="11" />
                        <IconCheck
                            v-else
                            width="11"
                            height="11"
                            stroke-width="2.5" />
                    </button>
                    <button
                        v-if="msg.role === 'user'"
                        class="ai-btn-action icon-btn-subtle"
                        :aria-label="t('ai.edit_message')"
                        @click="$emit('start-edit', index)">
                        <IconEdit
                            width="11"
                            height="11" />
                    </button>
                    <button
                        v-if="msg.role === 'user' && index === messages.length - 1 && isReady"
                        class="ai-btn-action icon-btn-subtle"
                        :aria-label="t('ai.resend_message')"
                        @click="$emit('resend', index)">
                        <IconRetry
                            width="11"
                            height="11" />
                    </button>
                    <button
                        v-if="msg.role === 'assistant' && index === messages.length - 1 && isReady"
                        class="ai-btn-action icon-btn-subtle"
                        :aria-label="t('ai.regenerate_assistant_response')"
                        @click="$emit('regenerate')">
                        <IconRefresh
                            width="11"
                            height="11" />
                    </button>
                    <button
                        v-if="index === messages.length - 1"
                        class="ai-btn-action ai-btn-action-danger icon-btn-subtle icon-btn-danger"
                        :aria-label="t('ai.delete_last_message_pair')"
                        @click="$emit('delete-last-pair')">
                        <IconTrash
                            width="11"
                            height="11" />
                    </button>
                </div>
            </div>
        </div>
    </section>

    <!-- Load model banner -->
    <aside
        v-if="!status.isModelLoaded && messages.length > 0"
        class="ai-load-model-banner row"
        role="status"
        :aria-label="t('ai.model_status')">
        <div class="ai-load-model-banner-content row">
            <IconAlertCircle
                width="14"
                height="14" />
            <span>{{ t('ai.load_model_to_continue') }}</span>
        </div>
        <button
            v-if="previousModelMatch"
            class="ai-load-model-btn btn-accent row"
            :disabled="isLoading"
            :aria-label="t('ai.load_model', { model: previousModelMatch.name })"
            @click="$emit('load-previous-model')">
            <IconRefresh
                width="12"
                height="12"
                stroke-width="2.5" />
            {{ isLoading ? t('ai.loading') : t('ai.load_model', { model: truncate(previousModelMatch.name, 20) }) }}
        </button>
    </aside>

    <!-- Token counter progress bar -->
    <div
        v-if="status.isModelLoaded && status.contextSize > 0"
        class="ai-token-bar row"
        role="progressbar"
        :aria-valuenow="tokenUsagePercent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`Context tokens: ${formatTokenCount(conversationTokenCount)} of ${formatTokenCount(status.contextSize)}`">
        <div class="ai-token-bar-track progress-track">
            <div
                class="ai-token-bar-fill progress-fill"
                :class="{ warning: tokenUsagePercent > 75, danger: tokenUsagePercent > 90 }"
                :style="{ width: tokenUsagePercent + '%' }"></div>
        </div>
        <span class="ai-token-label"
            >{{ formatTokenCount(conversationTokenCount) }} / {{ formatTokenCount(status.contextSize) }} ·
            {{ tokenUsagePercent }}%</span
        >
    </div>
</template>

<style lang="scss" scoped>
.ai-messages {
    gap: $space-3;
    padding: $space-3;
}

// –– Empty state ––––––––––––––––––––

// Tighter than `.empty-state`: this one fills the whole conversation pane, so the
// rail panels' generous inset would push the call to action off-centre.
.ai-empty-state {
    padding: $space-4;
    gap: $space-4;
}

.ai-empty-icon {
    margin-bottom: $space-3;
    color: $text3;
}

.ai-empty-text {
    margin: 0;
    color: $text2;
    font-size: $font-size-sm;
    line-height: $line-height;
}

// –– Message bubbles ––––––––––––––––––––

// The role decides the side, the width, the fill and which corner stays square —
// the squared corner is the one nearest its own side, so the bubble points back
// at whoever said it.
.ai-message {
    display: flex;

    &:hover .ai-message-actions {
        opacity: 1;
    }

    &.user {
        justify-content: flex-end;

        .ai-message-wrapper {
            max-width: 85%;
        }

        .ai-message-content {
            background: $accent-color;
            border-radius: $border-radius-xl $border-radius-xl $border-radius-xs $border-radius-xl;

            // On-accent text is $base1, as in `.btn-accent` — $text3 is the hairline.
            color: $base1;
        }

        .ai-message-actions {
            justify-content: flex-end;
        }
    }

    &.assistant {
        justify-content: flex-start;

        .ai-message-wrapper {
            max-width: 90%;
        }

        .ai-message-content {
            background: $bg-primary;
            border-radius: $border-radius-xl $border-radius-xl $border-radius-xl $border-radius-xs;
            color: $text1;
        }

        .ai-message-actions {
            justify-content: flex-start;
        }
    }

    &.system {
        justify-content: center;

        .ai-message-wrapper {
            max-width: 95%;
        }
    }
}

// Positioned so the thinking label can sit in the bubble's corner.
.ai-message-wrapper {
    position: relative;
}

// `pre-wrap` is for plain text; the markdown layer resets it to `normal`.
.ai-message-content {
    padding: $space-3 $space-4;
    font-size: $font-size-sm;
    line-height: $line-height;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}

// A note from the app rather than from either party, so it is bordered instead of
// filled and centred instead of sided.
.ai-system-notice {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: $space-2 $space-3;
    background: $bg-secondary;
    border: $border-width-thin $border-color;
    border-radius: $border-radius-lg;
    color: $text2;
    font-size: $font-size-xs;
    font-style: italic;
    white-space: normal;

    svg {
        flex-shrink: 0;
        opacity: $opacity-mid;
    }
}

// –– Editing a sent message ––––––––––––––––––––

.ai-message-edit {
    gap: $space-1;
    width: 100%;
}

// Bounded rather than free: the field replaces a bubble in the flow, so it may not
// grow past the height of the conversation around it.
.ai-edit-input {
    min-height: $size-14;
    max-height: $size-21;
}

.ai-edit-actions {
    justify-content: flex-end;
    gap: $space-1;
}

// –– Streaming ––––––––––––––––––––

.ai-cursor {
    animation: blink 0.8s step-end infinite;
    color: $accent-color;
    font-size: $font-size-sm;
}

// –– Message actions ––––––––––––––––––––

// The cluster is `.actions-on-hover`; what is left is its inset. The reveal is
// hung on the message rather than on the row, so the buttons do not appear under a
// pointer that is only passing through.
.ai-message-actions {
    gap: $space-0;
    margin-top: $space-0;
    padding: 0 $space-0;
}

// –– Thinking block ––––––––––––––––––––

// The model's reasoning, kept visually subordinate to the answer: bordered, italic
// and capped, so a long chain of thought cannot bury the reply under it.
.ai-thinking-block {
    max-height: $size-24;
    margin-bottom: $space-2;
    padding: $space-2 $space-3;
    background: $bg-secondary;
    border: $border-width-thin $text3;
    border-radius: $border-radius;
    color: $text2;
    font-size: $font-size-xs;
    font-style: italic;
    white-space: pre-wrap;
    overflow-y: auto;
    overflow-wrap: break-word;
}

.ai-thinking-label {
    position: absolute;
    top: $space-3;
    right: $space-3;
    margin-bottom: $space-1;
    color: $text-muted;
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    font-style: normal;
    opacity: $opacity-mid-high;
    cursor: default;
}

.thinking-progress {
    animation: thinking-pulse 1.5s infinite;
}

// –– Load model banner ––––––––––––––––––––

.ai-load-model-banner {
    flex-shrink: 0;
    justify-content: space-between;
    gap: $space-2;
    padding: $space-2 $space-3;
    background: $bg-primary;
    border-top: $border-width-thin $text3;
}

.ai-load-model-banner-content {
    gap: $space-2;
    color: $text2;
    font-size: $font-size-xs;

    svg {
        flex-shrink: 0;
        opacity: $opacity-mid-high;
    }
}

.ai-load-model-btn {
    gap: $space-1;

    // The global ring is the accent colour, which is also this button's fill — so
    // on this one control it has to invert to stay visible.
    &:focus-visible {
        outline-color: $base1;
    }

    svg {
        flex-shrink: 0;
    }
}

// –– Token counter ––––––––––––––––––––

.ai-token-bar {
    flex-shrink: 0;
    gap: $space-2;
    padding: 0 $space-3;
}

// The groove and the fill are `.progress-track` / `.progress-fill`, shared with the media scrubber.
// A line thinner, because this one is only read, never aimed at.
.ai-token-bar-track {
    flex: 1;
    height: $size-1;
}

// Tabular figures so the count does not jitter as it climbs.
.ai-token-label {
    flex-shrink: 0;
    color: $text2;
    font-size: $font-size-xs;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
</style>
