// Measures text on a 2D context, for sizing text elements to their content.
import type { Canvas2D } from '@/renderer/composables/drawing/canvas2d';

/** Measure the box a text element occupies at a given font size. */
export function measureTextBox(
    ctx: Pick<Canvas2D, 'save' | 'restore' | 'font' | 'measureText'>,
    text: string,
    fontSize: number,
): { width: number; height: number } {
    ctx.save();
    ctx.font = `${fontSize}px "Helvetica", "Segoe UI", sans-serif`;
    const lines = text.split('\n');
    let width = 0;
    for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
    ctx.restore();
    return { width, height: lines.length * fontSize * 1.3 };
}
