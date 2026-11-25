import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, it, expect } from 'vitest';

import { resolveInsideBoundary, assertSafeFileName } from '@/main/lib/validation';

describe('validation', () => {
    describe('resolveInsideBoundary', () => {
        let base: string;
        let root: string;
        let outside: string;

        beforeEach(() => {
            base = fs.mkdtempSync(path.join(os.tmpdir(), 'phylla-boundary-'));
            root = path.join(base, 'vault');
            outside = path.join(base, 'outside');
            fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
            fs.mkdirSync(outside);
            fs.writeFileSync(path.join(root, 'note.md'), 'inside');
            fs.writeFileSync(path.join(outside, 'secret.md'), 'secret');
        });

        afterEach(() => {
            fs.rmSync(base, { recursive: true, force: true });
        });

        it('returns the resolved path of a file inside the root', async () => {
            await expect(resolveInsideBoundary(`${root}/sub/../note.md`, root)).resolves.toBe(
                path.join(root, 'note.md'),
            );
        });

        it('allows the root itself, with or without a trailing slash', async () => {
            await expect(resolveInsideBoundary(root, root)).resolves.toBe(root);
            await expect(resolveInsideBoundary(path.join(root, 'note.md'), `${root}/`)).resolves.toBe(
                path.join(root, 'note.md'),
            );
        });

        it('allows a path that does not exist yet, so create and rename work', async () => {
            const target = path.join(root, 'sub', 'new', 'draft.md');
            await expect(resolveInsideBoundary(target, root)).resolves.toBe(target);
        });

        it('refuses ../ that escapes the root', async () => {
            await expect(resolveInsideBoundary(`${root}/../outside/secret.md`, root)).rejects.toThrow('Access denied');
        });

        it('refuses a sibling folder that shares the root as a prefix', async () => {
            fs.mkdirSync(`${root}-backup`);
            await expect(resolveInsideBoundary(`${root}-backup/note.md`, root)).rejects.toThrow('Access denied');
        });

        it('refuses an unrelated absolute path', async () => {
            await expect(resolveInsideBoundary(path.join(outside, 'secret.md'), root)).rejects.toThrow('Access denied');
        });

        it('refuses a file symlink inside the root that points outside it', async () => {
            fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'));
            await expect(resolveInsideBoundary(path.join(root, 'innocent.md'), root)).rejects.toThrow('Access denied');
        });

        it('refuses a new file under a folder symlink that points outside', async () => {
            fs.symlinkSync(outside, path.join(root, 'attachments'));
            await expect(resolveInsideBoundary(path.join(root, 'attachments', 'new.md'), root)).rejects.toThrow(
                'Access denied',
            );
        });

        it('refuses a dangling symlink, which a write would follow out of the root', async () => {
            fs.symlinkSync(path.join(outside, 'not-yet.md'), path.join(root, 'dangling.md'));
            await expect(resolveInsideBoundary(path.join(root, 'dangling.md'), root)).rejects.toThrow('Access denied');
        });

        it('allows a symlink that stays inside the root', async () => {
            fs.symlinkSync(path.join(root, 'note.md'), path.join(root, 'sub', 'alias.md'));
            await expect(resolveInsideBoundary(path.join(root, 'sub', 'alias.md'), root)).resolves.toBe(
                path.join(root, 'sub', 'alias.md'),
            );
        });

        it('allows the same files when the root is reached through a symlink', async () => {
            const linkedRoot = path.join(base, 'vault-link');
            fs.symlinkSync(root, linkedRoot);
            await expect(resolveInsideBoundary(path.join(linkedRoot, 'note.md'), linkedRoot)).resolves.toBe(
                path.join(linkedRoot, 'note.md'),
            );
        });
    });

    describe('assertSafeFileName', () => {
        it('allows a simple filename', () => {
            expect(() => assertSafeFileName('note.md')).not.toThrow();
        });

        it('allows filename with dots', () => {
            expect(() => assertSafeFileName('my.note.backup.md')).not.toThrow();
        });

        it('allows filename with spaces', () => {
            expect(() => assertSafeFileName('my note.md')).not.toThrow();
        });

        it('allows filename with dashes and underscores', () => {
            expect(() => assertSafeFileName('my-note_v2.md')).not.toThrow();
        });

        it('blocks forward slash (directory traversal)', () => {
            expect(() => assertSafeFileName('sub/file.md')).toThrow('Invalid name');
        });

        it('treats a backslash as a literal filename character, not a separator', () => {
            expect(() => assertSafeFileName('sub\\file.md')).not.toThrow();
        });

        it('blocks parent directory reference', () => {
            expect(() => assertSafeFileName('../secret.md')).toThrow('Invalid name');
        });

        it('blocks empty string', () => {
            expect(() => assertSafeFileName('')).toThrow('Invalid name');
        });

        it('blocks path that looks like a directory', () => {
            expect(() => assertSafeFileName('a/b/c')).toThrow('Invalid name');
        });
    });
});
