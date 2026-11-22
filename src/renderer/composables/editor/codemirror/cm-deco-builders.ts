/**
 * cm-deco-builders — Decoration builder functions for markdown live-preview.
 */

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import {
    EmbedWidget,
    HorizontalRuleWidget,
    TableWidget,
    TaskCheckboxWidget,
} from '@/renderer/composables/editor/codemirror/cm-widgets';

const highlightRegex = /==((?!=).+?)==/g;
const embedRegex = /!\[\[([^\]]+)\]\]/g;
const taskRegex = /^([ \t]*)- \[([ x/])\] /gim;

export function activeLinesSet(state: EditorState): Set<number> {
    const lines = new Set<number>();
    for (const range of state.selection.ranges) {
        const startLine = state.doc.lineAt(range.from).number;
        const endLine = state.doc.lineAt(range.to).number;
        for (let lineNo = startLine; lineNo <= endLine; lineNo++) lines.add(lineNo);
    }
    return lines;
}

export function buildHighlightDecos(
    state: EditorState,
    visibleRanges: readonly { from: number; to: number }[],
    activeLines: Set<number>,
): Range<Decoration>[] {
    const decos: Range<Decoration>[] = [];
    for (const { from: vFrom, to: vTo } of visibleRanges) {
        const [lineFrom, lineTo] = expandToLines(state, vFrom, vTo);
        const slice = state.doc.sliceString(lineFrom, lineTo);

        let match: RegExpExecArray | null;
        highlightRegex.lastIndex = 0;
        while ((match = highlightRegex.exec(slice)) !== null) {
            const from = lineFrom + match.index;
            const to = from + match[0].length;
            const lineNum = state.doc.lineAt(from).number;
            if (activeLines.has(lineNum)) continue;

            decos.push(Decoration.mark({ class: 'cm-highlight' }).range(from, to));
            decos.push(Decoration.replace({}).range(from, from + 2));
            decos.push(Decoration.replace({}).range(to - 2, to));
        }
    }
    return decos;
}

/**
 * Scans visible ranges for ![[embed]] syntax.
 * Returns decorations AND the set of character ranges covered by embeds
 * so the syntax-tree walker can skip those regions (preventing overlapping replaces).
 */
export function buildEmbedDecos(
    state: EditorState,
    visibleRanges: readonly { from: number; to: number }[],
    activeLines: Set<number>,
    embedCache: Map<string, string>,
    getEmbedMediaType: (fileName: string) => string,
): { decos: Range<Decoration>[]; coveredRanges: [number, number][] } {
    const decos: Range<Decoration>[] = [];
    const coveredRanges: [number, number][] = [];

    for (const { from: vFrom, to: vTo } of visibleRanges) {
        const [lineFrom, lineTo] = expandToLines(state, vFrom, vTo);
        const slice = state.doc.sliceString(lineFrom, lineTo);

        let match: RegExpExecArray | null;
        embedRegex.lastIndex = 0;
        while ((match = embedRegex.exec(slice)) !== null) {
            const from = lineFrom + match.index;
            const to = from + match[0].length;
            const lineNum = state.doc.lineAt(from).number;

            // Always mark as covered so syntax-tree walker skips these ranges
            coveredRanges.push([from, to]);

            if (activeLines.has(lineNum)) continue;

            const inner = match[1] ?? '';
            const pipeIndex = inner.indexOf('|');
            let fileName: string;
            let displayOptions = '';
            if (pipeIndex !== -1) {
                fileName = inner.substring(0, pipeIndex).trim();
                displayOptions = inner.substring(pipeIndex + 1).trim();
            } else {
                fileName = (inner.split('#')[0] ?? inner).trim();
            }

            const resolvedPath = embedCache.get(fileName);
            const mediaType = resolvedPath !== undefined ? getEmbedMediaType(fileName) : 'unknown';

            decos.push(
                Decoration.replace({
                    widget: new EmbedWidget(fileName, resolvedPath, mediaType, displayOptions),
                }).range(from, to),
            );
        }
    }
    return { decos, coveredRanges };
}

export function buildTaskDecos(
    state: EditorState,
    visibleRanges: readonly { from: number; to: number }[],
    activeLines: Set<number>,
): Range<Decoration>[] {
    const decos: Range<Decoration>[] = [];

    for (const { from: vFrom, to: vTo } of visibleRanges) {
        const [lineFrom, lineTo] = expandToLines(state, vFrom, vTo);
        const slice = state.doc.sliceString(lineFrom, lineTo);

        let match: RegExpExecArray | null;
        taskRegex.lastIndex = 0;
        while ((match = taskRegex.exec(slice)) !== null) {
            const matchFrom = lineFrom + match.index;
            const lineNum = state.doc.lineAt(matchFrom).number;
            if (activeLines.has(lineNum)) continue;

            const indent = match[1] ?? '';
            const marker = (match[2] ?? '').toLowerCase();
            let checked: 'checked' | 'half' | 'unchecked' = 'unchecked';
            if (marker === 'x') checked = 'checked';
            else if (marker === '/') checked = 'half';

            const markerStart = matchFrom + indent.length;
            const markerEnd = markerStart + match[0].length - indent.length;

            const line = state.doc.line(lineNum);
            decos.push(
                Decoration.line({
                    class: `cm-task-line${checked === 'checked' ? ' cm-task-done' : ''}`,
                }).range(line.from),
            );
            decos.push(
                Decoration.replace({
                    widget: new TaskCheckboxWidget(checked, markerStart),
                }).range(markerStart, markerEnd),
            );
        }
    }
    return decos;
}

// ── Syntax-tree live-preview builder ──────────────────────────────────────────

/**
 * Walk the Lezer syntax tree for visible ranges, emitting decorations for
 * markdown syntax (headings, bold, italic, links, etc.) that is NOT on the
 * currently-focused line. Skips ranges already covered by embed widgets to
 * prevent overlapping replace decorations.
 */
export function buildSyntaxDecos(
    state: EditorState,
    visibleRanges: readonly { from: number; to: number }[],
    activeLines: Set<number>,
    embedRanges: [number, number][],
): Range<Decoration>[] {
    const decos: Range<Decoration>[] = [];

    function overlapsEmbed(from: number, to: number): boolean {
        for (const [ef, et] of embedRanges) {
            if (from < et && to > ef) return true;
        }
        return false;
    }

    // Track processed nodes to avoid duplicates when a node spans multiple visible ranges.
    const seen = new Set<string>();

    for (const { from: rangeFrom, to: rangeTo } of visibleRanges) {
        syntaxTree(state).iterate({
            from: rangeFrom,
            to: rangeTo,
            enter(node): false | undefined {
                const { from, to } = node;
                const name = node.name;

                // Deduplicate nodes that span multiple visible ranges
                const key = `${name}:${from}:${to}`;
                if (seen.has(key)) return;
                seen.add(key);

                // Skip nodes covered by embed widgets
                if (overlapsEmbed(from, to)) return;

                const lineFrom = state.doc.lineAt(from).number;
                const lineTo = state.doc.lineAt(to).number;

                let isActive = false;
                for (let ln = lineFrom; ln <= lineTo; ln++) {
                    if (activeLines.has(ln)) {
                        isActive = true;
                        break;
                    }
                }

                // ── GFM Table ─────────────────────────────────────────
                // Must be handled before the isActive guard so we can always
                // return false and prevent child nodes (cells, delimiters)
                // from producing conflicting inline decorations.
                if (name === 'Table') {
                    if (!isActive && from < to) {
                        const rawText = state.doc.sliceString(from, to);
                        const firstLine = state.doc.line(lineFrom);

                        // Replace first line's content with the rendered table widget.
                        // No `block: true` — keeps this an inline replace so it can be
                        // safely mixed with other inline decorations in the sorted set.
                        decos.push(
                            Decoration.replace({ widget: new TableWidget(rawText) }).range(
                                firstLine.from,
                                firstLine.to,
                            ),
                        );

                        // Collapse subsequent table rows to zero height (same pattern as
                        // cm-code-fence) so only the rendered widget is visible.
                        pushHiddenRows(decos, state, lineFrom + 1, lineTo);
                    }
                    return false; // Never descend into table children
                }

                if (isActive) return;

                // ── Headings ──────────────────────────────────────────
                if (/^(ATXHeading[1-6])$/.test(name)) {
                    const level = parseInt(name.replace('ATXHeading', ''), 10);
                    decos.push(
                        Decoration.line({ class: `cm-heading cm-heading-${level}` }).range(state.doc.lineAt(from).from),
                    );
                    const text = state.doc.sliceString(from, to);
                    const markerMatch = /^(#{1,6})\s/.exec(text);
                    if (markerMatch !== null) {
                        decos.push(Decoration.replace({}).range(from, from + markerMatch[0].length));
                    }
                }

                // ── Emphasis (italic) ─────────────────────────────────
                if (name === 'Emphasis') {
                    decos.push(Decoration.mark({ class: 'cm-emphasis' }).range(from, to));
                    decos.push(Decoration.replace({}).range(from, from + 1));
                    decos.push(Decoration.replace({}).range(to - 1, to));
                }

                // ── Strong (bold) ─────────────────────────────────────
                if (name === 'StrongEmphasis') {
                    decos.push(Decoration.mark({ class: 'cm-strong' }).range(from, to));
                    decos.push(Decoration.replace({}).range(from, from + 2));
                    decos.push(Decoration.replace({}).range(to - 2, to));
                }

                // ── Strikethrough ─────────────────────────────────────
                if (name === 'Strikethrough') {
                    decos.push(Decoration.mark({ class: 'cm-strikethrough' }).range(from, to));
                    decos.push(Decoration.replace({}).range(from, from + 2));
                    decos.push(Decoration.replace({}).range(to - 2, to));
                }

                // ── Inline code ───────────────────────────────────────
                if (name === 'InlineCode') {
                    decos.push(Decoration.mark({ class: 'cm-inline-code' }).range(from, to));
                    decos.push(Decoration.replace({}).range(from, from + 1));
                    decos.push(Decoration.replace({}).range(to - 1, to));
                }

                // ── Code blocks ───────────────────────────────────────
                if (name === 'FencedCode') {
                    const firstLine = state.doc.line(lineFrom);
                    const lastLine = state.doc.line(lineTo);
                    const lastText = lastLine.text.trim();
                    const hasClosingFence = lineTo > lineFrom && (lastText === '```' || lastText === '~~~');

                    // Opening fence line: collapse via CSS, hide content
                    decos.push(Decoration.line({ class: 'cm-code-block cm-code-fence' }).range(firstLine.from));
                    if (firstLine.from < firstLine.to) {
                        decos.push(Decoration.replace({}).range(firstLine.from, firstLine.to));
                    }

                    // Content lines
                    for (let ln = lineFrom + 1; ln <= (hasClosingFence ? lineTo - 1 : lineTo); ln++) {
                        const line = state.doc.line(ln);
                        decos.push(Decoration.line({ class: 'cm-code-block' }).range(line.from));
                    }

                    // Closing fence line: collapse via CSS, hide content
                    if (hasClosingFence) {
                        decos.push(Decoration.line({ class: 'cm-code-block cm-code-fence' }).range(lastLine.from));
                        if (lastLine.from < lastLine.to) {
                            decos.push(Decoration.replace({}).range(lastLine.from, lastLine.to));
                        }
                    }
                }

                // ── Blockquote ────────────────────────────────────────
                if (name === 'Blockquote') pushBlockquoteLines(decos, state, lineFrom, lineTo, activeLines);

                // ── Links ─────────────────────────────────────────────
                if (name === 'Link') {
                    const text = state.doc.sliceString(from, to);
                    const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(text);
                    if (linkMatch !== null) {
                        decos.push(
                            Decoration.mark({
                                class: 'cm-link',
                                attributes: { title: linkMatch[2] ?? '' },
                            }).range(from, to),
                        );
                        decos.push(Decoration.replace({}).range(from, from + 1));
                        const closeBracket = from + 1 + (linkMatch[1]?.length ?? 0);
                        decos.push(Decoration.replace({}).range(closeBracket, to));
                    }
                }

                // ── Images ────────────────────────────────────────────
                if (name === 'Image') {
                    const text = state.doc.sliceString(from, to);
                    const imgMatch = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(text);
                    if (imgMatch !== null) decos.push(Decoration.mark({ class: 'cm-image-link' }).range(from, to));
                }

                // ── Horizontal rule ───────────────────────────────────
                if (name === 'HorizontalRule') {
                    decos.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(from, to));
                }

                // ── Bullet list markers ───────────────────────────────
                if (name === 'ListMark') {
                    const text = state.doc.sliceString(from, to);
                    if (text === '-' || text === '*' || text === '+') {
                        decos.push(Decoration.mark({ class: 'cm-list-bullet' }).range(from, to));
                    }
                }
                return undefined;
            },
        });
    }

    return decos;
}

// ── Combined plugin helper ────────────────────────────────────────────────────

/**
 * Merge and deduplicate visible ranges after line expansion.
 * Prevents regex scanners from producing duplicate decorations when
 * two adjacent visible ranges share the same line after expansion.
 */
export function mergeVisibleRanges(
    state: EditorState,
    visibleRanges: readonly { from: number; to: number }[],
): { from: number; to: number }[] {
    if (visibleRanges.length === 0) return [];
    const expanded = visibleRanges.map(({ from, to }): { from: number; to: number } => {
        const [lf, lt] = expandToLines(state, from, to);
        return { from: lf, to: lt };
    });
    expanded.sort((a, b): number => a.from - b.from);
    const merged: { from: number; to: number }[] = [];
    for (const range of expanded) {
        const last = merged[merged.length - 1];
        if (last !== undefined && range.from <= last.to) last.to = Math.max(last.to, range.to);
        else merged.push({ ...range });
    }
    return merged;
}

/**
 * Expand a visible range to full-line boundaries so regex patterns
 * that use `^` (like tasks) match correctly.
 */
function expandToLines(state: EditorState, from: number, to: number): [number, number] {
    return [state.doc.lineAt(from).from, state.doc.lineAt(to).to];
}

/** Collapse table rows `from`..`to` so only the rendered widget shows. */
function pushHiddenRows(decos: Range<Decoration>[], state: EditorState, from: number, to: number): void {
    for (let ln = from; ln <= to; ln++) {
        const line = state.doc.line(ln);
        decos.push(Decoration.line({ class: 'cm-table-hidden-row' }).range(line.from));
        if (line.from < line.to) decos.push(Decoration.replace({}).range(line.from, line.to));
    }
}

/** Style blockquote lines `from`..`to`, hiding the `>` marker on the inactive ones. */
function pushBlockquoteLines(
    decos: Range<Decoration>[],
    state: EditorState,
    from: number,
    to: number,
    activeLines: Set<number>,
): void {
    for (let ln = from; ln <= to; ln++) {
        if (activeLines.has(ln)) continue;
        const line = state.doc.line(ln);
        decos.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from));
        const markerMatch = /^(\s*>\s?)/.exec(line.text);
        if (markerMatch !== null) {
            decos.push(Decoration.replace({}).range(line.from, line.from + markerMatch[0].length));
        }
    }
}
