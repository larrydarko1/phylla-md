<script setup lang="ts">
import { computed, ref, watch, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import IconChevronRight from '@/renderer/components/icons/IconChevronRight.vue';
import IconCode from '@/renderer/components/icons/IconCode.vue';
import IconFile from '@/renderer/components/icons/IconFile.vue';
import IconFileText from '@/renderer/components/icons/IconFileText.vue';
import IconFolder from '@/renderer/components/icons/IconFolder.vue';
import IconFolderOpen from '@/renderer/components/icons/IconFolderOpen.vue';
import IconImage from '@/renderer/components/icons/IconImage.vue';
import IconMusic from '@/renderer/components/icons/IconMusic.vue';
import IconPenTool from '@/renderer/components/icons/IconPenTool.vue';
import IconStar from '@/renderer/components/icons/IconStar.vue';
import IconVideo from '@/renderer/components/icons/IconVideo.vue';
import { useTreeNodeDrag } from '@/renderer/composables/vault/useTreeNodeDrag';
import {
    isImageFile as checkImage,
    isVideoFile as checkVideo,
    isAudioFile as checkAudio,
    isPdfFile as checkPdf,
    isDrawingFile as checkDrawing,
    isCodeFile as checkCode,
} from '@/renderer/utils/fileTypes';
import type { FileInfo, TreeNode } from '@/schemas/vault';

type Props = {
    node: TreeNode;
    depth: number;
    selectedFiles: FileInfo[];
    activeFile: FileInfo | null;
    renamingFile: FileInfo | null;
    selectedFolder: string | null;
    renamingFolder: string | null;
    renameValue: string;
    expandedFolders: Set<string>;
    bookmarkedFiles?: string[];
};

const props = defineProps<Props>();

const emit = defineEmits<{
    selectFile: [file: FileInfo, event?: MouseEvent, visibleFiles?: FileInfo[]];
    selectFolder: [path: string];
    toggleFolder: [path: string];
    rename: [];
    cancelRename: [];
    updateRenameValue: [value: string];
    contextMenu: [type: 'file' | 'folder', path: string, event: MouseEvent];
    moveFile: [filePath: string, targetFolderPath: string];
    moveFolder: [folderPath: string, targetFolderPath: string];
}>();

const { t } = useI18n();

const renameInput = useTemplateRef<HTMLInputElement>('renameInput');

// Marquee-on-hover: scroll truncated names so the full text becomes readable.
const folderNameTextEl = useTemplateRef<HTMLElement>('folderNameTextEl');
const fileNameTextEl = useTemplateRef<HTMLElement>('fileNameTextEl');
const folderScrollDistance = ref(0);
const fileScrollDistance = ref(0);
const folderScrollStyle = computed(() => scrollStyle(folderScrollDistance.value));
const fileScrollStyle = computed(() => scrollStyle(fileScrollDistance.value));

const { isDragging, isDragOver, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop } =
    useTreeNodeDrag(
        () => props.node,
        () => props.activeFile,
        (filePath, target) => emit('moveFile', filePath, target),
        (folderPath, target) => emit('moveFolder', folderPath, target),
    );

const isImageFile = computed(() => props.node.type === 'file' && checkImage(props.node.file?.extension ?? ''));
const isVideoFile = computed(() => props.node.type === 'file' && checkVideo(props.node.file?.extension ?? ''));
const isAudioFile = computed(() => props.node.type === 'file' && checkAudio(props.node.file?.extension ?? ''));
const isPdfFile = computed(() => props.node.type === 'file' && checkPdf(props.node.file?.extension ?? ''));
const isDrawingFile = computed(() => props.node.type === 'file' && checkDrawing(props.node.file?.extension ?? ''));
const isCodeFile = computed(() => props.node.type === 'file' && checkCode(props.node.file?.extension ?? ''));

const isExpanded = computed(() => {
    return props.node.type === 'folder' && props.expandedFolders.has(props.node.path);
});

const isRenaming = computed(() => {
    if (props.node.type === 'file') return props.renamingFile?.path === props.node.file?.path;
    return props.renamingFolder === props.node.path;
});

const isSelected = computed(() => {
    if (props.node.type === 'file') return props.selectedFiles.some((file) => file.path === props.node.file?.path);
    return props.selectedFolder === props.node.path;
});

const isActive = computed(() => {
    if (props.node.type === 'file') return props.activeFile?.path === props.node.file?.path;
    return false;
});

function handleFolderClick(): void {
    emit('selectFolder', props.node.path);
}

function handleFileClick(event: MouseEvent): void {
    if (props.node.file !== undefined) emit('selectFile', props.node.file, event, undefined);
}

function scrollStyle(distance: number): Record<string, string> {
    if (distance <= 0) return {};
    const duration = Math.max(1.2, distance / 40 + 0.8);
    return {
        '--scroll-distance': `-${distance}px`,
        '--scroll-duration': `${duration}s`,
    };
}

function onFolderNameEnter(): void {
    const el = folderNameTextEl.value;
    if (el === null) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 0) folderScrollDistance.value = overflow + 6;
}

function onFolderNameLeave(): void {
    folderScrollDistance.value = 0;
}

function onFileNameEnter(): void {
    const el = fileNameTextEl.value;
    if (el === null) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 0) fileScrollDistance.value = overflow + 6;
}

function onFileNameLeave(): void {
    fileScrollDistance.value = 0;
}

const getFileTypeLabel = (): string => {
    if (isImageFile.value) return t('file.image');
    if (isVideoFile.value) return t('file.video');
    if (isAudioFile.value) return t('file.audio');
    if (isPdfFile.value) return t('file.pdf');
    if (isDrawingFile.value) return t('file.drawing');
    if (isCodeFile.value) return t('file.code');
    return t('file.text');
};

watch(isRenaming, (renaming) => {
    if (renaming) {
        void nextTick(() => {
            if (renameInput.value !== null) {
                renameInput.value.focus();
                renameInput.value.select();
            }
        });
    }
});
</script>

<template>
    <div class="tree-node">
        <!-- Folder item -->
        <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/interactive-supports-focus -->
        <div
            v-if="node.type === 'folder'"
            class="folder-item row"
            :class="{
                'active': isSelected,
                'renaming': isRenaming,
                'drag-over drop-target': isDragOver,
                'is-dragging': isDragging,
            }"
            :style="{ paddingLeft: depth * 16 + 10 + 'px' }"
            role="treeitem"
            :aria-expanded="isExpanded"
            :aria-selected="isSelected"
            :aria-level="depth + 1"
            :aria-label="`Folder: ${node.name}`"
            draggable="true"
            @click="handleFolderClick"
            @contextmenu.prevent="$emit('contextMenu', 'folder', node.path, $event)"
            @mouseenter="onFolderNameEnter"
            @mouseleave="onFolderNameLeave"
            @focusin="onFolderNameEnter"
            @focusout="onFolderNameLeave"
            @dragstart="handleDragStart"
            @dragend="handleDragEnd"
            @dragover.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @drop.prevent="handleDrop">
            <!-- Expand/collapse button -->
            <button
                class="chevron-button"
                :aria-label="`${isExpanded ? 'Collapse' : 'Expand'} folder: ${node.name}`"
                :aria-pressed="isExpanded"
                @click.stop="$emit('toggleFolder', node.path)">
                <IconChevronRight
                    class="chevron"
                    :class="{ expanded: isExpanded }"
                    width="12"
                    height="12" />
            </button>

            <!-- Closed folder icon -->
            <IconFolder
                v-if="!isExpanded"
                class="folder-icon"
                width="14"
                height="14" />

            <!-- Open folder icon -->
            <IconFolderOpen
                v-else
                class="folder-icon folder-icon-open"
                width="14"
                height="14" />

            <!-- Folder name input (renaming) -->
            <input
                v-if="isRenaming"
                ref="renameInput"
                :value="renameValue"
                class="folder-name-input field field-sm"
                type="text"
                :aria-label="`${t('file.rename')}: ${node.name}`"
                @input="$emit('updateRenameValue', renameInput?.value ?? '')"
                @keydown.enter="renameInput?.blur()"
                @keydown.esc="$emit('cancelRename')"
                @blur="$emit('rename')"
                @click.stop />

            <!-- Folder name display -->
            <span
                v-else
                class="folder-name fill">
                <span
                    ref="folderNameTextEl"
                    class="name-text"
                    :class="{ scrolling: folderScrollDistance > 0 }"
                    :style="folderScrollStyle"
                    >{{ node.name }}</span
                >
            </span>
        </div>

        <!-- File item -->
        <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/interactive-supports-focus -->
        <div
            v-else
            class="file-item row"
            :class="{
                'selected': isSelected,
                'active': isActive,
                'renaming': isRenaming,
                'is-dragging': isDragging,
                'media-image': isImageFile,
                'media-video': isVideoFile,
                'media-audio': isAudioFile,
                'media-pdf': isPdfFile,
                'media-drawing': isDrawingFile,
            }"
            :style="{ paddingLeft: depth * 16 + 10 + 'px' }"
            role="treeitem"
            :aria-selected="isSelected"
            :aria-current="isActive ? 'page' : false"
            :aria-level="depth + 1"
            :aria-label="`${getFileTypeLabel()}: ${node.name}${node.file?.path && bookmarkedFiles?.includes(node.file.path) ? `, ${t('file.bookmarked')}` : ''}`"
            draggable="true"
            @click="handleFileClick"
            @contextmenu.prevent="node.file && $emit('contextMenu', 'file', node.file.path, $event)"
            @mouseenter="onFileNameEnter"
            @mouseleave="onFileNameLeave"
            @focusin="onFileNameEnter"
            @focusout="onFileNameLeave"
            @dragstart="handleDragStart"
            @dragend="handleDragEnd">
            <!-- Image icon for image files -->
            <IconImage
                v-if="isImageFile"
                class="file-icon"
                width="14"
                height="14" />

            <!-- Video icon for video files -->
            <IconVideo
                v-else-if="isVideoFile"
                class="file-icon"
                width="14"
                height="14" />

            <!-- Audio icon for audio files -->
            <IconMusic
                v-else-if="isAudioFile"
                class="file-icon"
                width="14"
                height="14" />

            <!-- PDF icon for PDF files -->
            <IconFileText
                v-else-if="isPdfFile"
                class="file-icon pdf-icon"
                width="14"
                height="14" />

            <!-- Drawing icon for drawing files -->
            <IconPenTool
                v-else-if="isDrawingFile"
                class="file-icon drawing-icon"
                width="14"
                height="14" />

            <!-- Code icon for code files -->
            <IconCode
                v-else-if="isCodeFile"
                class="file-icon code-icon"
                width="14"
                height="14" />

            <!-- Document icon for text files -->
            <IconFile
                v-else
                class="file-icon"
                width="14"
                height="14" />

            <!-- File name input (renaming) -->
            <input
                v-if="isRenaming"
                ref="renameInput"
                :value="renameValue"
                class="file-name-input field field-sm"
                type="text"
                :aria-label="`${t('file.rename')}: ${node.name}`"
                @input="$emit('updateRenameValue', renameInput?.value ?? '')"
                @keydown.enter="renameInput?.blur()"
                @keydown.esc="$emit('cancelRename')"
                @blur="$emit('rename')"
                @click.stop />

            <!-- File name display -->
            <span
                v-else
                class="file-name fill">
                <span
                    ref="fileNameTextEl"
                    class="name-text"
                    :class="{ scrolling: fileScrollDistance > 0 }"
                    :style="fileScrollStyle"
                    >{{ node.name }}</span
                >
            </span>

            <!-- Bookmark indicator -->
            <IconStar
                v-if="node.file && bookmarkedFiles?.includes(node.file.path)"
                class="bookmark-star"
                width="12"
                height="12"
                fill="currentColor" />
        </div>

        <!-- Recursively render children -->
        <template v-if="node.type === 'folder' && isExpanded && node.children">
            <div
                role="group"
                :aria-label="`${t('file.content_of')}: ${node.name}`">
                <FolderNode
                    v-for="child in node.children"
                    :key="child.path"
                    :node="child"
                    :depth="depth + 1"
                    :selected-files="selectedFiles"
                    :active-file="activeFile"
                    :renaming-file="renamingFile"
                    :selected-folder="selectedFolder"
                    :renaming-folder="renamingFolder"
                    :rename-value="renameValue"
                    :expanded-folders="expandedFolders"
                    :bookmarked-files="bookmarkedFiles ?? []"
                    @select-file="
                        (file: FileInfo, event?: MouseEvent, visibleFiles?: FileInfo[]) =>
                            $emit('selectFile', file, event, visibleFiles)
                    "
                    @select-folder="$emit('selectFolder', $event)"
                    @toggle-folder="$emit('toggleFolder', $event)"
                    @rename="$emit('rename')"
                    @cancel-rename="$emit('cancelRename')"
                    @update-rename-value="$emit('updateRenameValue', $event)"
                    @context-menu="
                        (type: 'file' | 'folder', path: string, event: MouseEvent) =>
                            $emit('contextMenu', type, path, event)
                    "
                    @move-file="
                        (filePath: string, targetFolderPath: string) => $emit('moveFile', filePath, targetFolderPath)
                    "
                    @move-folder="
                        (folderPath: string, targetFolderPath: string) =>
                            $emit('moveFolder', folderPath, targetFolderPath)
                    " />
            </div>
        </template>
    </div>
</template>

<style scoped lang="scss">
// –– The tree ––––––––––––––––––––

.tree-node {
    user-select: none;
}

// –– Rows ––––––––––––––––––––

// A folder row and a file row are the same row.
.folder-item,
.file-item {
    gap: $space-2;
    padding: $space-2 $space-4 $space-2 0;
    margin: $space-0 0;
    border-radius: $border-radius;
    cursor: pointer;
    transition: all $transition-fast;

    // A highlighted row pulls in from both edges, so its fill reads as a pill rather than as a band
    // across the pane.
    &:hover,
    &.active,
    &.selected,
    &.drag-over {
        margin-inline: $space-2;
    }

    &:hover {
        background: $bg-hover;
    }

    // The row that is open, or picked out for the next action. A file can be both at once —
    // `.selected` is the multi-selection, `.active` is the open tab.
    &.selected,
    &.active {
        background: $bg-selected;
    }

    // While being dragged the row stays where it is and fades, because the cursor
    // already carries the thing that is moving.
    &.is-dragging {
        opacity: $opacity-mid-low;
        cursor: move;
    }

    // The row is a text field now; a pointer over it would promise a click.
    &.renaming {
        cursor: default;
    }
}

.folder-item {
    color: $text1;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;

    &.active .folder-name {
        color: $accent-color;
    }
}

// –– Chevron ––––––––––––––––––––

// Only a hit area — the row draws everything, so this adds no padding of its own.
.chevron-button {
    margin: 0;
    padding: 0;
    background: none;
    border: none;
}

.chevron {
    flex-shrink: 0;
    margin-left: $space-0;
    color: $text2;
    cursor: pointer;
    transition: transform $transition-base;

    &.expanded {
        transform: rotate(90deg);
    }
}

// –– Icons ––––––––––––––––––––

.folder-icon {
    flex-shrink: 0;
    color: $text2;
    opacity: $opacity-higher;
}

// Brighter and dimmer than the `.file-icon` the result lists use: in a dense tree
// the icon is a texture down the left edge, not something to read.
.file-icon {
    color: $text2;
    opacity: $opacity-mid-high;
    margin: $space-0 $space-2;
}

.file-item.active .file-icon {
    opacity: 1;
}

// A drawing's mark is finer than the other glyphs, so it needs the extra strength
// to weigh the same in the column.
.file-item.media-drawing .drawing-icon {
    opacity: $opacity-almost-opaque;
}

.bookmark-star {
    flex-shrink: 0;
    margin-left: $space-1;
    color: $accent-color;
    opacity: $opacity-higher;
}

.file-item.active .bookmark-star {
    color: $text1;
    opacity: 1;
}

// –– Names ––––––––––––––––––––

// The name is `.fill`; this is only the clip, which belongs to the wrapper because
// the span inside it is allowed to overflow while it scrolls.
.folder-name,
.file-name {
    overflow: hidden;
}

// The marquee. A name too long for the row scrolls it through on hover instead of
// ending in an ellipsis, over a distance the component measures and passes in.
.name-text {
    display: block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.scrolling {
        width: max-content;
        max-width: none;
        overflow: visible;
        text-overflow: clip;
        animation: name-scroll var(--scroll-duration, 2s) linear infinite;
    }
}

// The global reduced-motion rule shortens animations rather than removing them,
// which for a loop means it never stops. This one has to be turned off outright.
@media (prefers-reduced-motion: reduce) {
    .name-text.scrolling {
        animation: none;
    }
}

// –– Rename ––––––––––––––––––––

// It replaces a row's label rather than standing on its own, so it fits the row and matches the
// text it took over.
.folder-name-input,
.file-name-input {
    flex: 1;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
}
</style>
