<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import DrawingExportDialog from '@/renderer/components/drawing/DrawingExportDialog.vue';
import DrawingFooter from '@/renderer/components/drawing/DrawingFooter.vue';
import DrawingPropertiesPanel from '@/renderer/components/drawing/DrawingPropertiesPanel.vue';
import DrawingToolbar from '@/renderer/components/drawing/DrawingToolbar.vue';
import { measureTextBox } from '@/renderer/composables/drawing/textMetrics';
import { useCanvasRenderer } from '@/renderer/composables/drawing/useCanvasRenderer';
import { useDrawingElements, genId } from '@/renderer/composables/drawing/useDrawingElements';
import { useDrawingHistory } from '@/renderer/composables/drawing/useDrawingHistory';
import { useDrawingInteraction } from '@/renderer/composables/drawing/useDrawingInteraction';
import { useDrawingPersistence } from '@/renderer/composables/drawing/useDrawingPersistence';
import { useTextEditing } from '@/renderer/composables/drawing/useTextEditing';
import { useThrottleFn } from '@/renderer/composables/useThrottle';
import { toStylePatch } from '@/renderer/utils/drawingStyle';
import type { ToolType, DefaultStyle, StyleKey } from '@/schemas/drawing';

type Props = {
    filePath: string;
    initialContent?: string;
};

const props = defineProps<Props>();

const emit = defineEmits<{
    save: [content: string];
    contentChanged: [hasChanges: boolean];
}>();

const { t } = useI18n();

const containerEl = useTemplateRef<HTMLDivElement>('containerEl');
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const textInputEl = useTemplateRef<HTMLTextAreaElement>('textInputEl');
const toolbarRef = useTemplateRef<InstanceType<typeof DrawingToolbar>>('toolbarRef');
const scrollX = ref(0);
const scrollY = ref(0);
const zoom = ref(1);
const currentTool = ref<ToolType>('select');
const marqueeRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);

const {
    elements,
    selectedId,
    selectedIds,
    creatingElement,
    clipboard,
    selectedElement,
    selectedElements,
    isShapeElement,
    getElementBounds,
    getHandlePositions,
    hitTestElement,
    hitTestHandle,
    isShapeTool,
} = useDrawingElements();

const defaultStyle = ref<DefaultStyle>({
    strokeColor: '#ffffff',
    fillColor: 'transparent',
    strokeWidth: 2,
    strokeStyle: 'solid',
    borderRadius: 0,
    fontSize: 20,
});

const history = ref<string[]>([]);
const historyIndex = ref(-1);

const {
    setupCanvas,
    handleResize,
    renderScene,
    screenToWorld,
    worldToScreen,
    getScreenPoint,
    cssWidth,
    cssHeight,
    findCtx,
    exportToBlob,
} = useCanvasRenderer({
    canvas,
    containerEl,
    scrollX,
    scrollY,
    zoom,
    elements,
    creatingElement,
    selectedIds,
    marqueeRect,
    getElementBounds,
    getHandlePositions,
});

const {
    hasUnsavedChanges,
    isSaving,
    scheduleAutoSave,
    loadDrawing,
    cleanup: cleanupAutoSave,
} = useDrawingPersistence({
    canvas,
    initialContent: (): string | undefined => props.initialContent,
    elements,
    scrollX,
    scrollY,
    zoom,
    history,
    historyIndex,
    genId,
    renderScene,
    findCtx,
    onSave: (content: string): void => emit('save', content),
    onContentChanged: (hasChanges: boolean): void => emit('contentChanged', hasChanges),
});

const { saveToHistory, undo, redo, clearAll, copySelected, pasteClipboard, duplicateSelected, deleteSelected } =
    useDrawingHistory({
        elements,
        selectedIds,
        selectedElements,
        clipboard,
        history,
        historyIndex,
        scheduleAutoSave,
        renderScene,
    });

const {
    textEditing,
    textValue,
    textOverlayStyle,
    startNewText,
    startEditText,
    startEditShapeText,
    cancelText,
    onTextEnter,
    finalizeText,
    onDoubleClick,
} = useTextEditing({
    canvas,
    textInputEl,
    zoom,
    elements,
    selectedId,
    getElementBounds,
    hitTestElement,
    isShapeElement,
    genId,
    defaultStyle,
    worldToScreen,
    screenToWorld,
    findCtx,
    renderScene,
    saveToHistory,
    scheduleAutoSave,
});

const {
    isDragging,
    effectiveTool,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    zoomToCenter,
    handleKeydown,
    handleKeyup,
} = useDrawingInteraction({
    canvas,
    containerEl,
    scrollX,
    scrollY,
    zoom,
    elements,
    selectedId,
    selectedIds,
    creatingElement,
    selectedElement,
    selectedElements,
    isShapeElement,
    isShapeTool,
    hitTestElement,
    hitTestHandle,
    getElementBounds,
    genId,
    currentTool,
    defaultStyle,
    marqueeRect,
    screenToWorld,
    getScreenPoint,
    cssWidth,
    cssHeight,
    renderScene,
    textEditing,
    finalizeText,
    startNewText,
    startEditText,
    startEditShapeText,
    saveToHistory,
    scheduleAutoSave,
    selectTool,
    undo,
    redo,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    deleteSelected,
});

const zoomPercent = computed(() => Math.round(zoom.value * 100));

const shouldShowProperties = computed(() => {
    const tool = effectiveTool.value;
    return (tool !== 'hand' && tool !== 'select') || selectedIds.value.size > 0;
});

const showFillOption = computed(() => {
    const tool = effectiveTool.value;
    if (selectedElement.value !== null) {
        return !['line', 'arrow', 'freedraw', 'text'].includes(selectedElement.value.type);
    }
    return !['freedraw', 'line', 'arrow', 'text', 'select', 'hand', 'eraser'].includes(tool);
});

const activeStrokeColor = computed(() => selectedElement.value?.strokeColor ?? defaultStyle.value.strokeColor);
const activeFillColor = computed(() => selectedElement.value?.fillColor ?? defaultStyle.value.fillColor);
const activeStrokeWidth = computed(() => selectedElement.value?.strokeWidth ?? defaultStyle.value.strokeWidth);
const activeStrokeStyle = computed(() => selectedElement.value?.strokeStyle ?? defaultStyle.value.strokeStyle);
const activeBorderRadius = computed(() => selectedElement.value?.borderRadius ?? defaultStyle.value.borderRadius);
const activeFontSize = computed(() => selectedElement.value?.fontSize ?? defaultStyle.value.fontSize);

const showFontSizeOption = computed(() => {
    if (selectedElements.value.length > 0) {
        return selectedElements.value.some((el) => el.type === 'text' || (el.text !== undefined && el.text !== ''));
    }
    return currentTool.value === 'text';
});

const showRoundnessOption = computed(() => {
    const roundableTypes = ['rectangle', 'diamond', 'triangle', 'hexagon', 'parallelogram'];
    const tool = effectiveTool.value;
    if (selectedElement.value !== null) return roundableTypes.includes(selectedElement.value.type);
    return roundableTypes.includes(tool);
});

const canvasCursor = computed(() => {
    const tool = effectiveTool.value;
    if (tool === 'hand') return isDragging.value ? 'grabbing' : 'grab';
    if (tool === 'select') return 'default';
    if (tool === 'eraser') return 'cell';
    if (tool === 'text') return 'text';
    return 'crosshair';
});

const showExportDialog = ref(false);
const hasSelection = computed(() => selectedIds.value.size > 0);

const throttledResize = useThrottleFn(handleResize, 100);

function selectTool(tool: ToolType): void {
    currentTool.value = tool;
    if (tool !== 'select') selectedIds.value = new Set();
    renderScene();
}

function handleClickOutside(e: MouseEvent): void {
    toolbarRef.value?.handleClickOutside(e);
}

function setProperty(prop: StyleKey, value: string | number): void {
    const patch = toStylePatch(prop, value);
    if (patch === null) return;
    // Update all selected elements
    if (selectedElements.value.length > 0) {
        for (const el of selectedElements.value) {
            Object.assign(el, patch);

            // When fontSize changes on a text element, recalculate bounds to fit
            const resizesText =
                prop === 'fontSize' &&
                typeof value === 'number' &&
                el.type === 'text' &&
                el.text !== undefined &&
                el.text !== '';
            const ctx = resizesText ? findCtx() : null;
            if (ctx !== null && typeof value === 'number' && el.text !== undefined) {
                Object.assign(el, measureTextBox(ctx, el.text, value));
            }
        }

        saveToHistory();
        scheduleAutoSave();
        renderScene();
    }
    // Always update default style
    Object.assign(defaultStyle.value, patch);
}

function openExportDialog(): void {
    showExportDialog.value = true;
}

function closeExportDialog(): void {
    showExportDialog.value = false;
}

onMounted(() => {
    setupCanvas();
    loadDrawing();
    window.addEventListener('resize', throttledResize);
    document.addEventListener('mousedown', handleClickOutside);
    void nextTick(() => containerEl.value?.focus());
});

onUnmounted(() => {
    window.removeEventListener('resize', throttledResize);
    document.removeEventListener('mousedown', handleClickOutside);
    cleanupAutoSave();
    throttledResize.cancel();
    onPointerMove.cancel();
    onWheel.cancel();
});

watch(() => props.filePath, loadDrawing);
watch(() => props.initialContent, loadDrawing);
</script>

<template>
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <div
        ref="containerEl"
        class="canvas-container"
        role="application"
        :aria-label="t('drawing.canvas_application')"
        aria-describedby="canvas-instructions"
        tabindex="0"
        @keydown="handleKeydown"
        @keyup="handleKeyup"
        @contextmenu.prevent>
        <!-- Toolbar -->
        <DrawingToolbar
            ref="toolbarRef"
            :current-tool="currentTool"
            role="toolbar"
            :aria-label="t('drawing.toolbar')"
            @select-tool="selectTool" />

        <!-- Properties Panel -->
        <DrawingPropertiesPanel
            :visible="shouldShowProperties"
            :active-stroke-color="activeStrokeColor"
            :active-fill-color="activeFillColor"
            :active-stroke-width="activeStrokeWidth"
            :active-stroke-style="activeStrokeStyle"
            :active-border-radius="activeBorderRadius"
            :active-font-size="activeFontSize"
            :show-fill-option="showFillOption"
            :show-font-size-option="showFontSizeOption"
            :show-roundness-option="showRoundnessOption"
            :has-selection="hasSelection"
            role="complementary"
            :aria-label="t('drawing.properties_panel')"
            aria-hidden="false"
            @set-property="setProperty"
            @copy="copySelected"
            @duplicate="duplicateSelected"
            @delete="deleteSelected" />

        <!-- Canvas -->
        <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
        <canvas
            ref="canvas"
            :style="{ cursor: canvasCursor }"
            :aria-label="t('drawing.canvas')"
            role="application"
            :aria-describedby="hasSelection ? 'selection-status' : undefined"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
            @dblclick="onDoubleClick"
            @wheel.prevent="onWheel" />

        <!-- Text Editing Overlay -->
        <textarea
            v-if="textEditing"
            ref="textInputEl"
            v-model="textValue"
            class="text-edit-overlay"
            :style="textOverlayStyle"
            :aria-label="t('drawing.text_editing_area')"
            @blur="finalizeText"
            @keydown.escape.prevent="cancelText"
            @keydown.enter.exact="onTextEnter"
            @pointerdown.stop />

        <!-- Footer -->
        <DrawingFooter
            :zoom="zoom"
            :zoom-percent="zoomPercent"
            :history-index="historyIndex"
            :history-length="history.length"
            :is-saving="isSaving"
            :has-unsaved-changes="hasUnsavedChanges"
            role="contentinfo"
            :aria-label="t('drawing.footer')"
            @zoom-to-center="zoomToCenter"
            @undo="undo"
            @redo="redo"
            @clear-all="clearAll"
            @open-export-dialog="openExportDialog" />

        <!-- Export Dialog -->
        <DrawingExportDialog
            :visible="showExportDialog"
            :has-selection="hasSelection"
            :file-path="filePath"
            :elements="elements"
            :selected-ids="selectedIds"
            :export-to-blob="exportToBlob"
            role="dialog"
            :aria-label="t('drawing.export_dialog', { selection: hasSelection ? t('drawing.selection') : '' })"
            aria-modal="true"
            @close="closeExportDialog" />
    </div>
</template>

<style scoped lang="scss">
/* ––– Main Container ––– */

.canvas-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    outline: none;
    background: $bg-primary;
}

/* ––– Canvas ––– */

canvas {
    display: block;
    width: 100%;
    height: 100%;
}

/* ––– Text Editing Overlay ––– */

.text-edit-overlay {
    position: absolute;
    z-index: $z-dropdown;
    border: none;
    background: color-mix(in srgb, $bg-primary 85%, transparent);
    outline: none;
    resize: none;
    min-width: $size-18;
    min-height: $size-11;
    font-family: $font-family;
    padding: $space-1 $space-2;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    box-sizing: border-box;
}
</style>
