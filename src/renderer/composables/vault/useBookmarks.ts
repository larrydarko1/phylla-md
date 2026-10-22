/**
 * useBookmarks — persists per-vault file bookmarks in <vault>/.phylla/bookmarks.json.
 */

import { ref, type Ref } from 'vue';

type UseBookmarksReturn = {
    bookmarkedFiles: Ref<string[]>;
    loadBookmarks: () => Promise<void>;
    toggleBookmark: (filePath: string) => void;
    removeBookmark: (filePath: string) => void;
    relocateBookmark: (oldPath: string, newPath: string) => void;
};

export function useBookmarks(_getCurrentFolder: () => string | null): UseBookmarksReturn {
    const bookmarkedFiles = ref<string[]>([]);

    async function load(): Promise<void> {
        try {
            const result = await window.electronAPI.bookmarksLoad();
            bookmarkedFiles.value = result.success && result.bookmarks !== undefined ? result.bookmarks : [];
        } catch {
            bookmarkedFiles.value = [];
        }
    }

    async function save(): Promise<void> {
        try {
            await window.electronAPI.bookmarksSave([...bookmarkedFiles.value]);
        } catch {
            // Best-effort — don't surface save errors to the user
        }
    }

    function toggle(filePath: string): void {
        const index = bookmarkedFiles.value.indexOf(filePath);
        if (index >= 0) {
            bookmarkedFiles.value.splice(index, 1);
        } else {
            bookmarkedFiles.value.push(filePath);
        }
        void save();
    }

    function remove(filePath: string): void {
        const index = bookmarkedFiles.value.indexOf(filePath);
        if (index >= 0) {
            bookmarkedFiles.value.splice(index, 1);
            void save();
        }
    }

    /**
     * Follows a file or folder to its new location: rewrites the bookmark for
     * `oldPath` itself and for anything beneath it (so moving/renaming a folder
     * carries the bookmarks of the files it contains).
     */
    function relocate(oldPath: string, newPath: string): void {
        const descendantPrefix = `${oldPath}/`;

        let changed = false;
        const updated: string[] = [];
        for (const bookmark of bookmarkedFiles.value) {
            let next = bookmark;
            if (bookmark === oldPath) {
                next = newPath;
            } else if (bookmark.startsWith(descendantPrefix)) {
                next = newPath + bookmark.slice(oldPath.length);
            }
            if (next !== bookmark) changed = true;
            if (!updated.includes(next)) updated.push(next);
        }

        if (changed) {
            bookmarkedFiles.value = updated;
            void save();
        }
    }

    return {
        bookmarkedFiles,
        loadBookmarks: load,
        toggleBookmark: toggle,
        removeBookmark: remove,
        relocateBookmark: relocate,
    };
}
