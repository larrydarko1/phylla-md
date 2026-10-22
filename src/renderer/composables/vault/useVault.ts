/**
 * useVault — core vault state management, including folder tree, file watcher
 * registration, and workspace path tracking via IPC.
 */

import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';

import { notify } from '@/renderer/composables/ui/useNotifications';
import { i18n } from '@/renderer/i18n';
import { formatIpcError } from '@/renderer/utils/ipcError';
import type { FileInfo, FolderInfo } from '@/schemas/vault';

type MovedFile = { from: string; to: string };

type UseVaultReturn = {
    // State
    currentFolder: Ref<string | null>;
    files: ShallowRef<FileInfo[]>;
    folders: ShallowRef<FolderInfo[]>;
    // Folder lifecycle
    openFolderDialog: () => Promise<string | null>;
    loadVault: () => Promise<{ files: FileInfo[]; folders: FolderInfo[] } | null>;
    refreshFiles: () => Promise<void>;
    closeVault: () => void;
    // FS watcher callback
    setExternalChangeCallback: (cb: () => void) => void;
    // File CRUD
    createFile: () => Promise<FileInfo | null>;
    createDrawing: () => Promise<FileInfo | null>;
    createFolder: () => Promise<void>;
    renameFile: (file: FileInfo, newBaseName: string) => Promise<FileInfo | null>;
    renameFolder: (relativePath: string, newName: string) => Promise<string | null>;
    deleteFile: (filesToDelete: FileInfo[]) => Promise<void>;
    deleteFolder: (relativePath: string) => Promise<boolean>;
    moveFiles: (filePaths: string[], targetRelativePath: string) => Promise<MovedFile[]>;
    moveFolder: (relativePath: string, targetRelativePath: string) => Promise<string | null>;
};

const { t } = i18n.global;

export function useVault(): UseVaultReturn {
    const currentFolder = ref<string | null>(null);
    const files = shallowRef<FileInfo[]>([]);
    const folders = shallowRef<FolderInfo[]>([]);

    // --- FS watcher ---
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    type RefreshCallback = () => void;
    let onExternalChange: RefreshCallback | null = null;

    function setExternalChangeCallback(cb: RefreshCallback): void {
        onExternalChange = cb;
    }

    async function startFolderWatcher(): Promise<void> {
        try {
            window.electronAPI.removeFsChangedListener();
            window.electronAPI.onFsChanged((): void => {
                if (debounceTimer != null) clearTimeout(debounceTimer);
                debounceTimer = setTimeout((): void => {
                    onExternalChange?.();
                }, 500);
            });
            await window.electronAPI.watchFolder();
        } catch (err) {
            window.electronAPI.log.error('Failed to start folder watcher:', err);
        }
    }

    async function stopFolderWatcher(): Promise<void> {
        if (debounceTimer != null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        window.electronAPI.removeFsChangedListener();
        await window.electronAPI.unwatchFolder();
    }

    // --- Core folder operations ---
    async function scanFolder(): Promise<{ root: string; files: FileInfo[]; folders: FolderInfo[] } | null> {
        const result = await window.electronAPI.scanFolder();
        if (result.success && result.root != null && result.root !== '') {
            return { root: result.root, files: result.files, folders: result.folders };
        }
        return null;
    }

    async function loadVault(): Promise<{ files: FileInfo[]; folders: FolderInfo[] } | null> {
        const scanned = await scanFolder();
        if (scanned === null) {
            currentFolder.value = null;
            files.value = [];
            folders.value = [];
            return null;
        }
        currentFolder.value = scanned.root;
        files.value = scanned.files;
        folders.value = scanned.folders;
        void startFolderWatcher();
        return { files: scanned.files, folders: scanned.folders };
    }

    async function refreshFiles(): Promise<void> {
        if (currentFolder.value === null || currentFolder.value === '') return;
        const scanned = await scanFolder();
        if (scanned !== null) {
            files.value = scanned.files;
            folders.value = scanned.folders;
        }
    }

    async function openFolderDialog(): Promise<string | null> {
        try {
            const folderPath = await window.electronAPI.openFolderDialog();
            if (folderPath !== null && folderPath !== '') {
                await loadVault();
                return currentFolder.value;
            }
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error selecting folder:', error);
            return null;
        }
    }

    function closeVault(): void {
        void stopFolderWatcher();
        void window.electronAPI.closeVault();
        currentFolder.value = null;
        files.value = [];
        folders.value = [];
        localStorage.removeItem('phylla-last-selected-file');
    }

    // --- File CRUD ---
    async function createFile(): Promise<FileInfo | null> {
        if (currentFolder.value === null || currentFolder.value === '') return null;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `note-${timestamp}.md`;
        try {
            const result = await window.electronAPI.createFile(currentFolder.value, fileName);
            if (result.success && result.path !== undefined && result.path !== '') {
                await refreshFiles();
                return files.value.find((f): boolean => f.path === result.path) ?? null;
            }
            notify.error(t('errors.create_file_failed', { reason: formatIpcError(t, result.error) }));
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error creating file:', error);
            notify.error(t('errors.create_file_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return null;
        }
    }

    async function createDrawing(): Promise<FileInfo | null> {
        if (currentFolder.value === null || currentFolder.value === '') return null;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `drawing-${timestamp}.drawing`;
        const emptyDrawing = JSON.stringify({ version: 1, strokes: [], backgroundColor: '#1a1a1a' }, null, 2);
        try {
            const result = await window.electronAPI.createFile(currentFolder.value, fileName);
            if (result.success && result.path !== undefined && result.path !== '') {
                await window.electronAPI.writeFile(result.path, emptyDrawing);
                await refreshFiles();
                return files.value.find((f): boolean => f.path === result.path) ?? null;
            }
            notify.error(t('errors.create_drawing_failed', { reason: formatIpcError(t, result.error) }));
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error creating drawing:', error);
            notify.error(t('errors.create_drawing_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return null;
        }
    }

    async function createFolder(): Promise<void> {
        if (currentFolder.value === null || currentFolder.value === '') return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const folderName = `folder-${timestamp}`;
        try {
            const result = await window.electronAPI.createFolder(currentFolder.value, folderName);
            if (result.success) {
                await refreshFiles();
            } else {
                window.electronAPI.log.error('Failed to create folder:', result.error);
                notify.error(t('errors.create_folder_failed', { reason: formatIpcError(t, result.error) }));
            }
        } catch (error) {
            window.electronAPI.log.error('Error creating folder:', error);
            notify.error(t('errors.create_folder_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
        }
    }

    async function renameFile(file: FileInfo, newBaseName: string): Promise<FileInfo | null> {
        const oldFileName = file.name;
        const extension = file.name.substring(file.name.lastIndexOf('.'));
        const newFileName = newBaseName + extension;
        try {
            const result = await window.electronAPI.renameFile(file.path, newFileName);
            if (result.success && result.newPath !== undefined && result.newPath !== '') {
                // Cascade: update ![[embed]] references in all md files
                if (oldFileName !== newFileName) {
                    window.electronAPI
                        .updateEmbedRefs(oldFileName, newFileName)
                        .catch((err: unknown): void =>
                            window.electronAPI.log.error('Failed to update embed references:', err),
                        );
                }
                await refreshFiles();
                return files.value.find((f): boolean => f.path === result.newPath) ?? null;
            }
            notify.error(t('errors.rename_file_failed', { reason: formatIpcError(t, result.error) }));
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error renaming file:', error);
            notify.error(t('errors.rename_file_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return null;
        }
    }

    async function renameFolder(relativePath: string, newName: string): Promise<string | null> {
        if (currentFolder.value === null || currentFolder.value === '') return null;
        const absolutePath = `${currentFolder.value}/${relativePath}`;
        try {
            const result = await window.electronAPI.renameFolder(absolutePath, newName);
            if (result.success && result.newPath !== undefined && result.newPath !== '') {
                await refreshFiles();
                const parentPath = relativePath.includes('/')
                    ? relativePath.substring(0, relativePath.lastIndexOf('/'))
                    : '';
                return parentPath !== '' ? `${parentPath}/${newName}` : newName;
            }
            notify.error(t('errors.rename_folder_failed', { reason: formatIpcError(t, result.error) }));
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error renaming folder:', error);
            notify.error(t('errors.rename_folder_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return null;
        }
    }

    async function deleteFile(filesToDelete: FileInfo[]): Promise<void> {
        for (const file of filesToDelete) {
            try {
                const result = await window.electronAPI.deleteFile(file.path);
                if (!result.success) {
                    notify.error(
                        t('errors.delete_file_failed', { name: file.name, reason: formatIpcError(t, result.error) }),
                    );
                }
            } catch (error) {
                window.electronAPI.log.error('Error deleting file:', error);
                notify.error(t('errors.delete_file_failed', { name: file.name, reason: formatIpcError(t, 'UNKNOWN') }));
            }
        }
        await refreshFiles();
    }

    async function deleteFolder(relativePath: string): Promise<boolean> {
        if (currentFolder.value === null || currentFolder.value === '') return false;
        const absolutePath = `${currentFolder.value}/${relativePath}`;
        try {
            const result = await window.electronAPI.deleteFolder(absolutePath);
            if (result.success) {
                await refreshFiles();
                return true;
            }
            notify.error(t('errors.delete_folder_failed', { reason: formatIpcError(t, result.error) }));
            return false;
        } catch (error) {
            window.electronAPI.log.error('Error deleting folder:', error);
            notify.error(t('errors.delete_folder_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return false;
        }
    }

    async function moveFiles(filePaths: string[], targetRelativePath: string): Promise<MovedFile[]> {
        if (currentFolder.value === null || currentFolder.value === '') return [];
        const absoluteTarget =
            targetRelativePath === '.' || targetRelativePath === ''
                ? currentFolder.value
                : `${currentFolder.value}/${targetRelativePath}`;
        const movedFiles: MovedFile[] = [];
        for (const path of filePaths) {
            const name = path.split('/').pop() ?? path;
            try {
                const result = await window.electronAPI.moveFile(path, absoluteTarget);
                if (result.success && result.newPath !== undefined && result.newPath !== '') {
                    movedFiles.push({ from: path, to: result.newPath });
                } else if (result.error !== undefined && result.error !== 'NOT_FOUND') {
                    notify.error(t('errors.move_file_failed', { name, reason: formatIpcError(t, result.error) }));
                }
            } catch (error) {
                window.electronAPI.log.error('Error moving file:', error);
                notify.error(t('errors.move_file_failed', { name, reason: formatIpcError(t, 'UNKNOWN') }));
            }
        }
        if (movedFiles.length > 0) await refreshFiles();
        return movedFiles;
    }

    /** Returns the folder's new vault-relative path, or null if the move failed. */
    async function moveFolder(relativePath: string, targetRelativePath: string): Promise<string | null> {
        if (currentFolder.value === null || currentFolder.value === '') return null;
        const absolutePath = `${currentFolder.value}/${relativePath}`;
        const isVaultRoot = targetRelativePath === '.' || targetRelativePath === '';
        const absoluteTarget = isVaultRoot ? currentFolder.value : `${currentFolder.value}/${targetRelativePath}`;
        try {
            const result = await window.electronAPI.moveFolder(absolutePath, absoluteTarget);
            if (result.success) {
                await refreshFiles();
                const folderName = relativePath.substring(relativePath.lastIndexOf('/') + 1);
                return isVaultRoot ? folderName : `${targetRelativePath}/${folderName}`;
            }
            notify.error(t('errors.move_folder_failed', { reason: formatIpcError(t, result.error) }));
            return null;
        } catch (error) {
            window.electronAPI.log.error('Error moving folder:', error);
            notify.error(t('errors.move_folder_failed', { reason: formatIpcError(t, 'UNKNOWN') }));
            return null;
        }
    }

    return {
        // State
        currentFolder,
        files,
        folders,
        // Folder lifecycle
        openFolderDialog,
        loadVault,
        refreshFiles,
        closeVault,
        // FS watcher callback
        setExternalChangeCallback,
        // File CRUD
        createFile,
        createDrawing,
        createFolder,
        renameFile,
        renameFolder,
        deleteFile,
        deleteFolder,
        moveFiles,
        moveFolder,
    };
}
