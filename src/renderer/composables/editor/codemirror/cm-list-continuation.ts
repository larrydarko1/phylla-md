/**
 * cm-list-continuation — CodeMirror 6 keymap extension that continues
 * ordered/unordered lists and task items on Enter.
 */

import { EditorSelection } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';

export const listContinuationKeymap = keymap.of([
    {
        key: 'Enter',
        run: continueMarkdownList,
    },
]);

/**
 * Renumber consecutive ordered list items starting from a given position.
 */
function renumberOrderedList(text: string, fromPos: number, indent: string, startNum: number): string {
    const before = text.substring(0, fromPos);
    const after = text.substring(fromPos);
    const lines = after.split('\n');
    const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}(\\d+)\\. `);
    let num = startNum;
    let changed = false;

    for (const [i, lineText] of lines.entries()) {
        const match = lineText.match(pattern);
        if (match == null) break;
        const oldNum = parseInt(match[1] ?? '', 10);
        if (oldNum !== num) {
            lines[i] = lineText.replace(pattern, `${indent}${num}. `);
            changed = true;
        }
        num++;
    }

    return changed ? before + lines.join('\n') : text;
}

/**
 * Handle Enter key in markdown lists:
 * - Continue bullet lists with "- " (and "- [ ] " for tasks)
 * - Continue ordered lists with the next number
 * - Empty list items: remove the prefix and leave a blank line
 */
/** Per-line replacements turning `original` into `updated`, starting at `fromPos`. */
function buildLineChanges(
    original: string,
    updated: string,
    fromPos: number,
): { from: number; to: number; insert: string }[] {
    const changes: { from: number; to: number; insert: string }[] = [];
    const origLines = original.substring(fromPos).split('\n');
    const updLines = updated.substring(fromPos).split('\n');
    let pos = fromPos;
    for (const [i, origLine] of origLines.entries()) {
        const updLine = updLines[i] ?? '';
        if (origLine !== updLine) changes.push({ from: pos, to: pos + origLine.length, insert: updLine });
        pos += origLine.length + 1;
    }
    return changes;
}

function continueMarkdownList(view: EditorView): boolean {
    const { state } = view;
    const { from: cursorPos } = state.selection.main;
    const line = state.doc.lineAt(cursorPos);
    const lineText = line.text;
    const posInLine = cursorPos - line.from;
    const textBeforeCursor = lineText.substring(0, posInLine);

    // Bullet list: "  - content" or "  - [ ] content" or "  - [x] content" or "  - [/] content"
    const bulletMatch = /^(\s*)- (\[[ x/]\] )?(.*)$/i.exec(textBeforeCursor);
    if (bulletMatch != null) {
        const indent = bulletMatch[1] ?? '';
        const checkbox = bulletMatch[2] ?? '';
        const lineContent = bulletMatch[3] ?? '';
        const trimmedContent = lineContent.trim();
        const isEmpty = trimmedContent.length === 0;

        // Empty list item → remove the prefix
        if (isEmpty) {
            view.dispatch({
                changes: { from: line.from, to: cursorPos, insert: '' },
                selection: EditorSelection.cursor(line.from),
            });
            return true;
        }

        // Continue the list
        const prefix = checkbox !== '' ? `${indent}- [ ] ` : `${indent}- `;
        view.dispatch({
            changes: { from: cursorPos, to: cursorPos, insert: `\n${prefix}` },
            selection: EditorSelection.cursor(cursorPos + 1 + prefix.length),
        });
        return true;
    }

    // Ordered list: "  1. content"
    const orderedMatch = /^(\s*)(\d+)\. (.*)$/.exec(textBeforeCursor);
    if (orderedMatch != null) {
        const indent = orderedMatch[1] ?? '';
        const num = parseInt(orderedMatch[2] ?? '', 10);
        const lineContent = orderedMatch[3] ?? '';
        const trimmedContent = lineContent.trim();
        const isEmpty = trimmedContent.length === 0;

        // Empty list item → remove the prefix
        if (isEmpty) {
            view.dispatch({
                changes: { from: line.from, to: cursorPos, insert: '' },
                selection: EditorSelection.cursor(line.from),
            });
            return true;
        }

        // Continue with next number
        const prefix = `${indent}${num + 1}. `;
        const insertLength = 1 + prefix.length;

        // Pre-compute renumbering changes in original document coordinates so
        // they can be batched with the insertion into a single transaction.
        const renumberChanges: { from: number; to: number; insert: string }[] = [];
        if (line.number < state.doc.lines) {
            const nextLineFrom = state.doc.line(line.number + 1).from;
            const origText = state.doc.toString();
            const updated = renumberOrderedList(origText, nextLineFrom, indent, num + 2);
            if (updated !== origText) renumberChanges.push(...buildLineChanges(origText, updated, nextLineFrom));
        }

        view.dispatch({
            changes: [{ from: cursorPos, to: cursorPos, insert: `\n${prefix}` }, ...renumberChanges],
            selection: EditorSelection.cursor(cursorPos + insertLength),
        });
        return true;
    }

    return false; // Let default Enter handling proceed
}
