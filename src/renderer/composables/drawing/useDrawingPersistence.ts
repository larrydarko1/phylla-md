/**
 * useDrawingPersistence — auto-saves drawing state to disk, loads from file,
 * and migrates legacy v1 stroke format to v2 elements.
 */

import { ref, nextTick, type Ref } from 'vue';

import type { Canvas2D } from '@/renderer/composables/drawing/canvas2d';
import { type CanvasElement, type DrawingDataV2, DrawingDataV2Schema, ElementTypeSchema } from '@/schemas/drawing';

type UseDrawingPersistenceReturn = {
    hasUnsavedChanges: Ref<boolean>;
    isSaving: Ref<boolean>;
    scheduleAutoSave: () => void;
    saveDrawing: () => void;
    loadDrawing: () => void;
    cleanup: () => void;
};

export function useDrawingPersistence({
    canvas,
    initialContent,
    elements,
    scrollX,
    scrollY,
    zoom,
    history,
    historyIndex,
    genId,
    renderScene,
    findCtx,
    onSave,
    onContentChanged,
}: {
    canvas: Ref<HTMLCanvasElement | null>;
    initialContent: () => string | undefined;
    elements: Ref<CanvasElement[]>;
    scrollX: Ref<number>;
    scrollY: Ref<number>;
    zoom: Ref<number>;
    history: Ref<string[]>;
    historyIndex: Ref<number>;
    genId: () => string;
    renderScene: () => void;
    findCtx: () => Canvas2D | null;
    onSave: (content: string) => void;
    onContentChanged: (hasChanges: boolean) => void;
}): UseDrawingPersistenceReturn {
    const hasUnsavedChanges = ref(false);
    const isSaving = ref(false);
    let autoSaveTimeout: number | null = null;

    // Auto-save

    function scheduleAutoSave(): void {
        hasUnsavedChanges.value = true;
        onContentChanged(true);
        if (autoSaveTimeout !== null) clearTimeout(autoSaveTimeout);
        autoSaveTimeout = window.setTimeout(saveDrawing, 1000);
    }

    function saveDrawing(): void {
        const data: DrawingDataV2 = {
            version: 2,
            elements: elements.value,
            viewState: { scrollX: scrollX.value, scrollY: scrollY.value, zoom: zoom.value },
        };
        isSaving.value = true;
        onSave(JSON.stringify(data, null, 2));
        setTimeout((): void => {
            isSaving.value = false;
            hasUnsavedChanges.value = false;
            onContentChanged(false);
        }, 300);
    }

    // Load

    function loadDrawing(): void {
        const content = initialContent();
        const ctx = findCtx();
        const canvasEl = canvas.value;

        if (content === undefined || content.length === 0 || ctx === null || canvasEl === null) {
            elements.value = [];
            scrollX.value = 0;
            scrollY.value = 0;
            zoom.value = 1;
            history.value = [JSON.stringify([])];
            historyIndex.value = 0;
            hasUnsavedChanges.value = false;
            void nextTick(renderScene);
            return;
        }

        try {
            const parsedData: unknown = JSON.parse(content);
            const v2Result = DrawingDataV2Schema.safeParse(parsedData);

            if (v2Result.success) {
                elements.value = v2Result.data.elements;
                scrollX.value = v2Result.data.viewState.scrollX;
                scrollY.value = v2Result.data.viewState.scrollY;
                zoom.value = v2Result.data.viewState.zoom;
            } else if (isV1Data(parsedData)) {
                elements.value = migrateV1(parsedData);
            } else {
                throw new Error('Invalid drawing data format');
            }

            history.value = [JSON.stringify(elements.value)];
            historyIndex.value = 0;
            hasUnsavedChanges.value = false;
            renderScene();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            window.electronAPI.log.error('Failed to load drawing:', errorMessage);
            elements.value = [];
            history.value = [JSON.stringify([])];
            historyIndex.value = 0;
            renderScene();
        }
    }

    function isV1Data(data: unknown): data is V1Data {
        if (typeof data !== 'object' || data === null) return false;
        return ('strokes' in data && Array.isArray(data.strokes)) || Object.keys(data).length === 0;
    }

    // Migration

    type V1Stroke = {
        tool: string;
        color: string;
        size: number;
        shape?: { type: string; x1: number; y1: number; x2: number; y2: number; fill?: boolean };
        points?: { x: number; y: number }[];
    };

    type V1Data = {
        strokes?: V1Stroke[];
    };

    function migrateV1(data: V1Data): CanvasElement[] {
        const result: CanvasElement[] = [];
        const strokes = data.strokes;

        if (strokes === undefined) return result;

        for (const stroke of strokes) {
            if (stroke.tool === 'eraser') continue;

            const shape = stroke.shape;
            const shapeType = ElementTypeSchema.safeParse(shape?.type);

            if (shape !== undefined && shapeType.success) {
                const isLine = shape.type === 'line' || shape.type === 'arrow';
                const el: CanvasElement = {
                    id: genId(),
                    type: shapeType.data,
                    x: isLine ? shape.x1 : Math.min(shape.x1, shape.x2),
                    y: isLine ? shape.y1 : Math.min(shape.y1, shape.y2),
                    width: isLine ? shape.x2 - shape.x1 : Math.abs(shape.x2 - shape.x1),
                    height: isLine ? shape.y2 - shape.y1 : Math.abs(shape.y2 - shape.y1),
                    strokeColor: stroke.color,
                    fillColor: shape.fill === true ? stroke.color : 'transparent',
                    strokeWidth: stroke.size,
                    strokeStyle: 'solid',
                    opacity: 1,
                };
                result.push(el);
            }

            const points = stroke.points;
            if (points !== undefined && points.length > 1) {
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;

                for (const point of points) {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                }

                const el: CanvasElement = {
                    id: genId(),
                    type: 'freedraw',
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    strokeColor: stroke.color,
                    fillColor: 'transparent',
                    strokeWidth: stroke.size,
                    strokeStyle: 'solid',
                    opacity: 1,
                    points: points.map((p: { x: number; y: number }): { x: number; y: number } => ({
                        x: p.x - minX,
                        y: p.y - minY,
                    })),
                };
                result.push(el);
            }
        }
        return result;
    }

    return {
        hasUnsavedChanges,
        isSaving,
        scheduleAutoSave,
        saveDrawing,
        loadDrawing,
        cleanup: (): void => {
            if (autoSaveTimeout !== null) clearTimeout(autoSaveTimeout);
        },
    };
}
