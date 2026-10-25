import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useFileSelection } from '@/renderer/composables/vault/useFileSelection';
import type { FileInfo } from '@/schemas/vault';

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string): string | null => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

function makeFile(name: string, path = `/${name}`): FileInfo {
    return { name, path, relativePath: name, extension: '.md', size: 0, modified: '', folder: '.' };
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('useFileSelection', () => {
    let sel: ReturnType<typeof useFileSelection>;
    const fileA = makeFile('a.md');
    const fileB = makeFile('b.md');
    const fileC = makeFile('c.md');

    beforeEach(() => {
        sel = useFileSelection();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts with no selected files', () => {
            expect(sel.selectedFiles.value).toHaveLength(0);
        });

        it('starts with a null active file', () => {
            expect(sel.activeFile.value).toBeNull();
        });

        it('starts with a null selected folder', () => {
            expect(sel.selectedFolder.value).toBeNull();
        });
    });

    describe('selectFile (plain click)', () => {
        it('selects the clicked file', () => {
            sel.selectFile(fileA);
            expect(sel.selectedFiles.value).toHaveLength(1);
            expect(sel.selectedFiles.value[0]!.path).toBe(fileA.path);
            expect(sel.activeFile.value?.path).toBe(fileA.path);
        });

        it('replaces any previous selection', () => {
            sel.selectFile(fileA);
            sel.selectFile(fileB);
            expect(sel.selectedFiles.value).toEqual([fileB]);
        });

        it('stores the active file path in localStorage', () => {
            sel.selectFile(fileA);
            expect(localStorageMock.setItem).toHaveBeenCalledWith('phylla-last-selected-file', fileA.path);
        });

        it('clears the selected folder', () => {
            sel.selectFolder('/docs');
            sel.selectFile(fileA);
            expect(sel.selectedFolder.value).toBeNull();
        });
    });

    describe('selectFile (meta/ctrl click)', () => {
        it('adds the file to an existing selection', () => {
            sel.selectFile(fileA);
            sel.selectFile(fileB, { event: new MouseEvent('click', { metaKey: true }) });
            const paths = sel.selectedFiles.value.map((f) => f.path);
            expect(paths).toContain(fileA.path);
            expect(paths).toContain(fileB.path);
        });

        it('removes the file from the selection when it is already selected', () => {
            sel.selectFile(fileA);
            sel.selectFile(fileA, { event: new MouseEvent('click', { metaKey: true }) });
            expect(sel.selectedFiles.value).not.toContain(fileA);
        });

        it('updates activeFile to the first remaining file after deselection', () => {
            sel.selectFile(fileA);
            sel.selectFile(fileB, { event: new MouseEvent('click', { metaKey: true }) });
            sel.selectFile(fileA, { event: new MouseEvent('click', { metaKey: true }) });
            expect(sel.activeFile.value?.path).toBe(fileB.path);
        });

        it('works with ctrlKey as well as metaKey', () => {
            sel.selectFile(fileA);
            sel.selectFile(fileB, { event: new MouseEvent('click', { ctrlKey: true }) });
            expect(sel.selectedFiles.value).toHaveLength(2);
        });
    });

    describe('selectFile (shift click)', () => {
        it('selects a contiguous range between the anchor and the clicked file', () => {
            const visibleFiles = [fileA, fileB, fileC];
            sel.selectFile(fileA, { visibleFiles });
            sel.selectFile(fileC, { event: new MouseEvent('click', { shiftKey: true }), visibleFiles });
            expect(sel.selectedFiles.value).toHaveLength(3);
        });

        it('works when the range is reversed (click on an earlier item)', () => {
            const visibleFiles = [fileA, fileB, fileC];
            sel.selectFile(fileC, { visibleFiles });
            sel.selectFile(fileA, { event: new MouseEvent('click', { shiftKey: true }), visibleFiles });
            expect(sel.selectedFiles.value).toHaveLength(3);
        });

        it('falls back to plain selection when lastSelectedIndex is -1', () => {
            sel.selectFile(fileB, {
                event: new MouseEvent('click', { shiftKey: true }),
                visibleFiles: [fileA, fileB, fileC],
            });
            expect(sel.selectedFiles.value).toEqual([fileB]);
        });
    });

    describe('selectFolder', () => {
        it('sets the selected folder', () => {
            sel.selectFolder('/docs');
            expect(sel.selectedFolder.value).toBe('/docs');
        });

        it('clears any file selection', () => {
            sel.selectFile(fileA);
            sel.selectFolder('/docs');
            expect(sel.selectedFiles.value).toHaveLength(0);
            expect(sel.activeFile.value).toBeNull();
        });
    });

    describe('openFile', () => {
        it('sets the active file', () => {
            sel.openFile(fileA);
            expect(sel.activeFile.value?.path).toBe(fileA.path);
        });

        it('stores the path in localStorage', () => {
            sel.openFile(fileA);
            expect(localStorageMock.setItem).toHaveBeenCalledWith('phylla-last-selected-file', fileA.path);
        });

        it('clears the selected folder', () => {
            sel.selectFolder('/docs');
            sel.openFile(fileA);
            expect(sel.selectedFolder.value).toBeNull();
        });
    });

    describe('clearSelection', () => {
        it('clears selected files, active file, and lastSelectedIndex', () => {
            sel.selectFile(fileA);
            sel.clearSelection();
            expect(sel.selectedFiles.value).toHaveLength(0);
            expect(sel.activeFile.value).toBeNull();
        });

        it('resets the shift-click anchor so subsequent shift clicks work from scratch', () => {
            const files = [fileA, fileB, fileC];
            sel.selectFile(fileA, { visibleFiles: files });
            sel.clearSelection();
            sel.selectFile(fileC, { event: new MouseEvent('click', { shiftKey: true }), visibleFiles: files });
            expect(sel.selectedFiles.value).toEqual([fileC]);
        });
    });

    describe('syncAfterRefresh', () => {
        it('returns null when no files are currently selected', () => {
            expect(sel.syncAfterRefresh([fileA])).toBeNull();
        });

        it('keeps files that are still present in the updated vault listing', () => {
            sel.selectFile(fileA);
            const updatedA = { ...fileA, size: 100 };
            const result = sel.syncAfterRefresh([updatedA, fileB]);
            expect(result?.path).toBe(fileA.path);
        });

        it('re-uses updated FileInfo objects (not stale ones)', () => {
            sel.selectFile(fileA);
            const updatedA = { ...fileA, size: 999 };
            sel.syncAfterRefresh([updatedA]);
            expect(sel.selectedFiles.value[0]!.size).toBe(999);
        });

        it('clears the selection when none of the previously selected files exist', () => {
            sel.selectFile(fileA);
            const result = sel.syncAfterRefresh([fileB, fileC]);
            expect(result).toBeNull();
            expect(sel.selectedFiles.value).toHaveLength(0);
        });

        it('restores the active file to the updated FileInfo object', () => {
            sel.selectFile(fileA);
            const updatedA = { ...fileA, modified: 'now' };
            sel.syncAfterRefresh([updatedA]);
            expect(sel.activeFile.value?.modified).toBe('now');
        });
    });

    describe('restoreFromStorage', () => {
        it('restores the last selected file from localStorage', () => {
            localStorageMock.getItem.mockReturnValueOnce(fileB.path);
            sel.restoreFromStorage([fileA, fileB, fileC]);
            expect(sel.activeFile.value?.path).toBe(fileB.path);
        });

        it('leaves the selection empty when the stored path is not found', () => {
            localStorageMock.getItem.mockReturnValueOnce('/not-found.md');
            sel.restoreFromStorage([fileA, fileB]);
            expect(sel.activeFile.value).toBeNull();
            expect(sel.selectedFiles.value).toEqual([]);
        });

        it('leaves the selection empty when localStorage has no entry', () => {
            localStorageMock.getItem.mockReturnValueOnce(null);
            sel.restoreFromStorage([fileA, fileB]);
            expect(sel.activeFile.value).toBeNull();
            expect(sel.selectedFiles.value).toEqual([]);
        });

        it('does nothing when no files are available', () => {
            localStorageMock.getItem.mockReturnValueOnce(null);
            sel.restoreFromStorage([]);
            expect(sel.activeFile.value).toBeNull();
        });
    });
});
