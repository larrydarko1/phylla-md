/**
 * Media Service — owns IPC handlers for audio recording saves and spellcheck suggestions.
 */

import fs from 'fs/promises';
import path from 'path';

import { ipcFailure } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { assertSafeFileName, resolveInsideBoundary } from '@/main/lib/validation';
import type { AudioSaveResult } from '@/schemas/vault';

// The vault root is passed in from the register call so media-service
// can validate that audio recordings are written inside the vault.
let findVaultRoot: (() => string | null) | null = null;

export function register(ipc: IpcMain, vaultRootFn: () => string | null): void {
    findVaultRoot = vaultRootFn;

    // Save an audio recording (base64-encoded WAV) to the vault
    ipc.handle(
        'audio:saveRecording',
        async (_event, folderPath: unknown, fileName: unknown, base64Data: unknown): Promise<AudioSaveResult> => {
            if (typeof folderPath !== 'string' || typeof fileName !== 'string' || typeof base64Data !== 'string') {
                return { success: false, error: 'INVALID_ARGUMENTS' };
            }
            try {
                // Only allow safe filenames (no path traversal)
                assertSafeFileName(fileName);

                // Validate target folder is inside the active vault
                const vaultRoot = findVaultRoot?.();
                if (vaultRoot === undefined || vaultRoot === null) return { success: false, error: 'NO_VAULT' };
                const filePath = await resolveInsideBoundary(path.join(folderPath, fileName), vaultRoot);
                await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
                return { success: true, path: filePath };
            } catch (error) {
                return ipcFailure('media audio:saveRecording', error);
            }
        },
    );
}
