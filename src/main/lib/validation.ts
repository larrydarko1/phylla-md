/**
 * Input validation helpers for IPC handlers — keeps security checks
 * consistent across all service modules.
 */

import { lstat, realpath } from 'fs/promises';
import path from 'path';

import { IpcError } from '@/main/lib/errors';

const ACCESS_DENIED = 'Access denied: path is outside the allowed directory.';

/**
 * Ensure `targetPath` really lies inside `rootDir`: symlinks are followed on both sides, so a
 * link inside the root that points outside it is refused, and one that stays inside is allowed.
 *
 * @returns The resolved path to operate on (as given, cleaned of `..`; links are not replaced).
 */
export async function resolveInsideBoundary(targetPath: string, rootDir: string): Promise<string> {
    const resolved = path.resolve(targetPath);
    const realRoot = await realpath(rootDir);
    const real = await realLocation(resolved);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new IpcError('ACCESS_DENIED', ACCESS_DENIED);
    return resolved;
}

/**
 * Ensure `name` is a plain filename with no directory separators or traversal.
 * Throws if `name` contains slashes or resolves differently from itself.
 */
export function assertSafeFileName(name: string): void {
    if (name === '' || path.basename(name) !== name) {
        throw new IpcError('INVALID_NAME', 'Invalid name: must be a plain filename without path separators.');
    }
}

/** Where `target` really is. A part that doesn't exist yet (a file about to be created) sits in its parent's real folder. */
async function realLocation(target: string): Promise<string> {
    try {
        return await realpath(target);
    } catch (error) {
        if (!isMissing(error)) throw error;
        // A link to a missing file can't be placed, and a write through it would create its target.
        const link = await lstat(target).then(
            (stats): boolean => stats.isSymbolicLink(),
            (): boolean => false,
        );
        if (link) throw new IpcError('ACCESS_DENIED', ACCESS_DENIED);
        const parent = path.dirname(target);
        if (parent === target) throw error;
        return path.join(await realLocation(parent), path.basename(target));
    }
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
