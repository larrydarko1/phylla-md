/**
 * cm-theme — CodeMirror theme for Phylla's live-preview markdown editor.
 * Uses the same CSS custom properties as the rest of the app,
 * so it automatically applies dark/light themes.
 */

import { EditorView } from '@codemirror/view';

export const phyllaEditorTheme = EditorView.theme({
    // ── Root editor ───────────────────────────────────────────────────────
    '&': {
        flex: '1',
        height: '100%',
        fontSize: '1rem',
        fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        lineHeight: '1.6',
        color: 'var(--text1)',
        backgroundColor: 'transparent',
    },
    '&.cm-focused': {
        outline: 'none',
    },
    '.cm-scroller': {
        overflow: 'auto',
        padding: '2rem',
        fontFamily: 'inherit',
    },
    '.cm-content': {
        caretColor: 'var(--accent-color, #3eb489)',
        padding: '0',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--accent-color, #3eb489)',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 25%, transparent) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 30%, transparent) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--text2) 5%, transparent)',
    },
    '.cm-line': {
        position: 'relative',
    },
    '.cm-gutters': {
        display: 'none',
    },
    '.cm-placeholder': {
        color: 'var(--text2)',
    },

    // ── Live preview: headings ────────────────────────────────────────────
    '.cm-heading': {
        fontWeight: '600',
        color: 'var(--text1)',
        lineHeight: '1.4',
    },
    '.cm-heading-1': { fontSize: '2em' },
    '.cm-heading-2': { fontSize: '1.5em' },
    '.cm-heading-3': { fontSize: '1.25em' },
    '.cm-heading-4': { fontSize: '1.1em' },
    '.cm-heading-5': { fontSize: '1em' },
    '.cm-heading-6': { fontSize: '0.9em', color: 'var(--text2)' },

    // ── Live preview: inline styles ───────────────────────────────────────
    '.cm-emphasis': {
        fontStyle: 'italic',
    },
    '.cm-strong': {
        fontWeight: '600',
        color: 'var(--accent-color, #3eb489)',
    },
    '.cm-strikethrough': {
        textDecoration: 'line-through',
        opacity: '0.7',
    },
    '.cm-inline-code': {
        fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', Menlo, Consolas, monospace",
        fontSize: '0.9em',
        background: 'color-mix(in srgb, var(--text2) 15%, transparent)',
        padding: '0.2em 0.4em',
        borderRadius: '3px',
        color: 'var(--base2)',
    },
    '.cm-highlight': {
        backgroundColor: 'color-mix(in srgb, var(--accent-color) 20%, transparent)',
        padding: '0.1em 0.3em',
        borderRadius: '4px',
    },
    '.cm-link': {
        color: 'var(--accent-color, #3eb489)',
        textDecoration: 'none',
        cursor: 'pointer',
    },
    '.cm-link:hover': {
        textDecoration: 'underline',
    },
    '.cm-image-link': {
        color: 'var(--accent-color, #3eb489)',
        fontStyle: 'italic',
    },

    // ── Live preview: blocks ──────────────────────────────────────────────
    '.cm-blockquote': {
        paddingLeft: '1em',
        borderLeft: '4px solid var(--accent-color, #3eb489)',
        color: 'var(--text2)',
    },
    '.cm-code-block': {
        fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', Menlo, Consolas, monospace",
        fontSize: '0.875em',
        backgroundColor: 'color-mix(in srgb, var(--text2) 10%, transparent)',
        padding: '0 1em',
    },
    '.cm-code-fence': {
        fontSize: '0',
        lineHeight: '0',
        height: '0',
        padding: '0 !important',
        overflow: 'hidden',
    },
    '.cm-hr': {
        border: 'none',
        borderTop: '2px solid var(--text3)',
        margin: '1em 0',
    },

    // ── Live preview: lists ───────────────────────────────────────────────
    '.cm-list-bullet': {
        color: 'var(--accent-color, #3eb489)',
        fontWeight: '700',
    },

    // ── Task checkboxes ───────────────────────────────────────────────────
    '.cm-task-line': {
        // No extra styling needed, the checkboxes are inline widgets
    },
    '.cm-task-done': {
        textDecoration: 'line-through',
        textDecorationColor: 'var(--text2)',
        color: 'var(--text2)',
    },
    '.cm-task-label': {
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'pointer',
        marginRight: '0.5em',
        verticalAlign: 'middle',
    },
    '.cm-task-checkbox-input': {
        position: 'absolute',
        opacity: '0',
        width: '0',
        height: '0',
    },
    '.cm-task-checkbox': {
        width: '18px',
        height: '18px',
        minWidth: '18px',
        backgroundColor: 'var(--text3)',
        borderRadius: '5px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
        position: 'relative',
        display: 'inline-block',
    },
    '.cm-task-checked': {
        backgroundColor: 'var(--accent-color, #3eb489)',
    },
    // Checkmark pseudo-element via CSS
    '.cm-task-checked::after': {
        content: '""',
        position: 'absolute',
        left: '50%',
        top: '45%',
        width: '5px',
        height: '9px',
        border: 'solid var(--text3)',
        borderWidth: '0 2px 2px 0',
        transform: 'translate(-50%, -55%) rotate(45deg)',
        display: 'block',
    },
    '.cm-task-half': {
        background: 'linear-gradient(to top, var(--accent-color, #3eb489) 50%, var(--text3, #ddd) 50%)',
    },

    // ── Embed widgets ─────────────────────────────────────────────────────
    '.cm-embed-image-wrapper': {
        margin: '0.5em 0',
    },
    '.cm-embed-image': {
        maxWidth: '100%',
        height: 'auto',
        borderRadius: '8px',
        display: 'block',
    },
    // The border, the rounding and the clipping are the app's `.media-frame`.
    '.cm-embed-video-wrapper': {
        margin: '0.5em 0',
        maxWidth: '100%',
    },
    '.cm-embed-video': {
        maxWidth: '100%',
        maxHeight: '500px',
        display: 'block',
        width: '100%',
        background: 'var(--base1)',
        cursor: 'pointer',
    },
    '.cm-embed-audio-wrapper': {
        margin: '0.5em 0',
        maxWidth: '500px',
    },

    // The transport bar and the video frame are the app's `.media-*` ones in
    // components/_media.scss — this design, which the standalone viewers now follow.
    '.cm-embed-pdf-wrapper': {
        margin: '0.5em 0',
        border: '1px solid var(--text3)',
        borderRadius: '8px',
        overflow: 'hidden',
    },
    '.cm-embed-pdf': {
        width: '100%',
        height: '600px',
        border: 'none',
        display: 'block',
    },
    '.cm-embed-note-link': {
        margin: '0.5em 0',
        padding: '0.5em 0.75em',
        background: 'color-mix(in srgb, var(--text2) 8%, transparent)',
        border: '1px solid var(--text3)',
        borderRadius: '6px',
        color: 'var(--accent-color, #3eb489)',
        cursor: 'pointer',
    },
    '.cm-embed-placeholder': {
        margin: '0.5em 0',
        padding: '0.5em 0.75em',
        background: 'color-mix(in srgb, var(--text2) 6%, transparent)',
        border: '1px dashed var(--text3)',
        borderRadius: '6px',
        color: 'var(--text2)',
        fontSize: '0.9em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4em',
    },

    // ── Task fold toggles ─────────────────────────────────────────────────
    '.cm-task-fold-toggle': {
        position: 'absolute',
        left: '-20px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        cursor: 'pointer',
        opacity: '0.4',
        transition: 'opacity 0.15s ease',
        userSelect: 'none',
        borderRadius: '3px',
        flexShrink: '0',
    },
    '.cm-line:hover .cm-task-fold-toggle': {
        opacity: '0.4',
    },
    '.cm-task-fold-collapsed': {
        opacity: '0.6',
    },
    '.cm-task-fold-toggle:hover': {
        opacity: '1 !important',
        background: 'color-mix(in srgb, var(--text2) 15%, transparent)',
    },
    // CSS triangle: points down when expanded (default)
    '.cm-task-fold-toggle::after': {
        content: '""',
        display: 'block',
        width: '0',
        height: '0',
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: '5px solid var(--text2)',
        transition: 'transform 0.15s ease',
    },
    // Points right when collapsed
    '.cm-task-fold-collapsed::after': {
        borderLeft: '5px solid var(--text2)',
        borderRight: '0',
        borderTop: '4px solid transparent',
        borderBottom: '4px solid transparent',
    },
    '.cm-task-fold-placeholder': {
        display: 'inline',
        color: 'var(--accent-color, #3eb489)',
        cursor: 'pointer',
        fontSize: '0.85em',
        padding: '0 0.3em',
        borderRadius: '3px',
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 10%, transparent)',
        marginLeft: '0.25em',
    },
    '.cm-task-fold-placeholder:hover': {
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 20%, transparent)',
    },

    // ── GFM Tables ────────────────────────────────────────────────────────
    // Hidden rows: the raw delimiter + body lines collapsed to zero height
    // so only the rendered <table> widget (on line 1) is visible.
    '.cm-table-hidden-row': {
        fontSize: '0',
        lineHeight: '0',
        height: '0',
        padding: '0 !important',
        overflow: 'hidden',
    },
    '.cm-table-wrapper': {
        margin: '0.5em 0',
        maxWidth: '100%',
        borderRadius: '4px',
    },
    // Sized by the editor, not by its content: `max-content` made a wide table keep
    // its own width and scroll inside the wrapper instead of following the pane.
    '.cm-table': {
        borderCollapse: 'collapse',
        width: '100%',
        maxWidth: '100%',
        tableLayout: 'auto',
        fontSize: '1em',
        lineHeight: '1.5',
    },
    '.cm-table th, .cm-table td': {
        border: '1px solid var(--text3, #444)',
        padding: '6px 13px',
        textAlign: 'left',
        overflowWrap: 'break-word',
    },
    '.cm-table thead tr': {
        backgroundColor: 'color-mix(in srgb, var(--text2) 8%, transparent)',
    },
    '.cm-table thead th': {
        fontWeight: '600',
    },
    '.cm-table tbody tr:nth-child(even)': {
        backgroundColor: 'color-mix(in srgb, var(--text2) 4%, transparent)',
    },
    '.cm-table tbody tr:hover': {
        backgroundColor: 'color-mix(in srgb, var(--accent-color, #3eb489) 8%, transparent)',
    },
    '.cm-table code': {
        fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', Menlo, Consolas, monospace",
        fontSize: '0.875em',
        background: 'color-mix(in srgb, var(--text2) 15%, transparent)',
        padding: '0.1em 0.3em',
        borderRadius: '3px',
    },
    '.cm-table mark': {
        backgroundColor: 'color-mix(in srgb, var(--accent-color) 20%, transparent)',
        padding: '0.1em 0.2em',
        borderRadius: '3px',
        color: 'inherit',
    },
});

/**
 * CodeMirror theme for standalone code files (non-markdown).
 * Shows line numbers and a monospace font throughout.
 */
export const phyllaCodeEditorTheme = EditorView.theme({
    '&': {
        flex: '1',
        height: '100%',
        fontSize: '0.875rem',
        fontFamily: "'SF Mono', Monaco, Inconsolata, 'Fira Code', Menlo, Consolas, monospace",
        lineHeight: '1.6',
        color: 'var(--text1)',
        backgroundColor: 'transparent',
    },
    '&.cm-focused': {
        outline: 'none',
    },
    '.cm-scroller': {
        overflow: 'auto',
        padding: '1rem 0',
        fontFamily: 'inherit',
    },
    '.cm-content': {
        caretColor: 'var(--accent-color, #3eb489)',
        padding: '0 1rem',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--accent-color, #3eb489)',
        borderLeftWidth: '2px',
    },
    '.cm-selectionBackground': {
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 25%, transparent) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
        background: 'color-mix(in srgb, var(--accent-color, #3eb489) 30%, transparent) !important',
    },
    '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--text2) 5%, transparent)',
    },
    '.cm-placeholder': {
        color: 'var(--text2)',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: '1px solid color-mix(in srgb, var(--text3) 40%, transparent)',
        color: 'var(--text3)',
        minWidth: '3em',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 0.5em 0 0.75em',
        minWidth: '2em',
        textAlign: 'right',
        fontSize: '0.85em',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'color-mix(in srgb, var(--text2) 5%, transparent)',
        color: 'var(--text1)',
    },
    '.cm-foldGutter': {
        width: '1em',
    },
});
