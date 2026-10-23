/**
 * cm-markdown-widgets — CodeMirror 6 ViewPlugin entry point for markdown live-preview.
 * Assembles the interactive extension and decoration plugin from cm-widgets and cm-deco-builders.
 */

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Ref } from 'vue';

import {
    activeLinesSet,
    buildEmbedDecos,
    buildHighlightDecos,
    buildSyntaxDecos,
    buildTaskDecos,
    mergeVisibleRanges,
} from '@/renderer/composables/editor/codemirror/cm-deco-builders';

export const interactiveExtension = EditorView.domEventHandlers({
    mousedown(event: MouseEvent, view: EditorView): boolean {
        const target = event.target instanceof Element ? event.target : null;

        // ── Block CM6 from processing clicks inside embed media controls ────
        if (target?.closest('.cm-embed-controls') != null) {
            return true;
        }

        // ── Block CM6 for clicks on the video element itself ────────────────
        if (target?.closest('.cm-embed-video') != null) {
            return true;
        }

        // ── Link click via syntax tree ──────────────────────────────────────
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos != null) {
            const url = findExternalUrlAt(view, pos);
            if (url !== null) {
                event.preventDefault();
                void window.electronAPI.openExternal(url);
                return true;
            }
        }
        return false;
    },
});

/**
 * Single unified ViewPlugin for ALL markdown live-preview decorations:
 * syntax-tree (headings, bold, italic, links, code, etc.) and regex
 * (highlights, embeds, tasks). One plugin eliminates overlapping-replace
 * conflicts that occurred with two independent plugins.
 */
export function createMarkdownWidgetsPlugin(
    embedCache: Ref<Map<string, string>>,
    embedCacheVersion: Ref<number>,
    getEmbedMediaType: (fileName: string) => string,
): Extension {
    let lastCacheVersion = embedCacheVersion.value;

    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.build(view.state, view.visibleRanges);
            }

            build(state: EditorState, visibleRanges: readonly { from: number; to: number }[]): DecorationSet {
                try {
                    const activeLines = activeLinesSet(state);

                    // Merge visible ranges so regex scanners don't produce duplicates
                    const merged = mergeVisibleRanges(state, visibleRanges);

                    // 1. Embeds first — they return covered ranges for the syntax walker to skip
                    const { decos: embedDecos, coveredRanges: embedRanges } = buildEmbedDecos(
                        state,
                        merged,
                        activeLines,
                        embedCache.value,
                        getEmbedMediaType,
                    );

                    // 2. Regex-based: highlights and tasks (merged visible ranges)
                    const highlightDecos = buildHighlightDecos(state, merged, activeLines);
                    const taskDecos = buildTaskDecos(state, merged, activeLines);

                    // 3. Syntax-tree: headings, bold, italic, links, etc.
                    const syntaxDecos = buildSyntaxDecos(state, visibleRanges, activeLines, embedRanges);

                    // 4. Merge all, deduplicate, and create DecorationSet
                    const allDecos = [...embedDecos, ...highlightDecos, ...taskDecos, ...syntaxDecos];

                    // Deduplicate: same from+to with same decoration type can crash RangeSetBuilder
                    const seen = new Set<string>();
                    const uniqueDecos: Range<Decoration>[] = [];
                    for (const deco of allDecos) {
                        const key = `${deco.from}:${deco.to}:${deco.value.startSide}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            uniqueDecos.push(deco);
                        }
                    }

                    return Decoration.set(uniqueDecos, true);
                } catch (e) {
                    window.electronAPI.log.error('[Phylla] Widget plugin build error:', e);
                    return Decoration.none;
                }
            }

            update(update: ViewUpdate): void {
                const cacheChanged = embedCacheVersion.value !== lastCacheVersion;
                if (update.docChanged || update.selectionSet || update.viewportChanged || cacheChanged) {
                    lastCacheVersion = embedCacheVersion.value;
                    this.decorations = this.build(update.state, update.view.visibleRanges);
                }
            }
        },
        {
            decorations: (v): DecorationSet => v.decorations,
            eventHandlers: {
                mousedown(event: MouseEvent, view: EditorView): void {
                    // ── Task checkbox toggle ──
                    const label = event.target instanceof Element ? event.target.closest('.cm-task-label') : null;
                    if (label == null || !(label instanceof HTMLElement)) return;

                    const posStr = label.dataset['taskPos'];
                    if (posStr == null) return;

                    event.preventDefault();
                    event.stopPropagation();

                    const taskPos = parseInt(posStr, 10);
                    if (isNaN(taskPos) || taskPos < 0 || taskPos >= view.state.doc.length) return;

                    const line = view.state.doc.lineAt(taskPos);
                    const lineText = line.text;

                    let newLine: string;
                    if (lineText.includes('- [ ]')) {
                        newLine = lineText.replace('- [ ]', '- [/]');
                    } else if (lineText.includes('- [/]')) {
                        newLine = lineText.replace('- [/]', '- [x]');
                    } else if (/- \[x\]/i.test(lineText)) {
                        newLine = lineText.replace(/- \[x\]/i, '- [ ]');
                    } else {
                        return;
                    }

                    view.dispatch({
                        changes: { from: line.from, to: line.to, insert: newLine },
                    });
                },
            },
        },
    );
}

/** Walk out from `pos` looking for an http(s) link the click should open externally. */
function findExternalUrlAt(view: EditorView, pos: number): string | null {
    let node = syntaxTree(view.state).resolveInner(pos, 1);
    for (let depth = 0; depth < 10; depth++) {
        if (node.name === 'Link') {
            const text = view.state.doc.sliceString(node.from, node.to);
            const linkMatch = /\]\(([^)]+)\)$/.exec(text);
            const url = linkMatch?.[1];
            if (url != null && (url.startsWith('http://') || url.startsWith('https://'))) return url;
            return null;
        }
        if (node.name === 'URL') {
            const url = view.state.doc.sliceString(node.from, node.to);
            return url.startsWith('http://') || url.startsWith('https://') ? url : null;
        }
        if (node.parent == null) break;
        node = node.parent;
    }
    return null;
}
