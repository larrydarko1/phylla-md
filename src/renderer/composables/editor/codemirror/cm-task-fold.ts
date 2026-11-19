/**
 * cm-task-fold — CodeMirror 6 extension that folds completed task items
 * in markdown documents.
 */

import { codeFolding, foldEffect, unfoldEffect, foldedRanges, foldService } from '@codemirror/language';
import { type EditorState, type Range, type Extension, type StateEffect } from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    type EditorView,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
} from '@codemirror/view';

const taskLineRegex = /^(\s*)- \[[ x/]\] /i;

class TaskFoldToggleWidget extends WidgetType {
    folded: boolean;

    constructor(folded: boolean) {
        super();
        this.folded = folded;
    }

    override eq(other: TaskFoldToggleWidget): boolean {
        return this.folded === other.folded;
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = `cm-task-fold-toggle${this.folded ? ' cm-task-fold-collapsed' : ''}`;
        span.setAttribute('aria-label', this.folded ? 'Expand nested items' : 'Collapse nested items');
        return span;
    }

    override ignoreEvent(): boolean {
        return false;
    }
}

const taskFold = foldService.of((state, lineStart, _lineEnd): { from: number; to: number } | null => {
    return taskFoldRange(state, lineStart);
});

const taskFoldTogglePlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.build(view);
        }

        build(view: EditorView): DecorationSet {
            const decos: Range<Decoration>[] = [];
            const { state } = view;
            const folded = foldedRanges(state);

            for (const { from, to } of view.visibleRanges) {
                let pos = from;
                while (pos <= to) {
                    const line = state.doc.lineAt(pos);
                    const range = taskFoldRange(state, line.from);

                    if (range != null) {
                        let isFolded = false;
                        folded.between(range.from, range.from + 1, (): void => {
                            isFolded = true;
                        });

                        decos.push(
                            Decoration.widget({
                                widget: new TaskFoldToggleWidget(isFolded),
                                side: -1,
                            }).range(line.from),
                        );
                    }

                    pos = line.to + 1;
                }
            }

            return Decoration.set(decos, true);
        }

        update(update: ViewUpdate): void {
            if (
                update.docChanged ||
                update.viewportChanged ||
                update.selectionSet ||
                update.transactions.some((tr): boolean =>
                    tr.effects.some(
                        (e): e is StateEffect<{ from: number; to: number }> => e.is(foldEffect) || e.is(unfoldEffect),
                    ),
                )
            ) {
                this.decorations = this.build(update.view);
            }
        }
    },
    {
        decorations: (v): DecorationSet => v.decorations,
        eventHandlers: {
            mousedown(event: MouseEvent, view: EditorView): boolean {
                const target = event.target;
                if (!(target instanceof HTMLElement) || !target.classList.contains('cm-task-fold-toggle')) return false;

                event.preventDefault();
                event.stopPropagation();

                const pos = view.posAtDOM(target);
                const line = view.state.doc.lineAt(pos);
                const range = taskFoldRange(view.state, line.from);
                if (range == null) return false;

                // Unfold whatever fold covers the task line; with none there, fold it.
                const unfold: ReturnType<typeof unfoldEffect.of>[] = [];
                foldedRanges(view.state).between(range.from, range.from + 1, (from, to): void => {
                    unfold.push(unfoldEffect.of({ from, to }));
                });

                if (unfold.length > 0) {
                    view.dispatch({ effects: unfold });
                } else {
                    view.dispatch({
                        effects: [foldEffect.of({ from: range.from, to: range.to })],
                    });
                }

                return true;
            },
        },
    },
);

/**
 * Extension that adds Obsidian-style collapsible nested task lists.
 * Parent task items that have nested children get a fold toggle (▶/▼).
 * Clicking the toggle collapses/expands all nested content.
 */
export function taskFoldExtension(): Extension[] {
    return [
        taskFold,
        codeFolding({
            placeholderDOM(_view, onclick): HTMLSpanElement {
                const span = document.createElement('span');
                span.className = 'cm-task-fold-placeholder';
                span.textContent = '⋯';
                span.title = 'Click to expand';
                span.onclick = onclick;
                return span;
            },
        }),
        taskFoldTogglePlugin,
    ];
}

/**
 * Determine the fold range for a task item at `lineStart`.
 * A parent task can be folded when the lines immediately following it
 * are indented more deeply (nested children — tasks or plain text).
 * Empty lines between children are included in the fold.
 *
 * Returns `{ from, to }` where `from` is the end of the parent line
 * and `to` is the end of the last nested child line, or `null` if
 * there are no nested children.
 */
function taskFoldRange(state: EditorState, lineStart: number): { from: number; to: number } | null {
    const line = state.doc.lineAt(lineStart);
    const match = taskLineRegex.exec(line.text);
    if (match == null) return null;

    const parentIndent = match[1]?.length ?? 0;
    let lastNonEmptyChildLine = line.number;

    for (let lineNo = line.number + 1; lineNo <= state.doc.lines; lineNo++) {
        const nextLine = state.doc.line(lineNo);
        const trimmed = nextLine.text.trim();

        if (trimmed === '') {
            // Empty line — tentatively include it (might be between children)
            continue;
        }

        const nextIndent = /^(\s*)/.exec(nextLine.text)?.[1]?.length ?? 0;
        if (nextIndent > parentIndent) lastNonEmptyChildLine = lineNo;
        else break;
    }

    // No actual nested content found
    if (lastNonEmptyChildLine === line.number) return null;

    // Don't include trailing empty lines — fold up to the last real child
    return { from: line.to, to: state.doc.line(lastNonEmptyChildLine).to };
}
