import fs from 'fs';
import os from 'os';
import path from 'path';

import { BrowserWindow } from 'electron';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createFakeIpc, readReply } from './test-utils';

const { mockShowOpenDialog } = vi.hoisted(() => ({ mockShowOpenDialog: vi.fn() }));
const { mockState } = vi.hoisted(() => ({ mockState: { current: {} as Record<string, unknown> } }));

vi.mock('electron', () => ({
    BrowserWindow: vi.fn(),
    app: { getPath: vi.fn(() => '/home/test') },
    dialog: { showOpenDialog: mockShowOpenDialog, showSaveDialog: vi.fn() },
    shell: { openExternal: vi.fn() },
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

const fakeWindow = new BrowserWindow();
let tmpVault: string;
let ipc: ReturnType<typeof createFakeIpc>;

function newTmpVault(): string {
    const dir = path.join(os.tmpdir(), `phylla-bm-test-${process.pid}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

describe('bookmarks IPC handlers', () => {
    beforeEach(async () => {
        vi.resetModules();
        tmpVault = newTmpVault();
        ipc = createFakeIpc();
        const { register } = await import('@/main/services/fs');
        register(ipc, () => fakeWindow);
        mockState.current = {};
        mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [tmpVault] });
        await ipc.invoke('dialog:openFolder');
    });

    afterEach(() => {
        fs.rmSync(tmpVault, { recursive: true, force: true });
    });

    describe('bookmarks:load', () => {
        it('returns empty array when .phylla/bookmarks.json does not exist', async () => {
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(true);
            expect(result.bookmarks).toEqual([]);
        });

        it('returns the saved list after a successful save', async () => {
            const paths = [`${tmpVault}/a.md`, `${tmpVault}/b.md`];
            await ipc.invoke('bookmarks:save', paths);
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(true);
            expect(result.bookmarks).toEqual(paths);
        });

        it('filters out paths that have escaped the vault (tampered file)', async () => {
            const phyllaDir = path.join(tmpVault, '.phylla');
            fs.mkdirSync(phyllaDir, { recursive: true });
            fs.writeFileSync(
                path.join(phyllaDir, 'bookmarks.json'),
                JSON.stringify([`${tmpVault}/valid.md`, '/etc/passwd']),
            );
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(true);
            expect(result.bookmarks).toContain(`${tmpVault}/valid.md`);
            expect(result.bookmarks).not.toContain('/etc/passwd');
        });

        it('moves a pre-rename .leaf folder to .phylla and loads its bookmarks', async () => {
            const legacyDir = path.join(tmpVault, '.leaf');
            fs.mkdirSync(legacyDir, { recursive: true });
            fs.writeFileSync(path.join(legacyDir, 'bookmarks.json'), JSON.stringify([`${tmpVault}/a.md`]));
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.bookmarks).toEqual([`${tmpVault}/a.md`]);
            expect(fs.existsSync(legacyDir)).toBe(false);
            expect(fs.existsSync(path.join(tmpVault, '.phylla', 'bookmarks.json'))).toBe(true);
        });

        it('returns empty array when bookmarks.json contains non-array JSON', async () => {
            const phyllaDir = path.join(tmpVault, '.phylla');
            fs.mkdirSync(phyllaDir, { recursive: true });
            fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), JSON.stringify({ oops: true }));
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(true);
            expect(result.bookmarks).toEqual([]);
        });

        it('returns empty array when bookmarks.json contains malformed JSON', async () => {
            const phyllaDir = path.join(tmpVault, '.phylla');
            fs.mkdirSync(phyllaDir, { recursive: true });
            fs.writeFileSync(path.join(phyllaDir, 'bookmarks.json'), 'NOT JSON {{{}}}');
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(true);
            expect(result.bookmarks).toEqual([]);
        });
    });

    describe('bookmarks:save', () => {
        it('returns success for a valid list of vault-internal paths', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', [`${tmpVault}/note.md`]));
            expect(result.success).toBe(true);
        });

        it('creates .phylla/bookmarks.json inside the vault', async () => {
            await ipc.invoke('bookmarks:save', [`${tmpVault}/note.md`]);
            const bookmarksFile = path.join(tmpVault, '.phylla', 'bookmarks.json');
            expect(fs.existsSync(bookmarksFile)).toBe(true);
        });

        it('creates the .phylla directory if it does not exist', async () => {
            const phyllaDir = path.join(tmpVault, '.phylla');
            expect(fs.existsSync(phyllaDir)).toBe(false);
            await ipc.invoke('bookmarks:save', [`${tmpVault}/note.md`]);
            expect(fs.existsSync(phyllaDir)).toBe(true);
        });

        it('rejects a path that escapes the vault via traversal', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', [`${tmpVault}/../outside.md`]));
            expect(result.success).toBe(false);
            expect(result.error).toBe('ACCESS_DENIED');
        });

        it('rejects an absolute path outside the vault', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', ['/etc/passwd']));
            expect(result.success).toBe(false);
            expect(result.error).toBe('ACCESS_DENIED');
        });

        it('rejects a non-array payload', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', 'not-an-array'));
            expect(result.success).toBe(false);
        });

        it('rejects a payload containing non-string entries', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', [42, true]));
            expect(result.success).toBe(false);
        });

        it('overwrites the previous bookmarks list', async () => {
            await ipc.invoke('bookmarks:save', [`${tmpVault}/a.md`, `${tmpVault}/b.md`]);
            await ipc.invoke('bookmarks:save', [`${tmpVault}/c.md`]);
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.bookmarks).toEqual([`${tmpVault}/c.md`]);
        });

        it('persists an empty list (clearing bookmarks)', async () => {
            await ipc.invoke('bookmarks:save', [`${tmpVault}/a.md`]);
            await ipc.invoke('bookmarks:save', []);
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.bookmarks).toEqual([]);
        });
    });

    describe('when no vault is open', () => {
        beforeEach(async () => {
            vi.resetModules();
            ipc = createFakeIpc();
            const { register } = await import('@/main/services/fs');
            register(ipc, () => null);
        });

        it('bookmarks:load returns failure', async () => {
            const result = readReply(await ipc.invoke('bookmarks:load'));
            expect(result.success).toBe(false);
        });

        it('bookmarks:save returns failure', async () => {
            const result = readReply(await ipc.invoke('bookmarks:save', []));
            expect(result.success).toBe(false);
        });
    });
});
