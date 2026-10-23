import fs from 'fs';
import os from 'os';
import path from 'path';

import { BrowserWindow } from 'electron';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply, readReplyWith } from './test-utils';

const { mockState, mockTrashItem, mockShowSaveDialog, mockShowOpenDialog } = vi.hoisted(() => ({
    mockState: { current: {} as Record<string, unknown> },
    mockTrashItem: vi.fn().mockResolvedValue(undefined),
    mockShowSaveDialog: vi.fn(),
    mockShowOpenDialog: vi.fn(),
}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/main/lib/appState', () => ({
    readState: vi.fn(() => Promise.resolve({ ...mockState.current })),
    updateState: vi.fn((mutate: (s: Record<string, unknown>) => Record<string, unknown>) => {
        mockState.current = mutate({ ...mockState.current });
        return Promise.resolve();
    }),
}));

vi.mock('electron', () => ({
    BrowserWindow: vi.fn(),
    app: { getPath: vi.fn(() => '/home/test') },
    dialog: { showOpenDialog: mockShowOpenDialog, showSaveDialog: mockShowSaveDialog },
    shell: { trashItem: mockTrashItem, openExternal: vi.fn() },
}));

let tmpVault: string;
let ipc: ReturnType<typeof createFakeIpc>;
const fakeWindow = new BrowserWindow();

function newTmpVault(): string {
    const dir = path.join(os.tmpdir(), `phylla-fs-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.current = {};
    tmpVault = newTmpVault();
    ipc = createFakeIpc();
    const { register } = await import('@/main/services/fs');
    register(ipc, () => fakeWindow);
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [tmpVault] });
    await ipc.invoke('dialog:openFolder');
});

afterEach(() => {
    fs.rmSync(tmpVault, { recursive: true, force: true });
});

describe('findVaultRoot', () => {
    it('returns the vault root after the folder dialog', async () => {
        const { findVaultRoot } = await import('@/main/services/fs');
        expect(findVaultRoot()).toBe(path.resolve(tmpVault));
    });
});

describe('vault root ownership', () => {
    it('is not settable by passing a path to files:scan', async () => {
        const { findVaultRoot } = await import('@/main/services/fs');
        const outside = newTmpVault();
        try {
            await ipc.invoke('files:scan', outside);
            expect(findVaultRoot()).toBe(path.resolve(tmpVault));
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('still confines file reads after a scan is attempted elsewhere', async () => {
        const outside = newTmpVault();
        const secret = path.join(outside, 'secret.md');
        fs.writeFileSync(secret, 'classified');
        try {
            await ipc.invoke('files:scan', outside);
            const result = readReply(await ipc.invoke('file:read', secret));
            expect(result.success).toBe(false);
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('persists the root so it survives a restart', async () => {
        vi.resetModules();
        const freshIpc = createFakeIpc();
        const { register, initVaultRoot, findVaultRoot } = await import('@/main/services/fs');
        register(freshIpc, () => fakeWindow);
        await initVaultRoot();
        expect(findVaultRoot()).toBe(path.resolve(tmpVault));
    });

    it('discards a persisted root that no longer exists', async () => {
        fs.rmSync(tmpVault, { recursive: true, force: true });
        vi.resetModules();
        const { initVaultRoot, findVaultRoot } = await import('@/main/services/fs');
        await initVaultRoot();
        expect(findVaultRoot()).toBeNull();
    });

    it('files:scan reports the root it scanned', async () => {
        fs.writeFileSync(path.join(tmpVault, 'note.md'), '# hi');
        const result = readReply(await ipc.invoke('files:scan'));
        expect(result.success).toBe(true);
        expect(result.root).toBe(path.resolve(tmpVault));
    });

    it('files:scan fails when no vault is open', async () => {
        vi.resetModules();
        const freshIpc = createFakeIpc();
        const { register } = await import('@/main/services/fs');
        register(freshIpc, () => fakeWindow);
        const result = readReply(await freshIpc.invoke('files:scan'));
        expect(result.success).toBe(false);
    });

    it('vault:close clears the root and forgets it across restarts', async () => {
        const { findVaultRoot } = await import('@/main/services/fs');
        const result = readReply(await ipc.invoke('vault:close'));
        expect(result.success).toBe(true);
        expect(findVaultRoot()).toBeNull();

        vi.resetModules();
        const { initVaultRoot, findVaultRoot: freshGetRoot } = await import('@/main/services/fs');
        await initVaultRoot();
        expect(freshGetRoot()).toBeNull();
    });

    it('a cancelled folder dialog leaves the root unchanged', async () => {
        const { findVaultRoot } = await import('@/main/services/fs');
        mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
        const result = await ipc.invoke('dialog:openFolder');
        expect(result).toBeNull();
        expect(findVaultRoot()).toBe(path.resolve(tmpVault));
    });
});

describe('cleanup', () => {
    it('closes the watcher without error when no watcher is active', async () => {
        const { cleanup } = await import('@/main/services/fs');
        expect(() => cleanup()).not.toThrow();
    });
});

describe('file:read', () => {
    it('reads a text file successfully', async () => {
        const filePath = path.join(tmpVault, 'hello.md');
        fs.writeFileSync(filePath, '# Hello');
        const result = readReply(await ipc.invoke('file:read', filePath));
        expect(result.success).toBe(true);
        expect(result.content).toBe('# Hello');
    });

    it('returns failure for a non-string path', async () => {
        const result = readReply(await ipc.invoke('file:read', 42));
        expect(result.success).toBe(false);
    });

    it('returns failure when file does not exist', async () => {
        const result = readReply(await ipc.invoke('file:read', path.join(tmpVault, 'missing.md')));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('file:read', '/etc/passwd'));
        expect(result.success).toBe(false);
    });
});

describe('file:write', () => {
    it('writes content to a file', async () => {
        const filePath = path.join(tmpVault, 'note.md');
        const result = readReply(await ipc.invoke('file:write', filePath, 'content'));
        expect(result.success).toBe(true);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('content');
    });

    it('overwrites existing file', async () => {
        const filePath = path.join(tmpVault, 'note.md');
        fs.writeFileSync(filePath, 'old');
        await ipc.invoke('file:write', filePath, 'new content');
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:write', 42, 'x'));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('file:write', '/tmp/outside.md', 'x'));
        expect(result.success).toBe(false);
    });
});

describe('file:create', () => {
    it('creates a new empty file', async () => {
        const result = readReplyWith(await ipc.invoke('file:create', tmpVault, 'new-note.md'), { path: z.string() });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.path)).toBe(true);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:create', 42, 'x'));
        expect(result.success).toBe(false);
    });

    it('returns failure when folder is outside vault', async () => {
        const result = readReply(await ipc.invoke('file:create', '/tmp', 'x.md'));
        expect(result.success).toBe(false);
    });

    it('returns failure for path traversal in fileName', async () => {
        const result = readReply(await ipc.invoke('file:create', tmpVault, '../../etc/passwd'));
        expect(result.success).toBe(false);
    });
});

describe('folder:create', () => {
    it('creates a new folder', async () => {
        const result = readReplyWith(await ipc.invoke('folder:create', tmpVault, 'projects'), { path: z.string() });
        expect(result.success).toBe(true);
        expect(fs.statSync(result.path).isDirectory()).toBe(true);
    });

    it('returns failure when folder already exists', async () => {
        fs.mkdirSync(path.join(tmpVault, 'existing'));
        const result = readReply(await ipc.invoke('folder:create', tmpVault, 'existing'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('ALREADY_EXISTS');
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('folder:create', 42, 'x'));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('folder:create', '/tmp', 'x'));
        expect(result.success).toBe(false);
    });
});

describe('file:rename', () => {
    it('renames a file', async () => {
        const oldPath = path.join(tmpVault, 'old.md');
        fs.writeFileSync(oldPath, 'content');
        const result = readReplyWith(await ipc.invoke('file:rename', oldPath, 'new.md'), { newPath: z.string() });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.newPath)).toBe(true);
        expect(fs.existsSync(oldPath)).toBe(false);
    });

    it('returns failure if target name already exists', async () => {
        fs.writeFileSync(path.join(tmpVault, 'a.md'), '');
        fs.writeFileSync(path.join(tmpVault, 'b.md'), '');
        const result = readReply(await ipc.invoke('file:rename', path.join(tmpVault, 'a.md'), 'b.md'));
        expect(result.success).toBe(false);
        expect(result.error).toBe('ALREADY_EXISTS');
    });

    it('allows same-case rename (rename to same name)', async () => {
        const filePath = path.join(tmpVault, 'note.md');
        fs.writeFileSync(filePath, '');
        const result = readReply(await ipc.invoke('file:rename', filePath, 'NOTE.md'));
        expect(result.success).toBe(true);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:rename', 42, 'x.md'));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('file:rename', '/etc/passwd', 'x.md'));
        expect(result.success).toBe(false);
    });
});

describe('folder:rename', () => {
    it('renames a folder', async () => {
        const oldPath = path.join(tmpVault, 'old-folder');
        fs.mkdirSync(oldPath);
        const result = readReplyWith(await ipc.invoke('folder:rename', oldPath, 'new-folder'), { newPath: z.string() });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.newPath)).toBe(true);
    });

    it('returns failure if target folder name already exists', async () => {
        fs.mkdirSync(path.join(tmpVault, 'folderA'));
        fs.mkdirSync(path.join(tmpVault, 'folderB'));
        const result = readReply(await ipc.invoke('folder:rename', path.join(tmpVault, 'folderA'), 'folderB'));
        expect(result.success).toBe(false);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('folder:rename', 42, 'x'));
        expect(result.success).toBe(false);
    });
});

describe('file:delete', () => {
    it('trashes a file via shell.trashItem', async () => {
        const filePath = path.join(tmpVault, 'to-delete.md');
        fs.writeFileSync(filePath, '');
        const result = readReply(await ipc.invoke('file:delete', filePath));
        expect(result.success).toBe(true);
        expect(mockTrashItem).toHaveBeenCalledWith(filePath);
    });

    it('returns failure for non-string path', async () => {
        const result = readReply(await ipc.invoke('file:delete', 42));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('file:delete', '/etc/passwd'));
        expect(result.success).toBe(false);
    });

    it('returns failure when trashItem throws', async () => {
        mockTrashItem.mockRejectedValueOnce(new Error('trash failed'));
        const filePath = path.join(tmpVault, 'file.md');
        fs.writeFileSync(filePath, '');
        const result = readReply(await ipc.invoke('file:delete', filePath));
        expect(result.success).toBe(false);
        expect(result.error).toBe('UNKNOWN');
    });
});

describe('folder:delete', () => {
    it('trashes a folder via shell.trashItem', async () => {
        const folderPath = path.join(tmpVault, 'to-trash');
        fs.mkdirSync(folderPath);
        const result = readReply(await ipc.invoke('folder:delete', folderPath));
        expect(result.success).toBe(true);
        expect(mockTrashItem).toHaveBeenCalledWith(folderPath);
    });

    it('returns failure for non-string path', async () => {
        const result = readReply(await ipc.invoke('folder:delete', 42));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('folder:delete', '/tmp'));
        expect(result.success).toBe(false);
    });
});

describe('file:move', () => {
    it('moves a file to a new folder', async () => {
        const srcFile = path.join(tmpVault, 'note.md');
        const targetDir = path.join(tmpVault, 'sub');
        fs.writeFileSync(srcFile, 'content');
        fs.mkdirSync(targetDir);

        const result = readReplyWith(await ipc.invoke('file:move', srcFile, targetDir), { newPath: z.string() });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.newPath)).toBe(true);
        expect(fs.existsSync(srcFile)).toBe(false);
    });

    it('returns success when file is already in the target folder', async () => {
        const srcFile = path.join(tmpVault, 'note.md');
        fs.writeFileSync(srcFile, '');
        const result = readReply(await ipc.invoke('file:move', srcFile, tmpVault));
        expect(result.success).toBe(true);
    });

    it('returns failure when a file with the same name exists in target', async () => {
        const src = path.join(tmpVault, 'note.md');
        const targetDir = path.join(tmpVault, 'sub');
        fs.writeFileSync(src, '');
        fs.mkdirSync(targetDir);
        fs.writeFileSync(path.join(targetDir, 'note.md'), 'existing');

        const result = readReply(await ipc.invoke('file:move', src, targetDir));
        expect(result.success).toBe(false);
        expect(result.error).toBe('ALREADY_EXISTS');
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:move', 42, 'x'));
        expect(result.success).toBe(false);
    });

    it('returns failure when target folder is outside vault', async () => {
        const src = path.join(tmpVault, 'note.md');
        fs.writeFileSync(src, '');
        const result = readReply(await ipc.invoke('file:move', src, '/tmp'));
        expect(result.success).toBe(false);
    });
});

describe('folder:move', () => {
    it('moves a folder into another folder', async () => {
        const srcDir = path.join(tmpVault, 'source');
        const targetDir = path.join(tmpVault, 'target');
        fs.mkdirSync(srcDir);
        fs.mkdirSync(targetDir);

        const result = readReplyWith(await ipc.invoke('folder:move', srcDir, targetDir), { newPath: z.string() });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.newPath)).toBe(true);
    });

    it('returns success when folder is already in target', async () => {
        const srcDir = path.join(tmpVault, 'folder');
        fs.mkdirSync(srcDir);
        const result = readReply(await ipc.invoke('folder:move', srcDir, tmpVault));
        expect(result.success).toBe(true);
    });

    it('returns failure when moving a folder into itself', async () => {
        const srcDir = path.join(tmpVault, 'outer');
        const innerDir = path.join(srcDir, 'inner');
        fs.mkdirSync(innerDir, { recursive: true });
        const result = readReply(await ipc.invoke('folder:move', srcDir, innerDir));
        expect(result.success).toBe(false);
        expect(result.error).toBe('MOVE_INTO_SELF');
    });

    it('returns failure when destination folder name already exists', async () => {
        const srcDir = path.join(tmpVault, 'mydir');
        const targetParent = path.join(tmpVault, 'target');
        fs.mkdirSync(srcDir);
        fs.mkdirSync(targetParent);
        fs.mkdirSync(path.join(targetParent, 'mydir'));

        const result = readReply(await ipc.invoke('folder:move', srcDir, targetParent));
        expect(result.success).toBe(false);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('folder:move', 42, 'x'));
        expect(result.success).toBe(false);
    });
});

describe('file:readImage', () => {
    it('returns a base64 data URL for a png', async () => {
        const imgPath = path.join(tmpVault, 'photo.png');
        fs.writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header bytes
        const result = readReply(await ipc.invoke('file:readImage', imgPath));
        expect(result.success).toBe(true);
        expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('returns failure for non-string path', async () => {
        const result = readReply(await ipc.invoke('file:readImage', 42));
        expect(result.success).toBe(false);
    });

    it('returns failure for path outside vault', async () => {
        const result = readReply(await ipc.invoke('file:readImage', '/etc/passwd'));
        expect(result.success).toBe(false);
    });

    it('returns failure when file does not exist', async () => {
        const result = readReply(await ipc.invoke('file:readImage', path.join(tmpVault, 'no.png')));
        expect(result.success).toBe(false);
    });

    it('uses a fallback mime type for unknown extensions', async () => {
        const imgPath = path.join(tmpVault, 'photo.xyz');
        fs.writeFileSync(imgPath, 'data');
        const result = readReply(await ipc.invoke('file:readImage', imgPath));
        expect(result.success).toBe(true);
        expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });
});

describe('file:readAudio', () => {
    it('returns a base64 data URL for an mp3', async () => {
        const audioPath = path.join(tmpVault, 'clip.mp3');
        fs.writeFileSync(audioPath, Buffer.from([0xff, 0xfb]));
        const result = readReply(await ipc.invoke('file:readAudio', audioPath));
        expect(result.success).toBe(true);
        expect(result.dataUrl).toMatch(/^data:audio\/mpeg;base64,/);
    });

    it('returns failure for non-string path', async () => {
        const result = readReply(await ipc.invoke('file:readAudio', null));
        expect(result.success).toBe(false);
    });

    it('returns failure when file does not exist', async () => {
        const result = readReply(await ipc.invoke('file:readAudio', path.join(tmpVault, 'missing.mp3')));
        expect(result.success).toBe(false);
    });

    it('uses fallback mime type for unknown audio extensions', async () => {
        const audioPath = path.join(tmpVault, 'sound.xyz');
        fs.writeFileSync(audioPath, 'data');
        const result = readReply(await ipc.invoke('file:readAudio', audioPath));
        expect(result.success).toBe(true);
        expect(result.dataUrl).toMatch(/^data:audio\/mpeg;base64,/);
    });
});

describe('file:writeBuffer', () => {
    async function authorize(target: string): Promise<void> {
        mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: target });
        await ipc.invoke('dialog:showSaveDialog', { defaultPath: target });
    }

    it('writes a base64-encoded binary file to a dialog-authorised path', async () => {
        const filePath = path.join(tmpVault, 'export.png');
        await authorize(filePath);
        const base64 = Buffer.from('hello binary').toString('base64');
        const result = readReply(await ipc.invoke('file:writeBuffer', filePath, base64));
        expect(result.success).toBe(true);
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello binary');
    });

    it('allows an authorised path outside the vault (exports go anywhere)', async () => {
        const outside = path.join(os.tmpdir(), `phylla-export-${Date.now()}.png`);
        await authorize(outside);
        const result = readReply(await ipc.invoke('file:writeBuffer', outside, Buffer.from('x').toString('base64')));
        expect(result.success).toBe(true);
        fs.rmSync(outside, { force: true });
    });

    it('refuses a path the user never chose in a save dialog', async () => {
        const filePath = path.join(tmpVault, 'unauthorised.png');
        const result = readReply(await ipc.invoke('file:writeBuffer', filePath, Buffer.from('x').toString('base64')));
        expect(result.success).toBe(false);
        expect(result.error).toBe('ACCESS_DENIED');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('consumes the authorisation, so a path cannot be written twice', async () => {
        const filePath = path.join(tmpVault, 'once.png');
        await authorize(filePath);
        const first = readReply(await ipc.invoke('file:writeBuffer', filePath, Buffer.from('x').toString('base64')));
        const second = readReply(await ipc.invoke('file:writeBuffer', filePath, Buffer.from('y').toString('base64')));
        expect(first.success).toBe(true);
        expect(second.success).toBe(false);
    });

    it('does not authorise anything when the save dialog is cancelled', async () => {
        const filePath = path.join(tmpVault, 'cancelled.png');
        mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
        const dialogResult = await ipc.invoke('dialog:showSaveDialog', { defaultPath: filePath });
        expect(dialogResult).toBeNull();
        const result = readReply(await ipc.invoke('file:writeBuffer', filePath, Buffer.from('x').toString('base64')));
        expect(result.success).toBe(false);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:writeBuffer', 42, 'notbase64'));
        expect(result.success).toBe(false);
    });

    it('returns failure when an authorised path is not writable', async () => {
        const filePath = path.join(tmpVault, 'a', 'b', 'c.png');
        await authorize(filePath);
        const result = readReply(await ipc.invoke('file:writeBuffer', filePath, Buffer.from('x').toString('base64')));
        expect(result.success).toBe(false);
    });
});

describe('bookmarks:load', () => {
    it('returns empty bookmarks when no bookmarks file exists', async () => {
        const result = readReply(await ipc.invoke('bookmarks:load'));
        expect(result.success).toBe(true);
        expect(result.bookmarks).toEqual([]);
    });

    it('loads previously saved bookmarks', async () => {
        const phyllaDir = path.join(tmpVault, '.phylla');
        fs.mkdirSync(phyllaDir, { recursive: true });
        const bookmarks = [path.join(tmpVault, 'note.md')];
        fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), JSON.stringify(bookmarks));

        const result = readReply(await ipc.invoke('bookmarks:load'));
        expect(result.success).toBe(true);
        expect(result.bookmarks).toContain(path.join(tmpVault, 'note.md'));
    });

    it('filters out bookmarks outside the vault', async () => {
        const phyllaDir = path.join(tmpVault, '.phylla');
        fs.mkdirSync(phyllaDir, { recursive: true });
        const bookmarks = [path.join(tmpVault, 'note.md'), '/etc/passwd'];
        fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), JSON.stringify(bookmarks));

        const result = readReply(await ipc.invoke('bookmarks:load'));
        expect(result.success).toBe(true);
        expect(result.bookmarks).not.toContain('/etc/passwd');
    });

    it('returns empty list when bookmarks.json contains non-array', async () => {
        const phyllaDir = path.join(tmpVault, '.phylla');
        fs.mkdirSync(phyllaDir, { recursive: true });
        fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), '"not an array"');

        const result = readReply(await ipc.invoke('bookmarks:load'));
        expect(result.success).toBe(true);
        expect(result.bookmarks).toEqual([]);
    });

    it('returns empty list when bookmarks.json is invalid JSON', async () => {
        const phyllaDir = path.join(tmpVault, '.phylla');
        fs.mkdirSync(phyllaDir, { recursive: true });
        fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), 'not-json');

        const result = readReply(await ipc.invoke('bookmarks:load'));
        expect(result.success).toBe(true);
        expect(result.bookmarks).toEqual([]);
    });
});

describe('bookmarks:save', () => {
    it('saves bookmarks inside the vault', async () => {
        const bookmarks = [path.join(tmpVault, 'note.md')];
        const result = readReply(await ipc.invoke('bookmarks:save', bookmarks));
        expect(result.success).toBe(true);

        const saved = z
            .array(z.string())
            .parse(JSON.parse(fs.readFileSync(path.join(tmpVault, '.phylla', 'bookmarks.json'), 'utf-8')));
        expect(saved).toEqual(bookmarks);
    });

    it('returns failure for non-array bookmarks', async () => {
        const result = readReply(await ipc.invoke('bookmarks:save', 'not-array'));
        expect(result.success).toBe(false);
    });

    it('returns failure when a bookmark is outside the vault', async () => {
        const result = readReply(await ipc.invoke('bookmarks:save', ['/etc/passwd']));
        expect(result.success).toBe(false);
    });

    it('saves an empty bookmarks array', async () => {
        const result = readReply(await ipc.invoke('bookmarks:save', []));
        expect(result.success).toBe(true);
    });
});

describe('file:resolveEmbedPath', () => {
    it('resolves embed relative to note directory', async () => {
        const imgPath = path.join(tmpVault, 'image.png');
        fs.writeFileSync(imgPath, '');
        const result = readReply(await ipc.invoke('file:resolveEmbedPath', 'image.png', tmpVault, tmpVault));
        expect(result.success).toBe(true);
        expect(result.path).toBe(imgPath);
    });

    it('resolves embed via recursive search when not in note dir', async () => {
        const subDir = path.join(tmpVault, 'assets');
        fs.mkdirSync(subDir);
        const imgPath = path.join(subDir, 'photo.png');
        fs.writeFileSync(imgPath, '');
        const result = readReply(await ipc.invoke('file:resolveEmbedPath', 'photo.png', tmpVault, tmpVault));
        expect(result.success).toBe(true);
        expect(result.path).toBe(imgPath);
    });

    it('returns failure when file is not found anywhere', async () => {
        const result = readReply(await ipc.invoke('file:resolveEmbedPath', 'missing.png', tmpVault, tmpVault));
        expect(result.success).toBe(false);
        expect(result.error).toBe('NOT_FOUND');
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:resolveEmbedPath', 42, tmpVault, tmpVault));
        expect(result.success).toBe(false);
    });

    it('returns failure when noteDir is outside vault', async () => {
        const result = readReply(await ipc.invoke('file:resolveEmbedPath', 'img.png', '/tmp', '/tmp'));
        expect(result.success).toBe(false);
    });
});

describe('file:updateEmbedRefs', () => {
    it('updates embed references across markdown files', async () => {
        const noteA = path.join(tmpVault, 'a.md');
        const noteB = path.join(tmpVault, 'b.md');
        fs.writeFileSync(noteA, 'See ![[old-image.png]] for details');
        fs.writeFileSync(noteB, 'No embed here');

        const result = readReply(await ipc.invoke('file:updateEmbedRefs', 'old-image.png', 'new-image.png'));
        expect(result.success).toBe(true);
        expect(result.updatedCount).toBe(1);
        expect(fs.readFileSync(noteA, 'utf-8')).toContain('![[new-image.png]]');
        expect(fs.readFileSync(noteB, 'utf-8')).toBe('No embed here');
    });

    it('handles embed with pipe alias', async () => {
        const note = path.join(tmpVault, 'note.md');
        fs.writeFileSync(note, '![[image.png|500x300]]');
        await ipc.invoke('file:updateEmbedRefs', 'image.png', 'renamed.png');
        expect(fs.readFileSync(note, 'utf-8')).toContain('![[renamed.png|500x300]]');
    });

    it('handles embed with heading suffix', async () => {
        const note = path.join(tmpVault, 'note.md');
        fs.writeFileSync(note, '![[doc.md#section]]');
        await ipc.invoke('file:updateEmbedRefs', 'doc.md', 'new-doc.md');
        expect(fs.readFileSync(note, 'utf-8')).toContain('![[new-doc.md#section]]');
    });

    it('returns failure when vault root is not set', async () => {
        vi.resetModules();
        const freshIpc = createFakeIpc();
        const { register } = await import('@/main/services/fs');
        register(freshIpc, () => null);
        const result = readReply(await freshIpc.invoke('file:updateEmbedRefs', 'a.png', 'b.png'));
        expect(result.success).toBe(false);
    });

    it('returns failure for invalid arguments', async () => {
        const result = readReply(await ipc.invoke('file:updateEmbedRefs', 42, 'x'));
        expect(result.success).toBe(false);
    });
});

describe('fs:watchFolder', () => {
    it('returns success and sets up a watcher', async () => {
        const result = readReply(await ipc.invoke('fs:watchFolder'));
        expect(result.success).toBe(true);
        await ipc.invoke('fs:unwatchFolder');
    });

    it('ignores any path argument and watches the vault root', async () => {
        const result = readReply(await ipc.invoke('fs:watchFolder', '/etc'));
        expect(result.success).toBe(true);
        await ipc.invoke('fs:unwatchFolder');
    });

    it('returns failure when no vault is open', async () => {
        vi.resetModules();
        const freshIpc = createFakeIpc();
        const { register } = await import('@/main/services/fs');
        register(freshIpc, () => fakeWindow);
        const result = readReply(await freshIpc.invoke('fs:watchFolder'));
        expect(result.success).toBe(false);
    });

    it('returns failure when the vault root no longer exists', async () => {
        fs.rmSync(tmpVault, { recursive: true, force: true });
        const result = readReply(await ipc.invoke('fs:watchFolder'));
        expect(result.success).toBe(false);
    });

    it('replaces the previous watcher on second call', async () => {
        await ipc.invoke('fs:watchFolder');
        const result = readReply(await ipc.invoke('fs:watchFolder'));
        expect(result.success).toBe(true);
        await ipc.invoke('fs:unwatchFolder');
    });
});

describe('fs:unwatchFolder', () => {
    it('returns success even when no watcher is active', async () => {
        const result = readReply(await ipc.invoke('fs:unwatchFolder'));
        expect(result.success).toBe(true);
    });

    it('closes an active watcher and returns success', async () => {
        await ipc.invoke('fs:watchFolder');
        const result = readReply(await ipc.invoke('fs:unwatchFolder'));
        expect(result.success).toBe(true);
    });
});

describe('cleanup (with active watcher)', () => {
    it('closes active watcher during cleanup', async () => {
        const { cleanup } = await import('@/main/services/fs');
        await ipc.invoke('fs:watchFolder');
        expect(() => cleanup()).not.toThrow();
    });
});
