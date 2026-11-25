<script setup lang="ts">
import { ref, onMounted, computed, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import IconClose from '@/renderer/components/icons/IconClose.vue';
import IconFile from '@/renderer/components/icons/IconFile.vue';
import IconPaperclip from '@/renderer/components/icons/IconPaperclip.vue';
import IconSend from '@/renderer/components/icons/IconSend.vue';
import IconSquare from '@/renderer/components/icons/IconSquare.vue';
import IconThinking from '@/renderer/components/icons/IconThinking.vue';
import { useThrottleFn } from '@/renderer/composables/useThrottle';
import type { FileInfo } from '@/schemas/vault';

type Props = {
    showThinking: boolean;
    inputMessage: string;
    isReady: boolean;
    isAnyGenerating: boolean;
    isStreaming: boolean;
    contextFiles?: FileInfo[];
    availableFiles?: FileInfo[];
    maxContextFiles?: number;
};

const props = withDefaults(defineProps<Props>(), {
    contextFiles: (): FileInfo[] => [],
    availableFiles: (): FileInfo[] => [],
    maxContextFiles: 10,
});

const emit = defineEmits<{
    'update:inputMessage': [value: string];
    'update:showThinking': [value: boolean];
    'add-context-file': [file: FileInfo];
    'remove-context-file': [path: string];
    'send': [];
    'stop': [];
}>();

const minHeight = 40;
const maxHeight = 150;

const { t } = useI18n();

// Exposed so AiPanel can focus the input after loading a model.
const inputField = useTemplateRef<HTMLTextAreaElement>('inputField');
defineExpose({ inputField });

// ––– Context file picker –––

const showFilePicker = ref(false);
const fileSearch = ref('');
const fileSearchInput = useTemplateRef<HTMLInputElement>('fileSearchInput');

const canAddMore = computed(() => props.contextFiles.length < props.maxContextFiles);

const filteredAvailableFiles = computed(() => {
    const query = fileSearch.value.trim().toLowerCase();
    if (query === '') return props.availableFiles;
    return props.availableFiles.filter(
        (f) => f.name.toLowerCase().includes(query) || f.relativePath.toLowerCase().includes(query),
    );
});

const isResizing = ref(false);
const maxHeightPx = ref(120);

function toggleFilePicker(): void {
    if (showFilePicker.value) {
        showFilePicker.value = false;
        return;
    }
    if (!canAddMore.value) return;
    showFilePicker.value = true;
    fileSearch.value = '';
    void nextTick(() => fileSearchInput.value?.focus());
}

function selectContextFile(file: FileInfo): void {
    emit('add-context-file', file);
    showFilePicker.value = false;
}

function startResize(e: MouseEvent): void {
    e.preventDefault();
    isResizing.value = true;
    const startY = e.clientY;
    const startHeight = maxHeightPx.value;

    // Prevent text selection during drag
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const handleMouseMove = useThrottleFn((moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + delta));
        maxHeightPx.value = newHeight;
    }, 16);

    const handleMouseUp = (): void => {
        isResizing.value = false;
        document.body.style.userSelect = originalUserSelect;
        // Save the new height preference
        localStorage.setItem('ai-input-max-height', maxHeightPx.value.toString());
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        handleMouseMove.cancel();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function onInput(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) emit('update:inputMessage', event.target.value);
}

onMounted(() => {
    // Restore saved height preference if available
    const saved = localStorage.getItem('ai-input-max-height');
    if (saved !== null && saved !== '') {
        const value = parseInt(saved, 10);
        if (!isNaN(value) && value >= minHeight && value <= maxHeight) maxHeightPx.value = value;
    }
});
</script>

<template>
    <div class="ai-input-area stack">
        <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
        <div
            class="ai-resize-handle row"
            :class="{ 'ai-resize-active': isResizing }"
            :title="t('ai.drag_to_resize_input_area')"
            @mousedown="startResize">
            <div class="ai-resize-grip" />
        </div>

        <!-- Attached context files -->
        <div
            v-if="contextFiles.length > 0"
            class="ai-context-files stack">
            <span class="ai-context-files-label"
                >{{ t('ai.context_files') }} ({{ contextFiles.length }}/{{ maxContextFiles }})</span
            >
            <div class="ai-context-chips row">
                <span
                    v-for="file in contextFiles"
                    :key="file.path"
                    class="ai-context-chip"
                    :title="file.relativePath">
                    <IconFile
                        width="11"
                        height="11" />
                    <span class="ai-context-chip-name truncate">{{ file.name }}</span>
                    <button
                        type="button"
                        class="ai-context-chip-remove icon-btn icon-btn-danger"
                        :title="t('ai.remove_from_context')"
                        :aria-label="t('ai.remove_file_from_context', { file: file.name })"
                        @click="$emit('remove-context-file', file.path)">
                        <IconClose
                            width="10"
                            height="10"
                            stroke-width="2.5" />
                    </button>
                </span>
            </div>
        </div>

        <div
            class="ai-input-row field-well"
            :class="{ 'ai-input-activated': isStreaming }">
            <textarea
                ref="inputField"
                :value="inputMessage"
                :placeholder="t('ai.ask_something')"
                class="ai-input field-bare field-bare-grow"
                :style="{ height: maxHeightPx + 'px' }"
                :disabled="!isReady || isAnyGenerating"
                rows="1"
                aria-label="AI message input"
                @input="onInput"
                @keydown.enter.exact.prevent="$emit('send')" />
            <div class="ai-input-controls row">
                <div class="ai-input-tools row">
                    <!-- Add files to context -->
                    <div class="ai-context-picker row">
                        <button
                            type="button"
                            class="ai-context-toggle ai-add-context-btn icon-btn"
                            :class="{ 'ai-context-active': showFilePicker }"
                            :title="t('ai.add_files_to_context')"
                            :aria-label="t('ai.add_files_to_context')"
                            :disabled="!canAddMore && !showFilePicker"
                            @click="toggleFilePicker">
                            <IconPaperclip
                                width="14"
                                height="14" />
                        </button>
                        <!-- eslint-disable-next-line a11y/no-static-element-interactions, a11y/click-events-have-key-events -->
                        <div
                            v-if="showFilePicker"
                            class="ai-file-picker-overlay menu-overlay"
                            @click="showFilePicker = false" />
                        <div
                            v-if="showFilePicker"
                            class="ai-file-picker stack floating">
                            <input
                                ref="fileSearchInput"
                                v-model="fileSearch"
                                type="text"
                                class="ai-file-picker-search field-bare"
                                :placeholder="t('ai.search_files')"
                                :aria-label="t('ai.search_files')" />
                            <ul class="ai-file-picker-list scroll-y">
                                <li
                                    v-if="filteredAvailableFiles.length === 0"
                                    class="ai-file-picker-empty menu-empty">
                                    {{ t('ai.no_files_to_add') }}
                                </li>
                                <li
                                    v-for="file in filteredAvailableFiles"
                                    :key="file.path">
                                    <button
                                        type="button"
                                        class="ai-file-picker-item menu-item menu-item-stacked"
                                        @click="selectContextFile(file)">
                                        <span class="ai-file-picker-item-name menu-item-name truncate">{{
                                            file.name
                                        }}</span>
                                        <span class="ai-file-picker-item-path menu-item-desc truncate">{{
                                            file.relativePath
                                        }}</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <button
                        type="button"
                        class="ai-context-toggle icon-btn"
                        :class="{ 'ai-context-active': showThinking }"
                        :title="t('ai.show_thinking')"
                        :aria-label="t('ai.show_thinking')"
                        :aria-pressed="showThinking"
                        @click="$emit('update:showThinking', !showThinking)">
                        <IconThinking
                            height="14"
                            width="14" />
                    </button>
                </div>
                <button
                    v-if="isStreaming"
                    class="ai-btn-send ai-btn-stop btn-accent btn-accent-square btn-danger"
                    :title="t('ai.stop_generating')"
                    :aria-label="t('ai.stop_generating')"
                    @click="$emit('stop')">
                    <IconSquare
                        width="14"
                        height="14" />
                </button>
                <button
                    v-else
                    class="ai-btn-send btn-accent btn-accent-square"
                    :disabled="!inputMessage.trim() || !isReady || isStreaming"
                    :title="t('ai.send_message')"
                    :aria-label="t('ai.send_message')"
                    @click="$emit('send')">
                    <IconSend
                        width="16"
                        height="16"
                        stroke-width="1.5" />
                </button>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.ai-input-area {
    flex-shrink: 0;
    padding: $space-2 $space-3 $space-3;
    user-select: none;
}

// –– Resize handle ––––––––––––––––––––

// A drag target with no appearance of its own: the grip inside it is what the
// pointer sees, and the handle is only the area that catches the drag.
.ai-resize-handle {
    justify-content: center;
    height: $size-6;
    margin-top: $space-1;
    cursor: ns-resize;
    user-select: none;

    &:hover .ai-resize-grip,
    &.ai-resize-active .ai-resize-grip {
        background-color: $accent-color;
        opacity: 1;
    }
}

.ai-resize-grip {
    width: $size-14;
    height: $size-1;
    background-color: $text3;
    border-radius: $border-radius-xs;
    opacity: $opacity-low;
    transition:
        opacity $transition-base,
        background-color $transition-base;
}

// –– Composer ––––––––––––––––––––

// The composer is a `.field-well` turned on its side: the field takes the full width and the
// controls sit under it. A column, so the buttons stay put as the textarea grows.
.ai-input-row {
    flex-direction: column;
    align-items: stretch;
    padding: $space-1;
    border-radius: $border-radius-xl;

    // While a reply is streaming the border becomes a rotating conic gradient: the ::before is the
    // wheel and the ::after masks all but its edge, so the row needs its own stacking context.
    &.ai-input-activated {
        position: relative;
        overflow: hidden;
        isolation: isolate;
        border-color: transparent;

        &::before {
            content: '';
            position: absolute;
            inset: -50%;
            z-index: -2;
            background: conic-gradient(
                from 0deg,
                transparent 0deg,
                transparent 260deg,
                $accent-color 290deg,
                $accent-color 340deg,
                transparent 360deg
            );
            animation: ai-border-spin 2s linear infinite;
        }

        &::after {
            content: '';
            position: absolute;
            inset: $size-0;
            z-index: $z-negative;
            background: $bg-primary;
            border-radius: $border-radius-xl;
        }
    }
}

// The field's height is the one the drag handle stored, so it must refuse the `flex: 1` that
// `.field-bare-grow` gives NoteEditor's full-height editor.
.ai-input {
    flex: none;
}

// –– Control row ––––––––––––––––––––

// The composer's own footer: what the message is made of on the left, what sends
// it on the right.
.ai-input-controls {
    justify-content: space-between;
    gap: $space-1;
    padding: 0 $space-0 $space-0 $space-1;
}

.ai-input-tools {
    gap: $space-0;
}

// –– Context toggles ––––––––––––––––––––

// The two switches at the left of the control row — attach files, show thinking. Their state is a
// colour rather than a fill, because a fill here reads as a second row of chrome.
.ai-context-toggle {
    input {
        display: none;
    }
}

.ai-context-active {
    color: $accent-color;
}

.ai-add-context-btn {
    &:disabled:hover {
        background: transparent;
        color: $text2;
    }
}

// –– Attached context files ––––––––––––––––––––

.ai-context-files {
    gap: $space-1;
    padding: 0 $space-1 $space-2;
}

.ai-context-files-label {
    color: $text2;
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
}

.ai-context-chips {
    flex-wrap: wrap;
    gap: $space-1;
}

.ai-context-chip {
    gap: $space-1;
    max-width: 100%;
    padding: $space-0 $space-1 $space-0 $space-2;
    background: $bg-hover;
    border: $border-width-thin $text3;
    border-radius: $border-radius;
    color: $text1;
    font-size: $font-size-xs;

    svg {
        flex-shrink: 0;
        color: $accent-color;
    }
}

.ai-context-chip-name {
    max-width: $size-22;
}

.ai-context-chip-remove {
    padding: $space-0;
    border-radius: $border-radius-xs;
}

// –– Context file picker ––––––––––––––––––––

// The containing block for the picker below, which is positioned against this button rather than
// against the panel.
.ai-context-picker {
    position: relative;
    flex-shrink: 0;
}

// Opens upward, because the composer is at the bottom of the panel. `overflow:
// hidden` is what keeps the search field's own corners inside the rounded edge.
.ai-file-picker {
    position: absolute;
    bottom: calc(100% + #{$space-1});
    left: 0;
    z-index: $z-overlay;
    width: $size-27;
    max-width: 80vw;
    overflow: hidden;
}

.ai-file-picker-search {
    border-bottom: $border-width-thin $text3;
}

.ai-file-picker-list {
    margin: 0;
    padding: $space-1;
    max-height: $size-25;
    list-style: none;
}

// The two lines are `.menu-item-name` over `.menu-item-desc`, as in the system-prompt list.
.ai-file-picker-item {
    flex-direction: column;
    gap: $space-0;
    padding: $space-1 $space-2;
}
</style>
