/**
 * useDrawingElements — manages the canvas element array, bounds calculation,
 * hit testing, and element type classification.
 */

import { ref, computed, shallowRef, type ComputedRef, type Ref, type ShallowRef, type WritableComputedRef } from 'vue';

import type { CanvasElement, ElementType } from '@/schemas/drawing';

type UseDrawingElementsReturn = {
    elements: ShallowRef<CanvasElement[]>;
    selectedId: WritableComputedRef<string | null>;
    selectedIds: Ref<Set<string>>;
    creatingElement: Ref<CanvasElement | null>;
    clipboard: ShallowRef<CanvasElement[]>;
    selectedElement: ComputedRef<CanvasElement | null>;
    selectedElements: ComputedRef<CanvasElement[]>;
    isShapeElement: (el: CanvasElement) => boolean;
    getElementBounds: (el: CanvasElement) => { x: number; y: number; width: number; height: number };
    getHandlePositions: (el: CanvasElement) => Record<string, { x: number; y: number }>;
    hitTestElement: (wx: number, wy: number, zoom: number) => CanvasElement | null;
    hitTestHandle: (wx: number, wy: number, zoom: number) => { elementId: string; handle: string } | null;
    distanceToSegment: (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number;
    isShapeTool: (tool: string) => tool is ElementType;
};

const HANDLE_SIZE = 8;

let idCounter = 0;
export function genId(): string {
    return `el_${Date.now()}_${idCounter++}`;
}

export function useDrawingElements(): UseDrawingElementsReturn {
    const elements = shallowRef<CanvasElement[]>([]);
    const selectedIds = ref<Set<string>>(new Set());
    const creatingElement = ref<CanvasElement | null>(null);
    const clipboard = shallowRef<CanvasElement[]>([]);

    // Backward-compat: single selected ID (first in set, or null)
    const selectedId = computed({
        get: (): string | null => {
            const first = selectedIds.value.values().next();
            return first.done === true ? null : first.value;
        },
        set: (id: string | null): void => {
            if (id !== null && id.length > 0) selectedIds.value = new Set([id]);
            else selectedIds.value = new Set();
        },
    });

    const selectedElement = computed(
        (): {
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
            x: number;
            y: number;
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
        } | null =>
            selectedId.value !== null && selectedId.value.length > 0
                ? (elements.value.find((el): boolean => el.id === selectedId.value) ?? null)
                : null,
    );

    const selectedElements = computed(
        (): {
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
            x: number;
            y: number;
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
        }[] => elements.value.filter((el): boolean => selectedIds.value.has(el.id)),
    );

    // Helpers

    function isShapeElement(el: CanvasElement): boolean {
        return [
            'rectangle',
            'ellipse',
            'diamond',
            'triangle',
            'database',
            'server',
            'user',
            'cloud',
            'document',
            'hexagon',
            'parallelogram',
            'star',
        ].includes(el.type);
    }

    // Bounds

    function getElementBounds(el: CanvasElement): { x: number; y: number; width: number; height: number } {
        if (el.type === 'freedraw' && el.points !== undefined && el.points.length > 0) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const point of el.points) {
                minX = Math.min(minX, el.x + point.x);
                minY = Math.min(minY, el.y + point.y);
                maxX = Math.max(maxX, el.x + point.x);
                maxY = Math.max(maxY, el.y + point.y);
            }
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return {
            x: Math.min(el.x, el.x + el.width),
            y: Math.min(el.y, el.y + el.height),
            width: Math.abs(el.width),
            height: Math.abs(el.height),
        };
    }

    function getHandlePositions(el: CanvasElement): Record<string, { x: number; y: number }> {
        if (el.type === 'line' || el.type === 'arrow') {
            return {
                start: { x: el.x, y: el.y },
                end: { x: el.x + el.width, y: el.y + el.height },
            };
        }
        const bounds = getElementBounds(el);
        return {
            nw: { x: bounds.x, y: bounds.y },
            ne: { x: bounds.x + bounds.width, y: bounds.y },
            sw: { x: bounds.x, y: bounds.y + bounds.height },
            se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        };
    }

    // Hit testing

    function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let along = ((px - x1) * dx + (py - y1) * dy) / len2;
        along = Math.max(0, Math.min(1, along));
        const nx = x1 + along * dx;
        const ny = y1 + along * dy;
        return Math.sqrt((px - nx) ** 2 + (py - ny) ** 2);
    }

    function isPointInElement(wx: number, wy: number, el: CanvasElement, threshold: number): boolean {
        const bounds = getElementBounds(el);
        if (el.type === 'line' || el.type === 'arrow') {
            return (
                distanceToSegment(wx, wy, el.x, el.y, el.x + el.width, el.y + el.height) <=
                threshold + el.strokeWidth / 2
            );
        }
        if (el.type === 'freedraw' && el.points !== undefined) {
            for (let i = 1; i < el.points.length; i++) {
                const p1 = el.points[i - 1];
                const p2 = el.points[i];
                if (p1 === undefined || p2 === undefined) continue;
                if (
                    distanceToSegment(wx, wy, el.x + p1.x, el.y + p1.y, el.x + p2.x, el.y + p2.y) <=
                    threshold + el.strokeWidth / 2
                ) {
                    return true;
                }
            }
            return false;
        }
        return (
            wx >= bounds.x - threshold &&
            wx <= bounds.x + bounds.width + threshold &&
            wy >= bounds.y - threshold &&
            wy <= bounds.y + bounds.height + threshold
        );
    }

    function hitTestElement(wx: number, wy: number, zoom: number): CanvasElement | null {
        const threshold = 8 / zoom;
        for (let i = elements.value.length - 1; i >= 0; i--) {
            const el = elements.value[i];
            if (el !== undefined && isPointInElement(wx, wy, el, threshold)) return el;
        }
        return null;
    }

    function hitTestHandle(wx: number, wy: number, zoom: number): { elementId: string; handle: string } | null {
        if (selectedIds.value.size !== 1 || selectedElement.value === null) return null;
        const handles = getHandlePositions(selectedElement.value);
        const hs = (HANDLE_SIZE + 4) / zoom;
        for (const [name, pos] of Object.entries(handles)) {
            if (Math.abs(wx - pos.x) <= hs / 2 && Math.abs(wy - pos.y) <= hs / 2) {
                return { elementId: selectedElement.value.id, handle: name };
            }
        }
        return null;
    }

    // Element type checks

    const shapeTools: (CanvasElement['type'] | 'select' | 'hand' | 'eraser' | 'freedraw' | 'text')[] = [
        'rectangle',
        'ellipse',
        'diamond',
        'triangle',
        'line',
        'arrow',
        'database',
        'server',
        'user',
        'cloud',
        'document',
        'hexagon',
        'parallelogram',
        'star',
    ];

    function isShapeTool(tool: string): tool is ElementType {
        return shapeTools.some((shape): boolean => shape === tool);
    }

    return {
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
        distanceToSegment,
        isShapeTool,
    };
}
