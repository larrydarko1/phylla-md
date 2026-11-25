<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import IconClose from '@/renderer/components/icons/IconClose.vue';
import type { TabState } from '@/schemas/vault';

type Props = {
    tabs: TabState[];
    activeIndex: number;
};

defineProps<Props>();

const emit = defineEmits<{
    switch: [index: number];
    close: [index: number];
    reorder: [from: number, to: number];
}>();

// Pre-load a transparent 1x1 GIF so it's decoded before the first drag event
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const { t } = useI18n();

const dragGhost = new Image();

const dragStartIndex = ref(-1);
const dragOverIndex = ref(-1);

function getFileNameWithoutExtension(name: string): string {
    const last = name.lastIndexOf('.');
    return last > 0 ? name.substring(0, last) : name;
}

function handleMiddleClick(e: MouseEvent, index: number): void {
    if (e.button === 1) {
        e.preventDefault();
        emit('close', index);
    }
}

function onDragStart(e: DragEvent, index: number): void {
    dragStartIndex.value = index;
    if (e.dataTransfer !== null) {
        e.dataTransfer.effectAllowed = 'move';
        // Suppress the default favicon ghost with a pre-loaded transparent image
        e.dataTransfer.setDragImage(dragGhost, 0, 0);
    }
}

function onDragOver(e: DragEvent, index: number): void {
    e.preventDefault();
    if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move';
    dragOverIndex.value = index;
}

function onDrop(e: DragEvent, index: number): void {
    e.preventDefault();
    if (dragStartIndex.value !== -1 && dragStartIndex.value !== index) emit('reorder', dragStartIndex.value, index);
    dragStartIndex.value = -1;
    dragOverIndex.value = -1;
}

function onDragEnd(): void {
    dragStartIndex.value = -1;
    dragOverIndex.value = -1;
}

dragGhost.src = TRANSPARENT_GIF;
</script>

<template>
    <div
        v-if="tabs.length > 0"
        class="tab-bar scroll-x-hidden"
        role="tablist"
        :aria-label="t('app.open_files')">
        <div
            v-for="(tab, i) in tabs"
            :key="tab.file.path"
            class="tab"
            :class="{
                'active': i === activeIndex,
                'unsaved': tab.hasUnsavedChanges,
                'dragging': i === dragStartIndex,
                'drop-left': i === dragOverIndex && dragStartIndex > i,
                'drop-right': i === dragOverIndex && dragStartIndex < i,
            }"
            role="tab"
            :aria-selected="i === activeIndex"
            :aria-label="`${getFileNameWithoutExtension(tab.file.name)}${tab.hasUnsavedChanges ? ' (unsaved)' : ''}`"
            :title="tab.file.relativePath"
            draggable="true"
            tabindex="0"
            @click="emit('switch', i)"
            @keydown.enter="emit('switch', i)"
            @keydown.space.prevent="emit('switch', i)"
            @mousedown="handleMiddleClick($event, i)"
            @auxclick.prevent
            @dragstart="onDragStart($event, i)"
            @dragover="onDragOver($event, i)"
            @drop="onDrop($event, i)"
            @dragend="onDragEnd">
            <span
                class="tab-name truncate fill"
                aria-hidden="false"
                >{{ getFileNameWithoutExtension(tab.file.name) }}</span
            >
            <span
                v-if="tab.hasUnsavedChanges"
                class="tab-dot"
                :aria-label="t('app.tab_unsaved_indicator')"
                role="status" />
            <button
                class="tab-close icon-btn icon-btn-on-hover"
                :aria-label="t('app.tab_close_button', { filename: tab.file.name })"
                :title="t('app.tab_close_button', { filename: tab.file.name })"
                @click.stop="emit('close', i)">
                <IconClose
                    width="12"
                    height="12"
                    stroke-width="3.5" />
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
// –– The bar ––––––––––––––––––––

.tab-bar {
    display: flex;
    align-items: stretch;
    height: $size-13;
    background: $base1;
    border-bottom: $border-width-thin color-mix(in srgb, $text3 80%, transparent);
    flex-shrink: 0;
}

// –– One tab ––––––––––––––––––––

// Not a list row: a tab is bounded left and right, keeps its own width between a floor and a
// ceiling, and marks the active one with an underline rather than a fill.
.tab {
    display: flex;
    align-items: center;
    position: relative;
    gap: $space-2;
    padding: 0 $space-3 0 $space-4;
    min-width: $size-19;
    max-width: $size-23;
    background: $base1;
    border-right: $border-width-thin color-mix(in srgb, $text3 60%, transparent);
    color: $text2;
    font-size: $font-size-sm;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
    transition: background $transition-fast;

    &:hover {
        background: $bg-hover;
        color: $text1;
    }

    &.dragging {
        opacity: $opacity-low;
    }

    // Which side of this tab the dragged one would land on, drawn as an inset edge
    // so it appears between two tabs without moving either of them.
    &.drop-left {
        box-shadow: inset $size-0 0 0 $accent-color;
    }

    &.drop-right {
        box-shadow: inset (-$size-0) 0 0 $accent-color;
    }

    &.active {
        background: $bg-secondary;
        color: $text1;
        font-weight: $font-weight-medium;

        // The accent underline. A fill alone would not separate the active tab
        // from a hovered one, which is the same $bg-hover tint.
        &::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: $size-0;
            background: $accent-color;
        }
    }

    // The close button is `.icon-btn-on-hover`; the tab owns when it appears,
    // because the row is what is hovered and the active tab keeps it showing.
    &:hover .tab-close,
    &.active .tab-close {
        opacity: 1;
    }
}

// –– Tab contents ––––––––––––––––––––

// The unsaved marker.
.tab-dot {
    width: $size-3;
    height: $size-3;
    border-radius: $border-radius-round;
    background: $accent-color;
    flex-shrink: 0;
}

// Smaller and squarer than a header's `.icon-btn`, and it takes the tab's own
// colour rather than $text2 — it is part of the tab, not a control beside it.
.tab-close {
    width: $size-8;
    height: $size-8;
    min-width: $size-8;
    padding: 0;
    border-radius: $border-radius-xs;
    color: inherit;
}
</style>
