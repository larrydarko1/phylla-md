<script setup lang="ts">
import { keymap, EditorView } from '@codemirror/view';
import { ref, watch, onMounted, onUnmounted, computed, shallowRef, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import DrawingCanvas from '@/renderer/components/DrawingCanvas.vue';
import AudioViewer from '@/renderer/components/editor/AudioViewer.vue';
import ImageViewer from '@/renderer/components/editor/ImageViewer.vue';
import MarkdownToolbar from '@/renderer/components/editor/MarkdownToolbar.vue';
import PdfViewer from '@/renderer/components/editor/PdfViewer.vue';
import VideoViewer from '@/renderer/components/editor/VideoViewer.vue';
import IconDownload from '@/renderer/components/icons/IconDownload.vue';
import IconLoader from '@/renderer/components/icons/IconLoader.vue';
import IconMic from '@/renderer/components/icons/IconMic.vue';
import { listContinuationKeymap } from '@/renderer/composables/editor/codemirror/cm-list-continuation';
import {
    createMarkdownWidgetsPlugin,
    interactiveExtension,
} from '@/renderer/composables/editor/codemirror/cm-markdown-widgets';
import { taskFoldExtension } from '@/renderer/composables/editor/codemirror/cm-task-fold';
import { phyllaEditorTheme } from '@/renderer/composables/editor/codemirror/cm-theme';
import { useCodemirrorToolbar, markdownKeymap } from '@/renderer/composables/editor/codemirror/cm-toolbar';
import { useCodeEditor } from '@/renderer/composables/editor/codemirror/useCodeEditor';
import { useCodemirror } from '@/renderer/composables/editor/codemirror/useCodemirror';
import { useDictation } from '@/renderer/composables/editor/useDictation';
import { useEditorDrop } from '@/renderer/composables/editor/useEditorDrop';
import { useEmbedResolver } from '@/renderer/composables/editor/useEmbedResolver';
import { useNotePersistence } from '@/renderer/composables/editor/useNotePersistence';
import { useDebounceFn } from '@/renderer/composables/useDebounce';
import {
    isImageFile as checkImage,
    isVideoFile as checkVideo,
    isAudioFile as checkAudio,
    isPdfFile as checkPdf,
    isCodeFile as checkCode,
    isMarkdownFile as checkMarkdown,
    isDrawingFile as checkDrawing,
} from '@/renderer/utils/fileTypes';
import type { FileInfo } from '@/schemas/vault';

type Props = {
    file: FileInfo | null;
    workspacePath: string | null;
};

const props = defineProps<Props>();

const emit = defineEmits<{
    save: [content: string];
    contentChanged: [hasChanges: boolean];
}>();

defineExpose({ reloadContent });

const { t } = useI18n();

// CodeMirror container ref (replaces textarea + preview)
const cmContainerRef = useTemplateRef<HTMLElement>('cmContainerRef');
// CodeMirror container ref for code files
const codeContainerRef = useTemplateRef<HTMLElement>('codeContainerRef');
// Textarea ref for plain-text (non-markdown) files
const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');

// Obsidian-style embed resolver (must be initialized before useNotePersistence)
const {
    embedCache,
    embedCacheVersion,
    resolveEmbeds,
    getEmbedMediaType,
    clearCache: clearEmbedCache,
} = useEmbedResolver(
    () => props.file,
    () => props.workspacePath,
);

const debouncedEmitContentChanged = useDebounceFn(
    (hasChanges: boolean) => {
        emit('contentChanged', hasChanges);
    },
    { ms: 150, maxWait: 500 },
);

const {
    content,
    originalContent,
    hasUnsavedChanges,
    lastLoadedPath,
    justSaved,
    onContentChange,
    saveFile,
    loadFile,
    handleDrawingSave,
    clearAutoSaveTimeout,
} = useNotePersistence(
    () => props.file,
    () => props.file !== null && checkMarkdown(props.file.extension),
    (s) => {
        void resolveEmbeds(s);
    },
    (c) => emit('save', c),
    (v) => debouncedEmitContentChanged(v),
);

// Dictation
const { isDictating, isDictationLoading, toggleDictation, stopDictation } = useDictation(content, onContentChange);

// Check if current file is an image
const isImageFile = computed(() => props.file !== null && checkImage(props.file.extension));
const isVideoFile = computed(() => props.file !== null && checkVideo(props.file.extension));
const isAudioFile = computed(() => props.file !== null && checkAudio(props.file.extension));
const isPdfFile = computed(() => props.file !== null && checkPdf(props.file.extension));
const isCodeFile = computed(() => props.file !== null && checkCode(props.file.extension));
const isMarkdownFile = computed(() => props.file !== null && checkMarkdown(props.file.extension));
const isDrawingFile = computed(() => props.file !== null && checkDrawing(props.file.extension));

// Check if current file supports dictation (txt or md only)
const isDictatable = computed(() => {
    if (props.file === null) return false;
    const ext = props.file.extension.toLowerCase();
    return ext === '.txt' || ext === '.md';
});

// CodeMirror markdown editor (live preview mode)
const cmViewRef = shallowRef<EditorView | null>(null);

// Build CodeMirror extensions for markdown: live-preview, widgets, toolbar keybindings, list continuation
const markdownWidgetsPlugin = createMarkdownWidgetsPlugin(embedCache, embedCacheVersion, getEmbedMediaType);
const cmExtensions = [
    markdownWidgetsPlugin,
    interactiveExtension,
    listContinuationKeymap,
    taskFoldExtension(),
    phyllaEditorTheme,
    keymap.of(markdownKeymap(cmViewRef)),
    keymap.of([
        {
            key: 'Mod-s',
            run: (): boolean => {
                void saveFile();
                return true;
            },
        },
    ]),
    // Prevent CM6 from inserting raw text when files are dropped. In-vault drags ("file:" payload) are turned into embeds by useEditorDrop
    EditorView.domEventHandlers({
        drop(event: DragEvent): boolean {
            const dt = event.dataTransfer;
            if (dt === null) return false;
            const plain = dt.getData('text/plain');
            if ((plain !== '' && plain.startsWith('file:')) || dt.types.includes('Files')) {
                return true; // mark handled — CM6 won't insert raw text
            }
            return false;
        },
    }),
];

// A reactive file identifier — changes whenever a different file is loaded,
// telling CodeMirror to fully reset its state (undo history, scroll, cursor).
const cmFileId = computed(() => props.file?.path ?? null);

// Create CodeMirror instance (will mount/unmount reactively via v-if)
const { view: cmView } = useCodemirror(cmContainerRef, content, onContentChange, {
    extraExtensions: cmExtensions,
    placeholderText: 'Start writing...',
    fileId: cmFileId,
});

// ── Code file editor (syntax-highlighted, non-markdown) ──────────────
const codeFileExtension = computed(() => (props.file !== null ? props.file.extension : ''));

// Toolbar commands backed by CodeMirror
const { mdFormatText, mdInsertHeading } = useCodemirrorToolbar(cmViewRef);

// Editor drag-and-drop (showPreview no longer needed — always in live-preview mode)
const showPreview = ref(false);

// kept for useEditorDrop API compat, always false now
const { isDragOverEditor, onEditorDragEnter, onEditorDragOver, onEditorDragLeave, onFileDrop } = useEditorDrop({
    isMarkdownFile,
    findFile: (): FileInfo | null => props.file,
    textareaRef,
    showPreview,
    content,
    onContentChange,
    cmViewRef,
});

/** Reload the current file's content from disk */
async function reloadContent(): Promise<void> {
    if (props.file !== null) {
        await loadFile(props.file);
    }
}

// Keyboard shortcuts
function handleKeyboard(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveFile();
    }
}

// Prevent Electron from navigating when files are dropped anywhere on the window
function preventGlobalDrop(event: DragEvent): void {
    event.preventDefault();
}
function preventGlobalDragOver(event: DragEvent): void {
    event.preventDefault();
}

// Keep the shared ref in sync
watch(
    cmView,
    (v) => {
        cmViewRef.value = v;
    },
    { immediate: true },
);

useCodeEditor(codeContainerRef, content, onContentChange, codeFileExtension, cmFileId);

// When embed cache updates (async resolution), poke CodeMirror so the
// widget plugin re-evaluates and renders the newly resolved embeds.
watch(embedCacheVersion, () => {
    const editorView = cmViewRef.value;
    if (editorView === null) return;
    // Dispatch a no-op transaction to trigger plugin update() calls
    editorView.dispatch({});
});

// Watch for file changes
watch(
    () => props.file,
    async (newFile) => {
        // If the file path hasn't changed, skip the full reload.
        // This prevents autosave-triggered FS watcher refreshes from overwriting content.
        if (newFile !== null && lastLoadedPath.value !== null && newFile.path === lastLoadedPath.value) {
            // If we just saved, clear the flag and skip entirely
            if (justSaved.value) {
                justSaved.value = false;
                return;
            }
            // Same file but not our save — could be an external change.
            // Only reload if we have no unsaved changes (don't overwrite user's work).
            if (!hasUnsavedChanges.value) {
                const result = await window.electronAPI.readFile(newFile.path);
                if (result.success && result.content !== undefined && result.content !== content.value) {
                    content.value = result.content;
                    originalContent.value = result.content;
                }
            }
            return;
        }

        // Different file — do a full load with state reset
        lastLoadedPath.value = newFile !== null ? newFile.path : null;

        // Clear embed cache when switching files
        clearEmbedCache();

        if (newFile !== null) {
            const ext = newFile.extension.toLowerCase();

            if (checkImage(ext) || checkVideo(ext) || checkAudio(ext) || checkPdf(ext)) {
                // Media file: clear text state (sub-components handle their own loading)
                content.value = '';
                originalContent.value = '';
                hasUnsavedChanges.value = false;
            } else {
                // Text file: load content
                await loadFile(newFile);
            }
        } else {
            content.value = '';
            originalContent.value = '';
            hasUnsavedChanges.value = false;
        }
    },
    { immediate: true },
);

onMounted(() => {
    document.addEventListener('drop', preventGlobalDrop, true);
    document.addEventListener('dragover', preventGlobalDragOver, true);
});

// Cleanup
onUnmounted(() => {
    clearAutoSaveTimeout();
    debouncedEmitContentChanged.cancel();
    if (isDictating.value) {
        stopDictation();
    }
    document.removeEventListener('drop', preventGlobalDrop, true);
    document.removeEventListener('dragover', preventGlobalDragOver, true);
    window.removeEventListener('keydown', handleKeyboard);
});

// Add keyboard listener
if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyboard);
}
</script>

<template>
    <div
        class="note-editor stack"
        role="main"
        :aria-label="t('editor.note_editor')">
        <!-- Media viewers -->
        <section
            v-if="file && isImageFile"
            :aria-label="t('editor.image_viewer')">
            <ImageViewer
                :file-path="file.path"
                :file-name="file.name" />
        </section>

        <section
            v-else-if="file && isVideoFile"
            :aria-label="t('editor.video_viewer')">
            <VideoViewer :file-path="file.path" />
        </section>

        <section
            v-else-if="file && isPdfFile"
            :aria-label="t('editor.pdf_viewer')">
            <PdfViewer :file-path="file.path" />
        </section>

        <section
            v-else-if="file && isAudioFile"
            :aria-label="t('editor.audio_player')">
            <AudioViewer :file-path="file.path" />
        </section>

        <!-- Drawing canvas for drawing files -->
        <section
            v-else-if="file && isDrawingFile"
            :aria-label="t('editor.drawing_canvas')">
            <DrawingCanvas
                :file-path="file.path"
                :initial-content="content"
                @save="handleDrawingSave"
                @content-changed="(hasChanges) => (hasUnsavedChanges = hasChanges)" />
        </section>

        <!-- Text editor for text files -->
        <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
        <section
            v-else-if="file && !isImageFile && !isVideoFile && !isAudioFile && !isPdfFile && !isDrawingFile"
            class="text-editor-container stack fill"
            :aria-label="t('editor.text_editor')"
            @dragenter.prevent="onEditorDragEnter"
            @dragover.prevent="onEditorDragOver"
            @dragleave.prevent="onEditorDragLeave"
            @drop.prevent="onFileDrop">
            <!-- Drop overlay for drag-and-drop media embed -->
            <div
                v-show="isDragOverEditor"
                class="drop-overlay"
                role="status"
                aria-live="polite"
                :aria-label="t('editor.drag_and_drop_zone_active')">
                <div class="drop-overlay-content">
                    <IconDownload
                        width="40"
                        height="40"
                        stroke-width="1.5" />
                    <p>{{ t('editor.drop_to_embed') }}</p>
                </div>
            </div>

            <!-- Markdown formatting toolbar -->
            <nav
                v-if="isMarkdownFile"
                :aria-label="t('editor.markdown_formatting_toolbar')">
                <MarkdownToolbar
                    @format="mdFormatText"
                    @heading="mdInsertHeading" />
            </nav>

            <!-- CodeMirror live-preview editor for markdown files -->
            <div
                v-if="isMarkdownFile"
                ref="cmContainerRef"
                class="cm-editor-container stack fill"
                role="textbox"
                :aria-label="t('editor.markdown_editor')"
                aria-multiline="true"></div>

            <!-- CodeMirror code editor for code files -->
            <div
                v-else-if="isCodeFile"
                ref="codeContainerRef"
                class="cm-editor-container code-editor-container stack fill"
                role="textbox"
                :aria-label="t('editor.code_editor')"
                aria-multiline="true"></div>

            <!-- Plain textarea for other text files -->
            <textarea
                v-else
                ref="textareaRef"
                v-model="content"
                class="editor-textarea field-bare field-bare-grow"
                placeholder="Start writing..."
                :aria-label="t('editor.text_editor')"
                @input="onContentChange"></textarea>

            <!-- Dictation button for txt/md files -->
            <button
                v-if="isDictatable"
                class="dictation-btn icon-btn"
                :class="{ active: isDictating, loading: isDictationLoading }"
                :aria-pressed="isDictating"
                :aria-label="
                    isDictating
                        ? t('editor.stop_dictation')
                        : isDictationLoading
                          ? t('editor.loading_whisper_model')
                          : t('editor.start_dictation')
                "
                :disabled="isDictationLoading"
                @click="toggleDictation">
                <!-- Microphone icon -->
                <IconMic
                    v-if="!isDictationLoading"
                    width="18"
                    height="18" />
                <!-- Loading spinner -->
                <IconLoader
                    v-else
                    class="spin"
                    width="18"
                    height="18" />
                <!-- Pulsing dot when active -->
                <span
                    v-if="isDictating"
                    class="dictation-pulse"
                    aria-hidden="true"></span>
            </button>
        </section>

        <!-- Empty state -->
        <section
            v-else
            class="editor-empty hero"
            aria-label="No note selected">
            <div class="empty-message hero-content">
                <div class="empty-logo hero-brand">
                    <img
                        draggable="false"
                        src="@/renderer/assets/icons/icon.png"
                        :alt="t('editor.phylla_logo')"
                        class="empty-logo-icon hero-brand-icon" />
                    <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -- brand name, not translated -->
                    <span class="empty-logo-text hero-brand-text">phylla.</span>
                </div>
                <h2 class="hero-title">{{ t('editor.select_note_to_start_editing') }}</h2>
                <p class="hint">{{ t('editor.or_create_new_note') }}</p>
            </div>
        </section>
    </div>
</template>

<style scoped lang="scss">
// –– Shell ––––––––––––––––––––

// The column is `.stack`; the editor only needs to be the positioning context its
// drop overlay and dictation button are placed against.
.note-editor {
    position: relative;
    height: 100%;
    overflow: hidden;
}

.text-editor-container {
    position: relative;
    overflow: hidden;
}

// CodeMirror sizes itself from its container, so the container has to be the one that ends —
// otherwise the editor grows with the document and the pane scrolls, not the text.
.cm-editor-container {
    overflow: hidden;

    :deep(.cm-editor) {
        flex: 1;
        height: 100%;
        overflow: hidden;
    }
}

// –– Drop overlay ––––––––––––––––––––

// Not `.drop-target`: that marks a row or a well that is already there, while this is a whole layer
// over the text — dimming what is underneath is the point of it.
.drop-overlay {
    position: absolute;
    inset: 0;
    z-index: $z-dropdown;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, $base1 85%, transparent);
    backdrop-filter: blur($backdrop-blur-xs);
    border: $border-width-md $accent-color;
    border-radius: $border-radius-lg;
    margin: $space-2;
    pointer-events: none;
}

.drop-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-2;
    color: $accent-color;

    svg {
        opacity: $opacity-higher;
    }

    p {
        margin: 0;
        font-size: $font-size-base;
        font-weight: $font-weight-medium;
    }
}

// –– Textarea ––––––––––––––––––––

// The plain-text editor is `.field-bare .field-bare-grow`; what is left is that it is a page of
// prose rather than a line in a row.
.editor-textarea {
    padding: $space-7;
    font-size: $font-size-base;
    cursor: text;
}

// –– Dictation ––––––––––––––––––––

// An `.icon-btn` lifted off the page: it floats over the text it is about to write
// into, so unlike the other icon buttons it carries its own surface and shadow.
.dictation-btn {
    position: absolute;
    right: $space-5;
    bottom: $space-5;
    z-index: $z-mid;
    width: $size-14;
    height: $size-14;
    background: $base1;
    border: $border-width-thin $text3;
    border-radius: $border-radius-xl;
    box-shadow: $shadow-sm;

    &:hover:not(:disabled) {
        border-color: $text2;
    }

    // Recording. Red at rest rather than on hover, for the same reason
    // `.menu-item-danger` is: a state you have to hover to see is a state you miss.
    &.active {
        background: $danger-color;

        // Dark on the fill, like `.btn-danger`.
        color: $base1;
        border-color: $danger-color;
        box-shadow: $red-shadow;
    }

    // Fetching the Whisper model. Not the shared `:disabled` fade — this button
    // will become available on its own, so the cursor says wait rather than no.
    &.loading {
        opacity: $opacity-mid;
    }

    &:disabled {
        cursor: wait;
    }

    .spin {
        animation: spin $transition-fast linear infinite;
    }
}

// The dot that says the microphone is live, pinned to the button's corner.
.dictation-pulse {
    position: absolute;
    top: -$size-1;
    right: -$size-1;
    width: $size-5;
    height: $size-5;
    border-radius: $border-radius-round;
    background: $danger-color;
    animation: pulse 1.5s ease-in-out infinite;
}

// –– Sections ––––––––––––––––––––

// Each viewer is wrapped in a `<section>` for its accessible name only; the box it
// would otherwise introduce would break the column it sits in.
section {
    display: contents;
}
</style>
