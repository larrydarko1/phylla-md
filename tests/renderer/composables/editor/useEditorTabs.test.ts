import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useEditorTabs } from '@/renderer/composables/editor/useEditorTabs';
import { type FileInfo, PersistedTabStateSchema } from '@/schemas/vault';

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    };
})();

function makeFile(name: string, path = `/${name}`): FileInfo {
    return {
        name,
        path,
        relativePath: name,
        extension: '.md',
        size: 0,
        modified: '',
        folder: '.',
    };
}

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('useEditorTabs', () => {
    let tabs: ReturnType<typeof useEditorTabs>;

    beforeEach(() => {
        tabs = useEditorTabs();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    describe('initial state', () => {
        it('starts with no tabs', () => {
            expect(tabs.tabs.value).toHaveLength(0);
        });

        it('starts with activeIndex -1', () => {
            expect(tabs.activeIndex.value).toBe(-1);
        });

        it('activeFile is null when no tabs', () => {
            expect(tabs.activeFile.value).toBeNull();
        });

        it('activeTab is null when no tabs', () => {
            expect(tabs.activeTab.value).toBeNull();
        });
    });

    describe('openTab', () => {
        it('adds a new tab and activates it', () => {
            const file = makeFile('note.md');
            const idx = tabs.openTab(file);
            expect(idx).toBe(0);
            expect(tabs.tabs.value).toHaveLength(1);
            expect(tabs.activeIndex.value).toBe(0);
            expect(tabs.activeFile.value?.path).toBe(file.path);
        });

        it('does not duplicate an already-open file', () => {
            const file = makeFile('note.md');
            tabs.openTab(file);
            tabs.openTab(file);
            expect(tabs.tabs.value).toHaveLength(1);
        });

        it('re-activates an existing tab when opened again', () => {
            const a = makeFile('a.md');
            const b = makeFile('b.md');
            tabs.openTab(a);
            tabs.openTab(b);
            expect(tabs.activeIndex.value).toBe(1);

            tabs.openTab(a);
            expect(tabs.activeIndex.value).toBe(0);
            expect(tabs.tabs.value).toHaveLength(2);
        });

        it('initialises a tab with null content and no unsaved changes', () => {
            tabs.openTab(makeFile('note.md'));
            const tab = tabs.activeTab.value!;
            expect(tab.content).toBeNull();
            expect(tab.savedContent).toBeNull();
            expect(tab.hasUnsavedChanges).toBe(false);
            expect(tab.scrollTop).toBe(0);
        });

        it('enforces the MAX_TABS cap', () => {
            for (let i = 0; i < tabs.MAX_TABS; i++) {
                tabs.openTab(makeFile(`file${i}.md`));
            }
            expect(tabs.tabs.value).toHaveLength(tabs.MAX_TABS);

            tabs.openTab(makeFile('overflow.md'));
            expect(tabs.tabs.value).toHaveLength(tabs.MAX_TABS);
        });

        it('replaces a non-active tab when at cap', () => {
            for (let i = 0; i < tabs.MAX_TABS; i++) {
                tabs.openTab(makeFile(`file${i}.md`));
            }
            const overflow = makeFile('overflow.md');
            tabs.openTab(overflow);
            const paths = tabs.tabs.value.map((t) => t.file.path);
            expect(paths).toContain(overflow.path);
            expect(tabs.tabs.value).toHaveLength(tabs.MAX_TABS);
        });
    });

    describe('closeTab', () => {
        it('removes the tab at the given index', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.closeTab(0);
            expect(tabs.tabs.value).toHaveLength(1);
            expect(tabs.tabs.value[0]!.file.name).toBe('b.md');
        });

        it('sets activeIndex to -1 when last tab is closed', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.closeTab(0);
            expect(tabs.tabs.value).toHaveLength(0);
            expect(tabs.activeIndex.value).toBe(-1);
            expect(tabs.activeFile.value).toBeNull();
        });

        it('activates previous tab when active tab is last and closed', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.closeTab(1);
            expect(tabs.activeIndex.value).toBe(0);
        });

        it('adjusts activeIndex down when a tab before active is closed', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.openTab(makeFile('c.md'));
            tabs.switchTab(2); // active = c.md (index 2)
            tabs.closeTab(0); // remove a.md; c.md is now at index 1
            expect(tabs.activeIndex.value).toBe(1);
            expect(tabs.activeFile.value?.name).toBe('c.md');
        });

        it('does nothing for out-of-range index', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.closeTab(5);
            expect(tabs.tabs.value).toHaveLength(1);
        });

        it('activates next tab when a middle tab is closed', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.openTab(makeFile('c.md'));
            tabs.switchTab(1); // active = b.md
            tabs.closeTab(1); // close b.md; c.md slides to index 1
            expect(tabs.activeIndex.value).toBe(1);
            expect(tabs.activeFile.value?.name).toBe('c.md');
        });
    });

    describe('switchTab', () => {
        it('changes the active tab', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.switchTab(0);
            expect(tabs.activeIndex.value).toBe(0);
            expect(tabs.activeFile.value?.name).toBe('a.md');
        });

        it('ignores out-of-range indices', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.switchTab(99);
            expect(tabs.activeIndex.value).toBe(0);
        });

        it('ignores negative indices', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.switchTab(-1);
            expect(tabs.activeIndex.value).toBe(0);
        });
    });

    describe('updateTabContent', () => {
        it('updates content and unsaved flag for matching tab', () => {
            const file = makeFile('a.md');
            tabs.openTab(file);
            tabs.updateTabContent(file.path, { content: 'hello', hasUnsavedChanges: true });
            const tab = tabs.tabs.value[0];
            expect(tab!.content).toBe('hello');
            expect(tab!.hasUnsavedChanges).toBe(true);
        });

        it('does nothing for an unknown file path', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.updateTabContent('/nonexistent.md', { content: 'x', hasUnsavedChanges: true });
            expect(tabs.tabs.value[0]!.content).toBeNull();
        });
    });

    describe('markTabSaved', () => {
        it('clears unsaved flag and updates savedContent', () => {
            const file = makeFile('a.md');
            tabs.openTab(file);
            tabs.updateTabContent(file.path, { content: 'new content', hasUnsavedChanges: true });
            tabs.markTabSaved(file.path, 'new content');
            const tab = tabs.tabs.value[0];
            expect(tab!.hasUnsavedChanges).toBe(false);
            expect(tab!.savedContent).toBe('new content');
            expect(tab!.content).toBe('new content');
        });
    });

    describe('saveScrollPosition', () => {
        it('stores the scroll position on the tab', () => {
            const file = makeFile('a.md');
            tabs.openTab(file);
            tabs.saveScrollPosition(file.path, 320);
            expect(tabs.tabs.value[0]!.scrollTop).toBe(320);
        });

        it('does nothing for an unknown path', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.saveScrollPosition('/unknown.md', 100);
            expect(tabs.tabs.value[0]!.scrollTop).toBe(0);
        });
    });

    describe('syncTabFiles', () => {
        it('removes tabs whose files no longer exist', () => {
            const a = makeFile('a.md');
            const b = makeFile('b.md');
            tabs.openTab(a);
            tabs.openTab(b);
            tabs.syncTabFiles([b]);
            expect(tabs.tabs.value).toHaveLength(1);
            expect(tabs.tabs.value[0]!.file.name).toBe('b.md');
        });

        it('updates FileInfo reference when file still exists', () => {
            const a = makeFile('a.md');
            tabs.openTab(a);
            const updated = { ...a, size: 999 };
            tabs.syncTabFiles([updated]);
            expect(tabs.tabs.value[0]!.file.size).toBe(999);
        });

        it('clamps activeIndex if it exceeds new tab count', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.openTab(makeFile('c.md'));
            tabs.switchTab(2);
            tabs.syncTabFiles([makeFile('a.md')]);
            expect(tabs.activeIndex.value).toBe(0);
        });
    });

    describe('renameTabFile', () => {
        it('updates the FileInfo on the matching tab', () => {
            const file = makeFile('old.md', '/old.md');
            tabs.openTab(file);
            const renamed = makeFile('new.md', '/new.md');
            tabs.renameTabFile('/old.md', renamed);
            expect(tabs.tabs.value[0]!.file.name).toBe('new.md');
            expect(tabs.tabs.value[0]!.file.path).toBe('/new.md');
        });

        it('does nothing for an unknown old path', () => {
            const file = makeFile('a.md', '/a.md');
            tabs.openTab(file);
            tabs.renameTabFile('/nonexistent.md', makeFile('x.md'));
            expect(tabs.tabs.value[0]!.file.name).toBe('a.md');
        });
    });

    describe('clearTabs', () => {
        it('removes all tabs and resets activeIndex', () => {
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.clearTabs();
            expect(tabs.tabs.value).toHaveLength(0);
            expect(tabs.activeIndex.value).toBe(-1);
            expect(tabs.activeFile.value).toBeNull();
        });
    });

    describe('persistence', () => {
        const FOLDER = '/my/vault';

        it('persists tabs to localStorage when a tab is opened', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            const stored = localStorage.getItem(`phylla-tabs-${FOLDER}`);
            expect(stored).toBeTruthy();
            const data = PersistedTabStateSchema.parse(JSON.parse(stored!));
            expect(data.tabs).toHaveLength(1);
            expect(data.tabs[0]?.path).toBe('/a.md');
            expect(data.activeIndex).toBe(0);
        });

        it('persists when a tab is closed', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.closeTab(0);
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.tabs).toHaveLength(1);
            expect(data.tabs[0]?.path).toBe('/b.md');
        });

        it('persists when switching tabs', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            tabs.switchTab(0);
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.activeIndex).toBe(0);
        });

        it('persists scroll position', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            tabs.saveScrollPosition('/a.md', 250);
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.tabs[0]?.scrollTop).toBe(250);
        });

        it('restores tabs from localStorage', () => {
            const files = [makeFile('a.md'), makeFile('b.md'), makeFile('c.md')];

            localStorage.setItem(
                `phylla-tabs-${FOLDER}`,
                JSON.stringify({
                    tabs: [
                        { path: '/a.md', scrollTop: 100 },
                        { path: '/c.md', scrollTop: 200 },
                    ],
                    activeIndex: 1,
                }),
            );

            const restored = tabs.restoreTabs(FOLDER, files);
            expect(restored).toBe(true);
            expect(tabs.tabs.value).toHaveLength(2);
            expect(tabs.tabs.value[0]!.file.name).toBe('a.md');
            expect(tabs.tabs.value[0]!.scrollTop).toBe(100);
            expect(tabs.tabs.value[1]!.file.name).toBe('c.md');
            expect(tabs.tabs.value[1]!.scrollTop).toBe(200);
            expect(tabs.activeIndex.value).toBe(1);
        });

        it('skips persisted tabs whose files no longer exist', () => {
            const files = [makeFile('a.md')]; // b.md is gone

            localStorage.setItem(
                `phylla-tabs-${FOLDER}`,
                JSON.stringify({
                    tabs: [
                        { path: '/a.md', scrollTop: 0 },
                        { path: '/b.md', scrollTop: 0 },
                    ],
                    activeIndex: 1,
                }),
            );

            const restored = tabs.restoreTabs(FOLDER, files);
            expect(restored).toBe(true);
            expect(tabs.tabs.value).toHaveLength(1);
            expect(tabs.tabs.value[0]!.file.name).toBe('a.md');
            expect(tabs.activeIndex.value).toBe(0);
        });

        it('returns false when no persisted state exists', () => {
            const files = [makeFile('a.md')];
            const restored = tabs.restoreTabs(FOLDER, files);
            expect(restored).toBe(false);
            expect(tabs.tabs.value).toHaveLength(0);
        });

        it('returns false when all persisted files are gone', () => {
            localStorage.setItem(
                `phylla-tabs-${FOLDER}`,
                JSON.stringify({
                    tabs: [{ path: '/gone.md', scrollTop: 0 }],
                    activeIndex: 0,
                }),
            );

            const restored = tabs.restoreTabs(FOLDER, [makeFile('a.md')]);
            expect(restored).toBe(false);
            expect(tabs.tabs.value).toHaveLength(0);
        });

        it('does not persist when folderPath is not set', () => {
            tabs.openTab(makeFile('a.md'));
            expect(localStorageMock.setItem).not.toHaveBeenCalled();
        });

        it('handles corrupted localStorage data gracefully', () => {
            localStorage.setItem(`phylla-tabs-${FOLDER}`, 'not-json');
            const restored = tabs.restoreTabs(FOLDER, [makeFile('a.md')]);
            expect(restored).toBe(false);
        });

        it('persists on rename', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('old.md', '/old.md'));
            tabs.renameTabFile('/old.md', makeFile('new.md', '/new.md'));
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.tabs[0]?.path).toBe('/new.md');
        });

        it('persists on syncTabFiles when tabs are removed', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            tabs.openTab(makeFile('b.md'));
            vi.clearAllMocks();
            tabs.syncTabFiles([makeFile('a.md')]); // b.md removed
            expect(localStorageMock.setItem).toHaveBeenCalled();
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.tabs).toHaveLength(1);
        });

        it('clearTabs persists empty state', () => {
            tabs.setFolderPath(FOLDER);
            tabs.openTab(makeFile('a.md'));
            tabs.clearTabs();
            const data = PersistedTabStateSchema.parse(JSON.parse(localStorage.getItem(`phylla-tabs-${FOLDER}`)!));
            expect(data.tabs).toHaveLength(0);
            expect(data.activeIndex).toBe(-1);
        });
    });
});
