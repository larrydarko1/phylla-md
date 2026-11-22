/**
 * Owns `<vault>/.phylla/bookmarks.json`. Entries are stored relative to the vault, so moving or
 * renaming the vault keeps them, and one whose file was moved outside Phylla is followed to it.
 */

import fs from 'fs/promises';
import path from 'path';

import { vaultMetaDir } from '@/main/lib/paths';
import { resolveInsideBoundary } from '@/main/lib/validation';

/** The vault's files, relative to its root, with `/` between parts. */
type ListVaultFiles = () => Promise<string[]>;

/**
 * The bookmarks as absolute paths. One whose file is missing is followed to where it moved when
 * that is certain, and kept as it was when not (the file may come back); the repaired list is saved.
 */
export async function readBookmarks(root: string, listVaultFiles: ListVaultFiles): Promise<string[]> {
    const stored = await readStored(root);
    let vaultFiles: string[] | null = null;
    const kept: string[] = [];
    for (const entry of stored) {
        const relative = toRelative(entry, root);
        if (relative !== null && (await exists(path.join(root, relative)))) {
            kept.push(relative);
            continue;
        }
        vaultFiles ??= await listVaultFiles();
        const moved = findMoved(relative ?? entry, vaultFiles) ?? relative;
        if (moved !== null) kept.push(moved);
    }
    const unique = [...new Set(kept)];
    if (JSON.stringify(unique) !== JSON.stringify(stored)) await writeStored(root, unique);
    return unique.map((relative): string => path.join(root, relative));
}

/** Stores absolute bookmark paths relative to the vault; refuses one that isn't really inside it. */
export async function saveBookmarks(root: string, absolutePaths: string[]): Promise<void> {
    await Promise.all(absolutePaths.map((p): Promise<string> => resolveInsideBoundary(p, root)));
    await writeStored(
        root,
        absolutePaths.map((p): string => path.relative(root, path.resolve(p)).split(path.sep).join('/')),
    );
}

/**
 * Where a missing bookmark went: the one vault file whose path ends with the longest tail of the
 * old one (`Personal/The Day.md`, then `The Day.md`). Two files sharing that tail is a guess, so null.
 */
function findMoved(entry: string, vaultFiles: string[]): string | null {
    const parts = entry.split(/[\\/]/).filter((part): boolean => part !== '');
    for (let start = 0; start < parts.length; start++) {
        const tail = parts.slice(start).join('/');
        const matches = vaultFiles.filter((file): boolean => file === tail || file.endsWith(`/${tail}`));
        if (matches.length > 1) return null;
        if (matches.length === 1) return matches[0] ?? null;
    }
    return null;
}

function bookmarksFile(root: string): string {
    return path.join(vaultMetaDir(root), 'bookmarks.json');
}

async function readStored(root: string): Promise<string[]> {
    try {
        const parsed: unknown = JSON.parse(await fs.readFile(bookmarksFile(root), 'utf-8'));
        return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
    } catch {
        // No bookmarks yet, or a file that isn't a list: both read as no bookmarks.
        return [];
    }
}

async function writeStored(root: string, relativePaths: string[]): Promise<void> {
    const target = bookmarksFile(root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(relativePaths, null, 2), 'utf-8');
    await fs.rename(temporary, target);
}

/** A stored entry as a vault-relative path: older files hold absolute ones. Null when it points outside. */
function toRelative(entry: string, root: string): string | null {
    const relative = path.relative(root, path.resolve(root, entry));
    const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    return relative === '' || outside ? null : relative.split(path.sep).join('/');
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}
