import { assert, describe, it, expect, vi, beforeEach } from 'vitest';

import { useNotifications } from '@/renderer/composables/ui/useNotifications';
import { useVault } from '@/renderer/composables/vault/useVault';
import type { ElectronAPI } from '@/schemas/electron';
import type { FileInfo, FolderInfo } from '@/schemas/vault';

const mockAPI = {
    scanFolder: vi.fn(),
    watchFolder: vi.fn(),
    unwatchFolder: vi.fn(),
    onFsChanged: vi.fn<ElectronAPI['onFsChanged']>(),
    removeFsChangedListener: vi.fn(),
    openFolderDialog: vi.fn(),
    closeVault: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    renameFile: vi.fn(),
    renameFolder: vi.fn(),
    deleteFile: vi.fn(),
    deleteFolder: vi.fn(),
    moveFile: vi.fn(),
    moveFolder: vi.fn(),
    writeFile: vi.fn(),
    updateEmbedRefs: vi.fn().mockResolvedValue(undefined),
    log: { error: vi.fn(), warn: vi.fn() },
};

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
    };
})();

const { notifications, dismiss } = useNotifications();

function makeFile(name: string, folder = '.'): FileInfo {
    return { name, path: `/vault/${name}`, relativePath: name, extension: '.md', size: 0, modified: '', folder };
}

function makeFolder(name: string): FolderInfo {
    return { name, path: `/vault/${name}`, relativePath: name, type: 'folder', folder: '.' };
}

Object.defineProperty(window, 'electronAPI', {
    value: mockAPI,
    writable: true,
    configurable: true,
});

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('useVault', () => {
    let vault: ReturnType<typeof useVault>;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.clear();
        for (const n of [...notifications.value]) dismiss(n.id);
        mockAPI.watchFolder.mockResolvedValue({ success: true });
        mockAPI.unwatchFolder.mockResolvedValue({ success: true });
        vault = useVault();
    });

    describe('initial state', () => {
        it('currentFolder is null', () => {
            expect(vault.currentFolder.value).toBeNull();
        });

        it('files is empty', () => {
            expect(vault.files.value).toHaveLength(0);
        });

        it('folders is empty', () => {
            expect(vault.folders.value).toHaveLength(0);
        });
    });

    describe('loadVault', () => {
        it('populates currentFolder, files, and folders on success', async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [makeFile('a.md')],
                folders: [makeFolder('docs')],
            });
            await vault.loadVault();
            expect(vault.currentFolder.value).toBe('/vault');
            expect(vault.files.value).toHaveLength(1);
            expect(vault.folders.value).toHaveLength(1);
        });

        it('adopts the root reported by the main process, not one of its own', async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/somewhere/else',
                files: [],
                folders: [],
            });
            await vault.loadVault();
            expect(mockAPI.scanFolder).toHaveBeenCalledWith();
            expect(vault.currentFolder.value).toBe('/somewhere/else');
        });

        it('returns null and stays closed when no vault is open', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: false, error: 'No vault is open.' });
            const result = await vault.loadVault();
            expect(result).toBeNull();
            expect(vault.currentFolder.value).toBeNull();
            expect(vault.files.value).toHaveLength(0);
        });

        it('does not notify when there is simply no vault to restore', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: false, error: 'No vault is open.' });
            await vault.loadVault();
            expect(notifications.value).toEqual([]);
        });

        it('starts the folder watcher after loading', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
            expect(mockAPI.watchFolder).toHaveBeenCalledWith();
        });
    });

    describe('refreshFiles', () => {
        it('is a no-op when no vault is open', async () => {
            await vault.refreshFiles();
            expect(mockAPI.scanFolder).not.toHaveBeenCalled();
        });

        it('re-scans and updates files/folders', async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [makeFile('a.md')],
                folders: [],
            });
            await vault.loadVault();

            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [makeFile('b.md')],
                folders: [],
            });
            await vault.refreshFiles();
            expect(vault.files.value[0]!.name).toBe('b.md');
        });
    });

    describe('closeVault', () => {
        it('clears all vault state', async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [makeFile('a.md')],
                folders: [],
            });
            await vault.loadVault();
            vault.closeVault();
            expect(vault.currentFolder.value).toBeNull();
            expect(vault.files.value).toHaveLength(0);
            expect(vault.folders.value).toHaveLength(0);
        });

        it('tells the main process to forget the vault', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
            vault.closeVault();
            expect(mockAPI.closeVault).toHaveBeenCalled();
        });

        it('clears the remembered file selection', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
            vault.closeVault();
            expect(localStorageMock.removeItem).toHaveBeenCalledWith('phylla-last-selected-file');
        });
    });

    describe('openFolderDialog', () => {
        it('loads the selected folder and returns the path', async () => {
            mockAPI.openFolderDialog.mockResolvedValue('/selected/vault');
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/selected/vault', files: [], folders: [] });
            const result = await vault.openFolderDialog();
            expect(result).toBe('/selected/vault');
            expect(vault.currentFolder.value).toBe('/selected/vault');
        });

        it('returns null when the dialog is cancelled (no path returned)', async () => {
            mockAPI.openFolderDialog.mockResolvedValue(null);
            const result = await vault.openFolderDialog();
            expect(result).toBeNull();
        });

        it('handles IPC rejections gracefully', async () => {
            mockAPI.openFolderDialog.mockRejectedValue(new Error('dialog error'));
            const result = await vault.openFolderDialog();
            expect(result).toBeNull();
        });
    });

    describe('createFile', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
        });

        it('returns null when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.createFile();
            expect(result).toBeNull();
        });

        it('returns null and shows an error notification when creation fails', async () => {
            mockAPI.createFile.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            const result = await vault.createFile();
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });

        it('refreshes the file list and returns the new FileInfo on success', async () => {
            const newFile = makeFile('note-2024.md');
            mockAPI.createFile.mockResolvedValue({ success: true, path: newFile.path });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [newFile], folders: [] });
            const result = await vault.createFile();
            expect(result?.path).toBe(newFile.path);
        });
    });

    describe('renameFile', () => {
        const existingFile = makeFile('old.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [existingFile], folders: [] });
            await vault.loadVault();
        });

        it('returns the renamed FileInfo on success', async () => {
            const renamedFile = makeFile('new.md');
            mockAPI.renameFile.mockResolvedValue({ success: true, newPath: renamedFile.path });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [renamedFile], folders: [] });
            const result = await vault.renameFile(existingFile, 'new');
            expect(result?.path).toBe(renamedFile.path);
        });

        it('returns null and shows an error notification on failure', async () => {
            mockAPI.renameFile.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            const result = await vault.renameFile(existingFile, 'new');
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('deleteFile', () => {
        const file = makeFile('to-delete.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [file], folders: [] });
            await vault.loadVault();
        });

        it('calls the IPC delete handler for each file', async () => {
            mockAPI.deleteFile.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.deleteFile([file]);
            expect(mockAPI.deleteFile).toHaveBeenCalledWith(file.path);
        });

        it('shows an error notification when deletion fails', async () => {
            mockAPI.deleteFile.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [file], folders: [] });
            await vault.deleteFile([file]);
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('moveFiles', () => {
        const file = makeFile('note.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [file], folders: [] });
            await vault.loadVault();
        });

        it('returns an empty array when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.moveFiles([file.path], 'docs');
            expect(result).toHaveLength(0);
        });

        it('returns from/to pairs on success', async () => {
            mockAPI.moveFile.mockResolvedValue({ success: true, newPath: '/vault/docs/note.md' });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.moveFiles([file.path], 'docs');
            expect(result).toEqual([{ from: file.path, to: '/vault/docs/note.md' }]);
        });

        it('does not throw when the IPC call rejects', async () => {
            mockAPI.moveFile.mockRejectedValue(new Error('IPC error'));
            await expect(vault.moveFiles([file.path], 'docs')).resolves.not.toThrow();
        });
    });

    describe('createDrawing', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
        });

        it('returns null when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.createDrawing();
            expect(result).toBeNull();
        });

        it('returns the new drawing FileInfo on success', async () => {
            const newFile = makeFile('drawing-2024.drawing');
            mockAPI.createFile.mockResolvedValue({ success: true, path: newFile.path });
            mockAPI.writeFile.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [newFile], folders: [] });
            const result = await vault.createDrawing();
            expect(result?.path).toBe(newFile.path);
        });

        it('shows an error notification and returns null when createFile fails', async () => {
            mockAPI.createFile.mockResolvedValue({ success: false, error: 'DISK_FULL' });
            const result = await vault.createDrawing();
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });

        it('shows an error notification and returns null on IPC rejection', async () => {
            mockAPI.createFile.mockRejectedValue(new Error('IPC error'));
            const result = await vault.createDrawing();
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('createFolder', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();
        });

        it('returns early when no vault is open', async () => {
            vault.closeVault();
            await vault.createFolder();
            expect(mockAPI.createFolder).not.toHaveBeenCalled();
        });

        it('refreshes file list on success', async () => {
            mockAPI.createFolder.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [],
                folders: [makeFolder('new-folder')],
            });
            await vault.createFolder();
            expect(vault.folders.value).toHaveLength(1);
        });

        it('logs and shows an error notification when createFolder fails', async () => {
            mockAPI.createFolder.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            await vault.createFolder();
            expect(mockAPI.log.error).toHaveBeenCalled();
            expect(notifications.value.map((n) => n.message)).toEqual(['Could not create the folder. Access denied.']);
        });

        it('shows an error notification when the IPC rejects', async () => {
            mockAPI.createFolder.mockRejectedValue(new Error('IPC error'));
            await expect(vault.createFolder()).resolves.not.toThrow();
            expect(notifications.value.map((n) => n.message)).toEqual([
                'Could not create the folder. Something went wrong.',
            ]);
        });
    });

    describe('renameFolder', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [],
                folders: [makeFolder('docs')],
            });
            await vault.loadVault();
        });

        it('returns null when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.renameFolder('docs', 'new-docs');
            expect(result).toBeNull();
        });

        it('returns the new relative path on success (top-level folder)', async () => {
            mockAPI.renameFolder.mockResolvedValue({ success: true, newPath: '/vault/new-docs' });
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [],
                folders: [makeFolder('new-docs')],
            });
            const result = await vault.renameFolder('docs', 'new-docs');
            expect(result).toBe('new-docs');
        });

        it('returns the new relative path on success (nested folder)', async () => {
            mockAPI.renameFolder.mockResolvedValue({ success: true, newPath: '/vault/parent/new-name' });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.renameFolder('parent/child', 'new-name');
            expect(result).toBe('parent/new-name');
        });

        it('shows an error notification and returns null on failure', async () => {
            mockAPI.renameFolder.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            const result = await vault.renameFolder('docs', 'new-docs');
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });

        it('shows an error notification and returns null on IPC rejection', async () => {
            mockAPI.renameFolder.mockRejectedValue(new Error('IPC error'));
            const result = await vault.renameFolder('docs', 'new-docs');
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('deleteFolder', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [],
                folders: [makeFolder('old')],
            });
            await vault.loadVault();
        });

        it('returns false when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.deleteFolder('old');
            expect(result).toBe(false);
        });

        it('returns true and refreshes on success', async () => {
            mockAPI.deleteFolder.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.deleteFolder('old');
            expect(result).toBe(true);
            expect(vault.folders.value).toHaveLength(0);
        });

        it('shows an error notification and returns false on failure', async () => {
            mockAPI.deleteFolder.mockResolvedValue({ success: false, error: 'ALREADY_EXISTS' });
            const result = await vault.deleteFolder('old');
            expect(result).toBe(false);
            expect(notifications.value).toHaveLength(1);
        });

        it('returns false on IPC rejection', async () => {
            mockAPI.deleteFolder.mockRejectedValue(new Error('IPC error'));
            const result = await vault.deleteFolder('old');
            expect(result).toBe(false);
        });
    });

    describe('moveFiles (additional)', () => {
        const file = makeFile('note.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [file], folders: [] });
            await vault.loadVault();
        });

        it('uses currentFolder as target when targetRelativePath is "."', async () => {
            mockAPI.moveFile.mockResolvedValue({ success: true, newPath: '/vault/note.md' });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.moveFiles([file.path], '.');
            expect(mockAPI.moveFile).toHaveBeenCalledWith(file.path, '/vault');
            expect(result).toEqual([{ from: file.path, to: '/vault/note.md' }]);
        });

        it('skips ENOENT errors silently', async () => {
            mockAPI.moveFile.mockResolvedValue({ success: false, error: 'NOT_FOUND' });
            const result = await vault.moveFiles([file.path], 'docs');
            expect(result).toHaveLength(0);
            expect(notifications.value).toEqual([]);
        });

        it('shows an error notification for non-ENOENT move errors', async () => {
            mockAPI.moveFile.mockResolvedValue({ success: false, error: 'ACCESS_DENIED' });
            await vault.moveFiles([file.path], 'docs');
            expect(notifications.value.map((n) => n.message)).toEqual([`Could not move ${file.name}. Access denied.`]);
        });

        it('shows an error notification when the move IPC rejects', async () => {
            mockAPI.moveFile.mockRejectedValue(new Error('IPC error'));
            await vault.moveFiles([file.path], 'docs');
            expect(notifications.value.map((n) => n.message)).toEqual([
                `Could not move ${file.name}. Something went wrong.`,
            ]);
        });
    });

    describe('moveFolder', () => {
        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({
                success: true,
                root: '/vault',
                files: [],
                folders: [makeFolder('docs')],
            });
            await vault.loadVault();
        });

        it('returns null when no vault is open', async () => {
            vault.closeVault();
            const result = await vault.moveFolder('docs', 'archive');
            expect(result).toBeNull();
        });

        it('returns the new relative path on success', async () => {
            mockAPI.moveFolder.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.moveFolder('docs', 'archive');
            expect(result).toBe('archive/docs');
        });

        it('returns the bare folder name when moved to the vault root', async () => {
            mockAPI.moveFolder.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            const result = await vault.moveFolder('archive/docs', '.');
            expect(result).toBe('docs');
        });

        it('uses currentFolder as target when targetRelativePath is "."', async () => {
            mockAPI.moveFolder.mockResolvedValue({ success: true });
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.moveFolder('docs', '.');
            expect(mockAPI.moveFolder).toHaveBeenCalledWith('/vault/docs', '/vault');
        });

        it('shows an error notification and returns null on failure', async () => {
            mockAPI.moveFolder.mockResolvedValue({ success: false, error: 'DISK_FULL' });
            const result = await vault.moveFolder('docs', 'archive');
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });

        it('returns null on IPC rejection', async () => {
            mockAPI.moveFolder.mockRejectedValue(new Error('IPC error'));
            const result = await vault.moveFolder('docs', 'archive');
            expect(result).toBeNull();
        });
    });

    describe('renameFile (error paths)', () => {
        const existingFile = makeFile('old.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [existingFile], folders: [] });
            await vault.loadVault();
        });

        it('shows an error notification and returns null on IPC rejection', async () => {
            mockAPI.renameFile.mockRejectedValue(new Error('IPC error'));
            const result = await vault.renameFile(existingFile, 'new');
            expect(result).toBeNull();
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('deleteFile (error paths)', () => {
        const file = makeFile('to-delete.md');

        beforeEach(async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [file], folders: [] });
            await vault.loadVault();
        });

        it('shows an error notification and continues on IPC rejection', async () => {
            mockAPI.deleteFile.mockRejectedValue(new Error('IPC error'));
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.deleteFile([file]);
            expect(notifications.value).toHaveLength(1);
        });
    });

    describe('setExternalChangeCallback', () => {
        it('registers a callback that is invoked when the FS watcher fires', async () => {
            mockAPI.scanFolder.mockResolvedValue({ success: true, root: '/vault', files: [], folders: [] });
            await vault.loadVault();

            const onChange = vi.fn();
            vault.setExternalChangeCallback(onChange);

            const fsChangedCallback = mockAPI.onFsChanged.mock.calls[0]?.[0];
            assert.exists(fsChangedCallback);
            fsChangedCallback({ eventType: 'change', filename: 'note.md' });
            vi.useFakeTimers();
            vi.advanceTimersByTime(600);
            vi.useRealTimers();

            expect(typeof onChange).toBe('function');
        });
    });
});
