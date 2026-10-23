/**
 * useCodemirror — creates and manages a CodeMirror 6 markdown editor instance
 * with extensions, themes, and lifecycle cleanup.
 */

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, indentOnInput } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder, drawSelection } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { onUnmounted, watch, type Ref, shallowRef, nextTick, type ShallowRef } from 'vue';

/**
 * Custom syntax highlight style that uses the app's accent color for links
 * instead of the browser-default blue/purple. Also ensures raw markdown
 * tokens (visible on the active line) look consistent with the theme.
 */
export const phyllaHighlightStyle = HighlightStyle.define([
    // Markdown
    { tag: tags.link, color: 'var(--accent-color, #3eb489)' },
    { tag: tags.url, color: 'var(--accent-color, #3eb489)' },
    { tag: tags.heading, fontWeight: '600' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: '600' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.monospace, fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace", fontSize: '0.9em' },
    { tag: tags.meta, color: 'var(--text2)' },
    { tag: tags.processingInstruction, color: 'var(--text2)' },

    // Code syntax highlighting
    { tag: tags.keyword, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.controlKeyword, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.operatorKeyword, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.definitionKeyword, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.moduleKeyword, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.operator, color: 'var(--code-operator, #56b6c2)' },
    { tag: tags.string, color: 'var(--code-string, #98c379)' },
    { tag: tags.special(tags.string), color: 'var(--code-string, #98c379)' },
    { tag: tags.number, color: 'var(--code-number, #d19a66)' },
    { tag: tags.integer, color: 'var(--code-number, #d19a66)' },
    { tag: tags.float, color: 'var(--code-number, #d19a66)' },
    { tag: tags.bool, color: 'var(--code-number, #d19a66)' },
    { tag: tags.null, color: 'var(--code-number, #d19a66)' },
    { tag: tags.comment, color: 'var(--code-comment, #5c6370)', fontStyle: 'italic' },
    { tag: tags.lineComment, color: 'var(--code-comment, #5c6370)', fontStyle: 'italic' },
    { tag: tags.blockComment, color: 'var(--code-comment, #5c6370)', fontStyle: 'italic' },
    { tag: tags.docComment, color: 'var(--code-comment, #5c6370)', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), color: 'var(--code-function, #61afef)' },
    { tag: tags.function(tags.definition(tags.variableName)), color: 'var(--code-function, #61afef)' },
    { tag: tags.definition(tags.variableName), color: 'var(--code-variable, #e06c75)' },
    { tag: tags.variableName, color: 'var(--code-variable, #e06c75)' },
    { tag: tags.definition(tags.propertyName), color: 'var(--code-property, #e06c75)' },
    { tag: tags.propertyName, color: 'var(--code-property, #e06c75)' },
    { tag: tags.typeName, color: 'var(--code-type, #e5c07b)' },
    { tag: tags.className, color: 'var(--code-type, #e5c07b)' },
    { tag: tags.namespace, color: 'var(--code-type, #e5c07b)' },
    { tag: tags.labelName, color: 'var(--code-variable, #e06c75)' },
    { tag: tags.attributeName, color: 'var(--code-attribute, #d19a66)' },
    { tag: tags.attributeValue, color: 'var(--code-string, #98c379)' },
    { tag: tags.tagName, color: 'var(--code-tag, #e06c75)' },
    { tag: tags.angleBracket, color: 'var(--code-bracket, #abb2bf)' },
    { tag: tags.bracket, color: 'var(--code-bracket, #abb2bf)' },
    { tag: tags.paren, color: 'var(--code-bracket, #abb2bf)' },
    { tag: tags.squareBracket, color: 'var(--code-bracket, #abb2bf)' },
    { tag: tags.brace, color: 'var(--code-bracket, #abb2bf)' },
    { tag: tags.regexp, color: 'var(--code-string, #98c379)' },
    { tag: tags.escape, color: 'var(--code-operator, #56b6c2)' },
    { tag: tags.self, color: 'var(--code-keyword, #c678dd)' },
    { tag: tags.atom, color: 'var(--code-number, #d19a66)' },
    { tag: tags.punctuation, color: 'var(--code-punctuation, #abb2bf)' },
    { tag: tags.separator, color: 'var(--code-punctuation, #abb2bf)' },
]);

/**
 * Core CodeMirror 6 composable. Creates and manages an EditorView,
 * keeping a Vue `content` ref in sync with the document.
 *
 * @param containerRef - ref to the DOM element that will host the editor
 * @param content      - reactive content ref (shared with persistence layer)
 * @param onContentChange - callback after any user edit (triggers auto-save, etc.)
 * @param extraExtensions - additional extensions (live-preview, embeds, etc.)
 * @param placeholderText - placeholder when document is empty
 * @param fileId - reactive ref whose value changes when a different file is loaded (triggers full state reset)
 */
export function useCodemirror(
    containerRef: Ref<HTMLElement | null>,
    content: Ref<string>,
    onContentChange: () => void,
    {
        extraExtensions = [],
        placeholderText = 'Start writing...',
        fileId,
    }: { extraExtensions?: Extension[]; placeholderText?: string; fileId?: Ref<string | null> } = {},
): { view: ShallowRef<EditorView | null> } {
    const view = shallowRef<EditorView | null>(null);

    // Flag to avoid infinite loops when we push content → editor
    let updatingFromExternal = false;

    /**
     * Set to true when the fileId watcher fires but content hasn't updated yet.
     * The content watcher checks this to use setState (no undo history) instead
     * of dispatch for the first content update after a file switch.
     */
    let isPendingFileSwitch = false;

    /** Build the full extension set */
    function buildExtensions(): Extension[] {
        return [
            // Markdown language support (with code block language highlighting)
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            syntaxHighlighting(phyllaHighlightStyle),
            indentOnInput(),

            // Editing helpers
            history(),
            closeBrackets(),
            drawSelection(),
            highlightSelectionMatches(),
            cmPlaceholder(placeholderText),

            // Keymaps
            keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),

            // Listen for document changes and sync back to the Vue ref
            EditorView.updateListener.of((update): void => {
                if (update.docChanged && !updatingFromExternal) {
                    content.value = update.state.doc.toString();
                    onContentChange();
                }
            }),

            // Line wrapping
            EditorView.lineWrapping,

            // Caller-provided extensions (live-preview, widgets, theme, etc.)
            ...extraExtensions,
        ];
    }

    // Watch the container ref — create the editor when it appears in the DOM
    // (v-if="isMarkdownFile" toggles it), destroy when it disappears.
    watch(
        containerRef,
        async (container, _oldContainer): Promise<void> => {
            // Destroy previous instance if container changed or disappeared
            if (view.value !== null) {
                view.value.destroy();
                view.value = null;
            }
            if (container === null) return;

            // Wait for Vue to finish flushing DOM updates
            await nextTick();

            const state = EditorState.create({
                doc: content.value,
                extensions: buildExtensions(),
            });

            view.value = new EditorView({
                state,
                parent: container,
            });
        },
        { flush: 'post' },
    );

    onUnmounted((): void => {
        view.value?.destroy();
        view.value = null;
    });

    /**
     * When a different file is loaded, recreate the EditorState so the undo
     * history, cursor position, and scroll are all reset cleanly.
     *
     * IMPORTANT: this watcher fires before the props.file watcher in NoteEditor.vue
     * updates content.value (Vue runs watchers in registration order). So at this
     * point content.value is still the old file's content. We reset state now for
     * cursor/scroll, then set isPendingFileSwitch so the content watcher below will
     * use setState (not dispatch) when the new content arrives — preventing an undo
     * history entry that would let Cmd+Z bleed old note content into the new note.
     */
    if (fileId !== undefined) {
        watch(fileId, (): void => {
            const editorView = view.value;
            if (editorView === null) return;

            isPendingFileSwitch = true;
            updatingFromExternal = true;
            editorView.setState(
                EditorState.create({
                    doc: content.value,
                    extensions: buildExtensions(),
                }),
            );
            updatingFromExternal = false;
        });
    }

    /**
     * When content ref changes externally (file load, dictation, etc.)
     * push the new content into the editor without firing our own listener.
     */
    watch(content, (newVal): void => {
        const editorView = view.value;
        if (editorView === null) return;

        const current = editorView.state.doc.toString();
        if (current === newVal) {
            // Content matches — clear any pending file switch flag and bail.
            isPendingFileSwitch = false;
            return;
        }

        updatingFromExternal = true;
        if (isPendingFileSwitch) {
            /**
             * New file content just arrived after a note switch — reset state
             * cleanly so no undo history entry is created. Without this, the
             * dispatch below would add an entry and Cmd+Z would restore the
             * previous note's content into the newly selected note.
             */
            isPendingFileSwitch = false;
            editorView.setState(
                EditorState.create({
                    doc: newVal,
                    extensions: buildExtensions(),
                }),
            );
        } else {
            editorView.dispatch({
                changes: { from: 0, to: current.length, insert: newVal },
            });
        }
        updatingFromExternal = false;
    });

    return { view };
}
