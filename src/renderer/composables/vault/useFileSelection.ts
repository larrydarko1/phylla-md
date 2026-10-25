/**
 * useFileSelection — tracks the active file and multi-select state in the vault.
 */

import { ref, type Ref } from 'vue';

import type { FileInfo } from '@/schemas/vault';

type UseFileSelectionReturn = {
    selectedFiles: Ref<FileInfo[]>;
    activeFile: Ref<FileInfo | null>;
    selectedFolder: Ref<string | null>;
    selectFile: (file: FileInfo, { event, visibleFiles }?: { event?: MouseEvent; visibleFiles?: FileInfo[] }) => void;
    selectFolder: (folderPath: string) => void;
    openFile: (file: FileInfo) => void;
    clearSelection: () => void;
    syncAfterRefresh: (availableFiles: FileInfo[]) => FileInfo | null;
    restoreFromStorage: (availableFiles: FileInfo[]) => void;
};

export function useFileSelection(): UseFileSelectionReturn {
    const selectedFiles = ref<FileInfo[]>([]);
    const activeFile = ref<FileInfo | null>(null);
    const selectedFolder = ref<string | null>(null);
    const lastSelectedIndex = ref<number>(-1);

    function selectFile(
        file: FileInfo,
        { event, visibleFiles }: { event?: MouseEvent; visibleFiles?: FileInfo[] } = {},
    ): void {
        selectedFolder.value = null;

        const fileList = visibleFiles ?? [];
        const fileIndex = fileList.findIndex((f): boolean => f.path === file.path);

        if ((event?.metaKey ?? false) || (event?.ctrlKey ?? false)) {
            const index = selectedFiles.value.findIndex((f): boolean => f.path === file.path);
            if (index >= 0) {
                selectedFiles.value.splice(index, 1);
                if (activeFile.value?.path === file.path) {
                    activeFile.value = selectedFiles.value[0] ?? null;
                }
            } else {
                selectedFiles.value.push(file);
                activeFile.value = file;
            }
            lastSelectedIndex.value = fileIndex;
        } else if ((event?.shiftKey ?? false) && lastSelectedIndex.value >= 0 && fileList.length > 0) {
            const start = Math.min(lastSelectedIndex.value, fileIndex);
            const end = Math.max(lastSelectedIndex.value, fileIndex);
            selectedFiles.value = fileList.slice(start, end + 1);
            activeFile.value = file;
        } else {
            selectedFiles.value = [file];
            activeFile.value = file;
            lastSelectedIndex.value = fileIndex;
        }

        if (activeFile.value !== null) {
            localStorage.setItem('phylla-last-selected-file', activeFile.value.path);
        }
    }

    function selectFolder(folderPath: string): void {
        selectedFolder.value = folderPath;
        selectedFiles.value = [];
        activeFile.value = null;
    }

    function openFile(file: FileInfo): void {
        selectedFiles.value = [file];
        activeFile.value = file;
        selectedFolder.value = null;
        localStorage.setItem('phylla-last-selected-file', file.path);
    }

    function clearSelection(): void {
        selectedFiles.value = [];
        activeFile.value = null;
        lastSelectedIndex.value = -1;
    }

    /**
     * After a vault refresh, try to restore previously selected files.
     * Returns the updated active file (which the caller can use to re-sync the editor).
     */
    function syncAfterRefresh(availableFiles: FileInfo[]): FileInfo | null {
        if (selectedFiles.value.length === 0) return null;
        const previousPaths = selectedFiles.value.map((f): string => f.path);
        const previousActivePath = activeFile.value?.path;

        const stillExist = availableFiles.filter((f): boolean => previousPaths.includes(f.path));
        const [firstStillExist] = stillExist;
        if (firstStillExist !== undefined) {
            selectedFiles.value = stillExist;
            if (previousActivePath !== undefined) {
                const found = stillExist.find((f): boolean => f.path === previousActivePath);
                activeFile.value = found ?? firstStillExist;
            } else {
                activeFile.value = firstStillExist;
            }
        } else {
            clearSelection();
        }
        return activeFile.value;
    }

    /**
     * Restore last selected file from localStorage after vault load.
     * If not found, leaves the selection empty.
     */
    function restoreFromStorage(availableFiles: FileInfo[]): void {
        const lastPath = localStorage.getItem('phylla-last-selected-file');
        if (lastPath !== null) {
            const lastFile = availableFiles.find((f): boolean => f.path === lastPath);
            if (lastFile !== undefined) {
                selectedFiles.value = [lastFile];
                activeFile.value = lastFile;
            }
        }
    }

    return {
        selectedFiles,
        activeFile,
        selectedFolder,
        selectFile,
        selectFolder,
        openFile,
        clearSelection,
        syncAfterRefresh,
        restoreFromStorage,
    };
}
