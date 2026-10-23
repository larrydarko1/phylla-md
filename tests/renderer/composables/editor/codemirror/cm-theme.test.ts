import { describe, it, expect } from 'vitest';

import { phyllaEditorTheme, phyllaCodeEditorTheme } from '@/renderer/composables/editor/codemirror/cm-theme';

describe('cm-theme exports', () => {
    it('phyllaEditorTheme is a defined CodeMirror extension', () => {
        expect(phyllaEditorTheme).toBeDefined();
    });

    it('phyllaCodeEditorTheme is a defined CodeMirror extension', () => {
        expect(phyllaCodeEditorTheme).toBeDefined();
    });

    it('the two themes are distinct objects', () => {
        expect(phyllaEditorTheme).not.toBe(phyllaCodeEditorTheme);
    });
});
