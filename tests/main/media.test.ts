import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply, readReplyWith } from './test-utils';
import { register } from '@/main/services/media';

vi.mock('electron', () => ({}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let tmpDir: string;
let vaultRoot: string | null;
let ipc: ReturnType<typeof createFakeIpc>;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phylla-media-'));
    vaultRoot = tmpDir;

    ipc = createFakeIpc();
    register(ipc, () => vaultRoot);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('audio:saveRecording', () => {
    it('saves a base64-encoded file inside the vault', async () => {
        const fileName = 'recording.wav';
        const base64 = Buffer.from('audio data').toString('base64');
        const result = readReplyWith(await ipc.invoke('audio:saveRecording', vaultRoot, fileName, base64), {
            path: z.string(),
        });
        expect(result.success).toBe(true);
        expect(fs.existsSync(result.path)).toBe(true);
    });

    it('saves into a subdirectory of the vault', async () => {
        const subDir = path.join(tmpDir, 'recordings');
        fs.mkdirSync(subDir);
        const base64 = Buffer.from('audio').toString('base64');
        const result = readReply(await ipc.invoke('audio:saveRecording', subDir, 'rec.wav', base64));
        expect(result.success).toBe(true);
    });

    it('rejects a filename with path traversal', async () => {
        const base64 = Buffer.from('x').toString('base64');
        const result = readReply(await ipc.invoke('audio:saveRecording', vaultRoot, '../evil.wav', base64));
        expect(result.success).toBe(false);
    });

    it('rejects a folder path outside the vault', async () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        const base64 = Buffer.from('x').toString('base64');
        const result = readReply(await ipc.invoke('audio:saveRecording', outsideDir, 'rec.wav', base64));
        fs.rmSync(outsideDir, { recursive: true, force: true });
        expect(result.success).toBe(false);
        expect(result.error).toBe('ACCESS_DENIED');
    });

    it('rejects when no vault is open', async () => {
        vaultRoot = null;
        const base64 = Buffer.from('x').toString('base64');
        const result = readReply(await ipc.invoke('audio:saveRecording', tmpDir, 'rec.wav', base64));
        expect(result.success).toBe(false);
    });

    it('rejects non-string arguments', async () => {
        const result = readReply(await ipc.invoke('audio:saveRecording', 123, 'rec.wav', 'base64'));
        expect(result.success).toBe(false);
    });
});
