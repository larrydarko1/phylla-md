/**
 * useDrawingHistory — undo/redo stack and clipboard operations for the drawing canvas.
 */

import type { Ref, ComputedRef } from 'vue';
import { z } from 'zod';

import { type CanvasElement, CanvasElementSchema } from '@/schemas/drawing';

type UseDrawingHistoryReturn = {
    saveToHistory: () => void;
    undo: () => void;
    redo: () => void;
    clearAll: () => void;
    copySelected: () => void;
    pasteClipboard: () => void;
    duplicateSelected: () => void;
    deleteSelected: () => void;
};

export function useDrawingHistory({
    elements,
    selectedIds,
    selectedElements,
    clipboard,
    history,
    historyIndex,
    scheduleAutoSave,
    renderScene,
}: {
    elements: Ref<CanvasElement[]>;
    selectedIds: Ref<Set<string>>;
    selectedElements: ComputedRef<CanvasElement[]>;
    clipboard: Ref<CanvasElement[]>;
    history: Ref<string[]>;
    historyIndex: Ref<number>;
    scheduleAutoSave: () => void;
    renderScene: () => void;
}): UseDrawingHistoryReturn {
    // History

    function saveToHistory(): void {
        const snapshot = JSON.stringify(elements.value);
        if (historyIndex.value < history.value.length - 1) {
            history.value = history.value.slice(0, historyIndex.value + 1);
        }
        history.value.push(snapshot);
        historyIndex.value = history.value.length - 1;
        if (history.value.length > 60) {
            history.value.shift();
            historyIndex.value--;
        }
    }

    function undo(): void {
        if (historyIndex.value <= 0) return;
        historyIndex.value--;
        const historyEntry = history.value[historyIndex.value];
        if (historyEntry === undefined) {
            historyIndex.value = 0;
            return;
        }
        try {
            const result = z.array(CanvasElementSchema).safeParse(JSON.parse(historyEntry));
            if (result.success) {
                elements.value = result.data;
                selectedIds.value = new Set();
                scheduleAutoSave();
                renderScene();
            }
        } catch {
            historyIndex.value = 0;
        }
    }

    function redo(): void {
        if (historyIndex.value >= history.value.length - 1) return;
        historyIndex.value++;
        const historyEntry = history.value[historyIndex.value];
        if (historyEntry === undefined) {
            historyIndex.value = history.value.length - 1;
            return;
        }
        try {
            const result = z.array(CanvasElementSchema).safeParse(JSON.parse(historyEntry));
            if (result.success) {
                elements.value = result.data;
                selectedIds.value = new Set();
                scheduleAutoSave();
                renderScene();
            }
        } catch {
            historyIndex.value = history.value.length - 1;
        }
    }

    function clearAll(): void {
        elements.value = [];
        selectedIds.value = new Set();
        saveToHistory();
        scheduleAutoSave();
        renderScene();
    }

    // Clipboard

    function copySelected(): void {
        if (selectedElements.value.length === 0) return;
        const result = z.array(CanvasElementSchema).safeParse(JSON.parse(JSON.stringify(selectedElements.value)));
        if (result.success) clipboard.value = result.data;
    }

    function pasteClipboard(): void {
        if (clipboard.value.length === 0) return;
        const newIds = new Set<string>();
        for (const src of clipboard.value) {
            const cloneResult = CanvasElementSchema.safeParse(JSON.parse(JSON.stringify(src)));
            if (!cloneResult.success) continue;
            const newEl: CanvasElement = {
                ...cloneResult.data,
                id: crypto.randomUUID(),
                x: src.x + 20,
                y: src.y + 20,
            };
            elements.value.push(newEl);
            newIds.add(newEl.id);
        }
        selectedIds.value = newIds;
        // Offset clipboard for subsequent pastes
        clipboard.value = clipboard.value.map(
            (
                el,
            ): {
                x: number;
                y: number;
                id: string;
                type:
                    | 'rectangle'
                    | 'ellipse'
                    | 'diamond'
                    | 'triangle'
                    | 'line'
                    | 'arrow'
                    | 'freedraw'
                    | 'text'
                    | 'database'
                    | 'server'
                    | 'user'
                    | 'cloud'
                    | 'document'
                    | 'hexagon'
                    | 'parallelogram'
                    | 'star';
                width: number;
                height: number;
                strokeColor: string;
                fillColor: string;
                strokeWidth: number;
                strokeStyle: 'solid' | 'dashed' | 'dotted';
                opacity: number;
                points?: { x: number; y: number }[] | undefined;
                text?: string | undefined;
                fontSize?: number | undefined;
                borderRadius?: number | undefined;
            } => ({
                ...el,
                x: el.x + 20,
                y: el.y + 20,
            }),
        );
        saveToHistory();
        scheduleAutoSave();
        renderScene();
    }

    function duplicateSelected(): void {
        if (selectedElements.value.length === 0) return;
        copySelected();
        pasteClipboard();
    }

    function deleteSelected(): void {
        if (selectedIds.value.size === 0) return;
        const idsToDelete = selectedIds.value;
        elements.value = elements.value.filter((el): boolean => !idsToDelete.has(el.id));
        selectedIds.value = new Set();
        saveToHistory();
        scheduleAutoSave();
        renderScene();
    }

    return {
        saveToHistory,
        undo,
        redo,
        clearAll,
        copySelected,
        pasteClipboard,
        duplicateSelected,
        deleteSelected,
    };
}
