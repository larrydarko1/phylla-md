/**
 * useCanvasRenderer — owns the HTML Canvas 2D context, coordinate transforms,
 * grid/element rendering, and bitmap export.
 */

import { computed, type Ref } from 'vue';

import { encodePng, findContext2D, type Canvas2D } from '@/renderer/composables/drawing/canvas2d';
import type { CanvasElement } from '@/schemas/drawing';

type UseCanvasRendererReturn = {
    setupCanvas: () => void;
    handleResize: () => void;
    renderScene: () => void;
    screenToWorld: (sx: number, sy: number) => { x: number; y: number };
    worldToScreen: (wx: number, wy: number) => { x: number; y: number };
    getScreenPoint: (e: MouseEvent | Touch) => { x: number; y: number };
    cssWidth: () => number;
    cssHeight: () => number;
    findCtx: () => Canvas2D | null;
    exportToBlob: (opts: {
        elements: CanvasElement[];
        withBackground: boolean;
        scale: number;
        padding?: number;
    }) => Promise<Blob | null>;
};

const GRID_SIZE = 20;
const HANDLE_SIZE = 8;
const SELECTION_COLOR = '#4a90d9';

export function useCanvasRenderer({
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
}: {
    canvas: Ref<HTMLCanvasElement | null>;
    containerEl: Ref<HTMLDivElement | null>;
    scrollX: Ref<number>;
    scrollY: Ref<number>;
    zoom: Ref<number>;
    elements: Ref<CanvasElement[]>;
    creatingElement: Ref<CanvasElement | null>;
    selectedIds: Ref<Set<string>>;
    marqueeRect: Ref<{ x: number; y: number; width: number; height: number } | null>;
    getElementBounds: (el: CanvasElement) => { x: number; y: number; width: number; height: number };
    getHandlePositions: (el: CanvasElement) => Record<string, { x: number; y: number }>;
}): UseCanvasRendererReturn {
    let ctx: Canvas2D | null = null;
    let dpr = 1;

    const canvasBg = computed((): string => getCSSVariable('--base1'));
    const gridColor = computed((): string => getCSSVariable('--grid-color'));

    // Canvas setup

    function setupCanvas(): void {
        if (canvas.value === null || containerEl.value === null) return;
        dpr = window.devicePixelRatio;
        const rect = containerEl.value.getBoundingClientRect();
        canvas.value.width = rect.width * dpr;
        canvas.value.height = rect.height * dpr;
        canvas.value.style.width = `${rect.width}px`;
        canvas.value.style.height = `${rect.height}px`;
        const ctx2d = findContext2D(canvas.value);
        if (ctx2d !== null) ctx = ctx2d;
    }

    function handleResize(): void {
        setupCanvas();
        renderScene();
    }

    function cssWidth(): number {
        return canvas.value !== null ? canvas.value.width / dpr : 0;
    }
    function cssHeight(): number {
        return canvas.value !== null ? canvas.value.height / dpr : 0;
    }

    // Coordinate transforms

    function screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - scrollX.value) / zoom.value,
            y: (sy - scrollY.value) / zoom.value,
        };
    }

    function worldToScreen(wx: number, wy: number): { x: number; y: number } {
        return {
            x: wx * zoom.value + scrollX.value,
            y: wy * zoom.value + scrollY.value,
        };
    }

    function getScreenPoint(e: MouseEvent | Touch): { x: number; y: number } {
        if (canvas.value === null) return { x: 0, y: 0 };
        const rect = canvas.value.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // Rendering

    function renderScene(): void {
        if (ctx === null || canvas.value === null) return;
        const width = cssWidth();
        const height = cssHeight();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        ctx.fillStyle = canvasBg.value;
        ctx.fillRect(0, 0, width, height);

        drawGrid(width, height);

        ctx.save();
        ctx.translate(scrollX.value, scrollY.value);
        ctx.scale(zoom.value, zoom.value);

        for (const el of elements.value) drawElement(el);

        if (creatingElement.value !== null) drawElement(creatingElement.value);

        // Draw selection outlines for all selected elements
        for (const el of elements.value) {
            if (selectedIds.value.has(el.id)) {
                // Only show resize handles when single selection
                drawSelectionOutline(el, { showHandles: selectedIds.value.size === 1 });
            }
        }

        // Draw marquee selection rectangle
        if (marqueeRect.value !== null) drawMarquee(marqueeRect.value);

        ctx.restore();
    }

    function drawGrid(width: number, height: number): void {
        if (ctx === null) return;
        const gridSize = GRID_SIZE;
        const zoomedGrid = gridSize * zoom.value;
        if (zoomedGrid < 4) return;

        ctx.fillStyle = gridColor.value;
        const dotSize = Math.max(1, zoom.value);

        const startWorldX = Math.floor(-scrollX.value / zoom.value / gridSize) * gridSize;
        const startWorldY = Math.floor(-scrollY.value / zoom.value / gridSize) * gridSize;
        const endWorldX = (-scrollX.value + width) / zoom.value;
        const endWorldY = (-scrollY.value + height) / zoom.value;

        for (let wx = startWorldX; wx <= endWorldX; wx += gridSize) {
            for (let wy = startWorldY; wy <= endWorldY; wy += gridSize) {
                const sx = wx * zoom.value + scrollX.value;
                const sy = wy * zoom.value + scrollY.value;
                ctx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
            }
        }
    }

    function drawElement(el: CanvasElement): void {
        if (ctx === null) return;

        ctx.save();
        ctx.strokeStyle = el.strokeColor;
        ctx.lineWidth = el.strokeWidth;
        ctx.globalAlpha = el.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (el.strokeStyle) {
            case 'dashed':
                ctx.setLineDash([12, 8]);
                break;
            case 'dotted':
                ctx.setLineDash([2, 5]);
                break;
            default:
                ctx.setLineDash([]);
        }

        const hasFill = el.fillColor !== 'transparent';
        if (hasFill) ctx.fillStyle = el.fillColor;

        const br = el.borderRadius ?? 0;

        switch (el.type) {
            case 'rectangle': {
                const rx = Math.min(el.x, el.x + el.width);
                const ry = Math.min(el.y, el.y + el.height);
                const rw = Math.abs(el.width);
                const rh = Math.abs(el.height);
                const maxR = Math.min(rw, rh) / 2;
                const cornerRadius = Math.min(br, maxR);
                ctx.beginPath();
                ctx.roundRect(rx, ry, rw, rh, cornerRadius);
                if (hasFill) ctx.fill();
                ctx.stroke();
                break;
            }
            case 'ellipse': {
                const cx = el.x + el.width / 2;
                const cy = el.y + el.height / 2;
                const rrx = Math.abs(el.width) / 2;
                const rry = Math.abs(el.height) / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, Math.max(0.1, rrx), Math.max(0.1, rry), 0, 0, Math.PI * 2);
                if (hasFill) ctx.fill();
                ctx.stroke();
                break;
            }
            case 'diamond': {
                const dcx = el.x + el.width / 2;
                const dcy = el.y + el.height / 2;
                const dhw = Math.abs(el.width) / 2;
                const dhh = Math.abs(el.height) / 2;
                ctx.beginPath();
                if (br > 0) {
                    drawRoundedPolygon(
                        ctx,
                        [
                            { x: dcx, y: dcy - dhh },
                            { x: dcx + dhw, y: dcy },
                            { x: dcx, y: dcy + dhh },
                            { x: dcx - dhw, y: dcy },
                        ],
                        br,
                    );
                } else {
                    ctx.moveTo(dcx, dcy - dhh);
                    ctx.lineTo(dcx + dhw, dcy);
                    ctx.lineTo(dcx, dcy + dhh);
                    ctx.lineTo(dcx - dhw, dcy);
                    ctx.closePath();
                }
                if (hasFill) ctx.fill();
                ctx.stroke();
                break;
            }
            case 'triangle': {
                const tx = Math.min(el.x, el.x + el.width);
                const ty = Math.min(el.y, el.y + el.height);
                const tw = Math.abs(el.width);
                const th = Math.abs(el.height);
                ctx.beginPath();
                if (br > 0) {
                    drawRoundedPolygon(
                        ctx,
                        [
                            { x: tx + tw / 2, y: ty },
                            { x: tx + tw, y: ty + th },
                            { x: tx, y: ty + th },
                        ],
                        br,
                    );
                } else {
                    ctx.moveTo(tx + tw / 2, ty);
                    ctx.lineTo(tx + tw, ty + th);
                    ctx.lineTo(tx, ty + th);
                    ctx.closePath();
                }
                if (hasFill) ctx.fill();
                ctx.stroke();
                break;
            }
            case 'line': {
                ctx.beginPath();
                ctx.moveTo(el.x, el.y);
                ctx.lineTo(el.x + el.width, el.y + el.height);
                ctx.stroke();
                break;
            }
            case 'arrow': {
                const ax1 = el.x,
                    ay1 = el.y;
                const ax2 = el.x + el.width,
                    ay2 = el.y + el.height;
                ctx.beginPath();
                ctx.moveTo(ax1, ay1);
                ctx.lineTo(ax2, ay2);
                ctx.stroke();
                const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
                const headLen = Math.max(el.strokeWidth * 4, 14);
                ctx.beginPath();
                ctx.moveTo(ax2, ay2);
                ctx.lineTo(
                    ax2 - headLen * Math.cos(angle - Math.PI / 6),
                    ay2 - headLen * Math.sin(angle - Math.PI / 6),
                );
                ctx.moveTo(ax2, ay2);
                ctx.lineTo(
                    ax2 - headLen * Math.cos(angle + Math.PI / 6),
                    ay2 - headLen * Math.sin(angle + Math.PI / 6),
                );
                ctx.stroke();
                break;
            }
            case 'freedraw': {
                if (el.points === undefined || el.points.length < 2) break;
                ctx.beginPath();
                for (const [i, point] of el.points.entries()) {
                    if (i === 0) ctx.moveTo(el.x + point.x, el.y + point.y);
                    else ctx.lineTo(el.x + point.x, el.y + point.y);
                }
                ctx.stroke();
                break;
            }
            case 'text': {
                if (el.text === undefined || el.text === '') break;
                const fs = el.fontSize ?? 20;
                const fsNum = fs > 0 ? fs : 20;
                ctx.font = `${fsNum}px "Helvetica", "Segoe UI", sans-serif`;
                ctx.fillStyle = el.strokeColor;
                ctx.textBaseline = 'top';
                const lines = el.text.split('\n');
                const lh = fsNum * 1.3;
                for (const [i, line] of lines.entries()) ctx.fillText(line, el.x, el.y + i * lh);
                break;
            }

            // ---- Architecture / Diagram Shapes ----

            case 'database': {
                const dx = Math.min(el.x, el.x + el.width);
                const dy = Math.min(el.y, el.y + el.height);
                const dw = Math.abs(el.width);
                const dh = Math.abs(el.height);
                const dsx = dw / 24,
                    dsy = dh / 24;
                ctx.save();
                ctx.translate(dx, dy);
                ctx.scale(dsx, dsy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(dsx * dsy);
                const dbBodyPath = new Path2D('M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5');
                if (hasFill) ctx.fill(dbBodyPath);
                ctx.stroke(dbBodyPath);
                ctx.stroke(new Path2D('M3 12c0 1.66 4 3 9 3s9-1.34 9-3'));
                const dbTopPath = new Path2D();
                dbTopPath.ellipse(12, 5, 9, 3, 0, 0, Math.PI * 2);
                if (hasFill) ctx.fill(dbTopPath);
                ctx.stroke(dbTopPath);
                ctx.restore();
                break;
            }
            case 'server': {
                const svrX = Math.min(el.x, el.x + el.width);
                const svrY = Math.min(el.y, el.y + el.height);
                const svrW = Math.abs(el.width);
                const svrH = Math.abs(el.height);
                const svrSX = svrW / 24,
                    svrSY = svrH / 24;
                ctx.save();
                ctx.translate(svrX, svrY);
                ctx.scale(svrSX, svrSY);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(svrSX * svrSY);
                ctx.beginPath();
                ctx.roundRect(2, 2, 20, 8, 2);
                if (hasFill) ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.roundRect(2, 14, 20, 8, 2);
                if (hasFill) ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(6, 6, 1, 0, Math.PI * 2);
                ctx.fillStyle = '#4ade80';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(6, 18, 1, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'user': {
                const ux = Math.min(el.x, el.x + el.width);
                const uy = Math.min(el.y, el.y + el.height);
                const uw = Math.abs(el.width);
                const uh = Math.abs(el.height);
                const usx = uw / 24,
                    usy = uh / 24;
                ctx.save();
                ctx.translate(ux, uy);
                ctx.scale(usx, usy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(usx * usy);
                ctx.beginPath();
                ctx.arc(12, 8, 5, 0, Math.PI * 2);
                if (hasFill) ctx.fill();
                ctx.stroke();
                ctx.stroke(new Path2D('M3 21c0-4.42 4-8 9-8s9 3.58 9 8'));
                ctx.restore();
                break;
            }
            case 'cloud': {
                const clx = Math.min(el.x, el.x + el.width);
                const cly = Math.min(el.y, el.y + el.height);
                const clw = Math.abs(el.width);
                const clh = Math.abs(el.height);
                const clsx = clw / 24,
                    clsy = clh / 24;
                ctx.save();
                ctx.translate(clx, cly);
                ctx.scale(clsx, clsy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(clsx * clsy);
                const cloudPath = new Path2D('M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z');
                if (hasFill) ctx.fill(cloudPath);
                ctx.stroke(cloudPath);
                ctx.restore();
                break;
            }
            case 'document': {
                const ddx = Math.min(el.x, el.x + el.width);
                const ddy = Math.min(el.y, el.y + el.height);
                const ddw = Math.abs(el.width);
                const ddh = Math.abs(el.height);
                const ddsx = ddw / 24,
                    ddsy = ddh / 24;
                ctx.save();
                ctx.translate(ddx, ddy);
                ctx.scale(ddsx, ddsy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(ddsx * ddsy);
                const pagePath = new Path2D('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
                if (hasFill) ctx.fill(pagePath);
                ctx.stroke(pagePath);
                ctx.stroke(new Path2D('M14 2 L14 8 L20 8'));
                ctx.stroke(new Path2D('M8 13 L16 13'));
                ctx.stroke(new Path2D('M8 17 L16 17'));
                ctx.restore();
                break;
            }
            case 'hexagon': {
                const hx = Math.min(el.x, el.x + el.width);
                const hy = Math.min(el.y, el.y + el.height);
                const hw = Math.abs(el.width);
                const hh = Math.abs(el.height);
                const hsx = hw / 24,
                    hsy = hh / 24;
                ctx.save();
                ctx.translate(hx, hy);
                ctx.scale(hsx, hsy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(hsx * hsy);
                const hexPath = new Path2D('M12 2 L22 7 L22 17 L12 22 L2 17 L2 7 Z');
                if (hasFill) ctx.fill(hexPath);
                ctx.stroke(hexPath);
                ctx.restore();
                break;
            }
            case 'parallelogram': {
                const px = Math.min(el.x, el.x + el.width);
                const py = Math.min(el.y, el.y + el.height);
                const pw = Math.abs(el.width);
                const ph = Math.abs(el.height);
                const psx = pw / 24,
                    psy = ph / 24;
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(psx, psy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(psx * psy);
                const paraPath = new Path2D('M6 4 L22 4 L18 20 L2 20 Z');
                if (hasFill) ctx.fill(paraPath);
                ctx.stroke(paraPath);
                ctx.restore();
                break;
            }
            case 'star': {
                const stx = Math.min(el.x, el.x + el.width);
                const sty = Math.min(el.y, el.y + el.height);
                const stw = Math.abs(el.width);
                const sth = Math.abs(el.height);
                const stsx = stw / 24,
                    stsy = sth / 24;
                ctx.save();
                ctx.translate(stx, sty);
                ctx.scale(stsx, stsy);
                ctx.lineWidth = el.strokeWidth / Math.sqrt(stsx * stsy);
                const starPath = new Path2D(
                    'M12 2 L15.09 8.26 L22 9.27 L17 14.14 L18.18 21.02 L12 17.77 L5.82 21.02 L7 14.14 L2 9.27 L8.91 8.26 Z',
                );
                if (hasFill) ctx.fill(starPath);
                ctx.stroke(starPath);
                ctx.restore();
                break;
            }
        }

        if (el.type !== 'text' && el.text !== undefined && el.text !== '') drawEmbeddedText(el);

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawRoundedPolygon(ctx: Canvas2D, points: { x: number; y: number }[], radius: number): void {
        const pointCount = points.length;
        if (pointCount < 3) return;
        for (const [i, curr] of points.entries()) {
            const prev = points[(i - 1 + pointCount) % pointCount] ?? curr;
            const next = points[(i + 1) % pointCount] ?? curr;
            const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
            const toNext = { x: next.x - curr.x, y: next.y - curr.y };
            const distPrev = Math.sqrt(toPrev.x * toPrev.x + toPrev.y * toPrev.y);
            const distNext = Math.sqrt(toNext.x * toNext.x + toNext.y * toNext.y);
            const cornerRadius = Math.min(radius, distPrev / 2, distNext / 2);
            const startX = curr.x + (toPrev.x / distPrev) * cornerRadius;
            const startY = curr.y + (toPrev.y / distPrev) * cornerRadius;
            const endX = curr.x + (toNext.x / distNext) * cornerRadius;
            const endY = curr.y + (toNext.y / distNext) * cornerRadius;
            if (i === 0) ctx.moveTo(startX, startY);
            else ctx.lineTo(startX, startY);
            ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
        }
        ctx.closePath();
    }

    function drawEmbeddedText(el: CanvasElement): void {
        if (ctx === null || el.text === undefined || el.text === '') return;
        const bounds = getElementBounds(el);
        const fs = el.fontSize ?? 16;
        const fsNum = fs > 0 ? fs : 16;
        ctx.save();
        ctx.font = `${fsNum}px "Helvetica", "Segoe UI", sans-serif`;
        ctx.fillStyle = el.strokeColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.setLineDash([]);
        const lines = el.text.split('\n');
        const lh = fsNum * 1.3;
        const totalH = lines.length * lh;
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const startY = cy - totalH / 2 + lh / 2;
        for (const [i, line] of lines.entries()) ctx.fillText(line, cx, startY + i * lh);
        ctx.restore();
    }

    function drawSelectionOutline(el: CanvasElement, { showHandles }: { showHandles: boolean }): void {
        if (ctx === null) return;
        ctx.save();
        const bounds = getElementBounds(el);
        const pad = 6 / zoom.value;
        const lw = 1.5 / zoom.value;
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = lw;
        ctx.setLineDash([6 / zoom.value, 4 / zoom.value]);
        ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
        ctx.setLineDash([]);
        if (showHandles) {
            const handles = getHandlePositions(el);
            const hs = HANDLE_SIZE / zoom.value;
            for (const pos of Object.values(handles)) {
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = SELECTION_COLOR;
                ctx.lineWidth = 1.5 / zoom.value;
                ctx.fillRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
                ctx.strokeRect(pos.x - hs / 2, pos.y - hs / 2, hs, hs);
            }
        }
        ctx.restore();
    }

    function drawMarquee(rect: { x: number; y: number; width: number; height: number }): void {
        if (ctx === null) return;
        ctx.save();
        ctx.fillStyle = 'rgba(74, 144, 217, 0.08)';
        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1 / zoom.value;
        ctx.setLineDash([4 / zoom.value, 4 / zoom.value]);
        const left = Math.min(rect.x, rect.x + rect.width);
        const top = Math.min(rect.y, rect.y + rect.height);
        const width = Math.abs(rect.width);
        const height = Math.abs(rect.height);
        ctx.fillRect(left, top, width, height);
        ctx.strokeRect(left, top, width, height);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // Export

    function exportToBlob(opts: {
        elements: CanvasElement[];
        withBackground: boolean;
        scale: number;
        padding?: number;
    }): Promise<Blob | null> {
        const exportElements = opts.elements;
        if (exportElements.length === 0) return Promise.resolve(null);

        const pad = opts.padding ?? 20;
        const scale = opts.scale;

        // Calculate tight bounding box of all export elements
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const el of exportElements) {
            const bounds = getElementBounds(el);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        }

        const width = Math.ceil((maxX - minX + pad * 2) * scale);
        const height = Math.ceil((maxY - minY + pad * 2) * scale);

        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = findContext2D(offscreen);
        if (offCtx === null) return Promise.resolve(null);

        // Background
        if (opts.withBackground) {
            offCtx.fillStyle = getCSSVariable('--base1');
            offCtx.fillRect(0, 0, width, height);
        }

        // Set up world-space transform: scale then translate so bounding box starts at padding
        offCtx.scale(scale, scale);
        offCtx.translate(pad - minX, pad - minY);

        // Temporarily swap the renderer's ctx so drawElement uses the offscreen context
        const savedCtx = ctx;
        ctx = offCtx;

        for (const el of exportElements) drawElement(el);

        // Restore original context
        ctx = savedCtx;

        return encodePng(offscreen);
    }

    return {
        setupCanvas,
        handleResize,
        renderScene,
        screenToWorld,
        worldToScreen,
        getScreenPoint,
        cssWidth,
        cssHeight,
        findCtx: (): Canvas2D | null => ctx,
        exportToBlob,
    };
}

/** Get a CSS custom property value from the document root. */
function getCSSVariable(varName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
