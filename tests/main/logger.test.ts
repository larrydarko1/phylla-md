import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '0.0.0'), on: vi.fn(), isPackaged: false },
}));

describe('logger', () => {
    it('caps log files at 1 MB so they cannot grow unbounded', async () => {
        const { log } = await import('@/main/lib/logger');

        expect(log.transports.file.maxSize).toBe(1024 * 1024);
    });

    it('exposes the standard log levels used across the main process', async () => {
        const { log } = await import('@/main/lib/logger');

        for (const level of ['info', 'warn', 'error', 'debug'] as const) expect(typeof log[level]).toBe('function');
    });
});
