import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    PHYLLA_HOME,
    DEFAULT_MODELS_DIR,
    PROMPTS_DIR,
    STATE_FILE,
    getWhisperModelDir,
    getBundledPromptsDir,
    getBundledThemesDir,
    getBundledLocalesDir,
    migrateLegacyPaths,
    migrateLegacyUserData,
} from '@/main/lib/paths';

vi.mock('electron', () => ({
    app: { getPath: vi.fn(), getVersion: vi.fn() },
}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    const existsSync = vi.fn(actual.existsSync);
    const mkdirSync = vi.fn(actual.mkdirSync);
    const renameSync = vi.fn(actual.renameSync);
    return {
        ...actual,
        existsSync,
        mkdirSync,
        renameSync,
        default: {
            ...actual,
            existsSync,
            mkdirSync,
            renameSync,
        },
    };
});

describe('paths', () => {
    describe('PHYLLA_HOME', () => {
        it('is ~/.phylla', () => {
            expect(PHYLLA_HOME).toBe(path.join(os.homedir(), '.phylla'));
        });
    });

    describe('DEFAULT_MODELS_DIR', () => {
        it('is under PHYLLA_HOME', () => {
            expect(DEFAULT_MODELS_DIR.startsWith(PHYLLA_HOME)).toBe(true);
        });

        it('equals ~/.phylla/models', () => {
            expect(DEFAULT_MODELS_DIR).toBe(path.join(os.homedir(), '.phylla', 'models'));
        });
    });

    describe('PROMPTS_DIR', () => {
        it('equals ~/.phylla/prompts', () => {
            expect(PROMPTS_DIR).toBe(path.join(os.homedir(), '.phylla', 'prompts'));
        });
    });

    describe('STATE_FILE', () => {
        it('equals ~/.phylla/state.json', () => {
            expect(STATE_FILE).toBe(path.join(os.homedir(), '.phylla', 'state.json'));
        });
    });

    describe('migrateLegacyPaths', () => {
        const legacyDir = path.join(os.homedir(), 'leaf-models');

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            vi.mocked(fs.mkdirSync).mockReset();
            vi.mocked(fs.renameSync).mockReset();
        });

        it('is a no-op when legacy dir does not exist', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            migrateLegacyPaths();
            expect(fs.renameSync).not.toHaveBeenCalled();
            expect(fs.mkdirSync).not.toHaveBeenCalled();
        });

        it('skips migration when both legacy and new dirs exist', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => {
                if (p === legacyDir) return true;
                if (p === DEFAULT_MODELS_DIR) return true;
                return false;
            });
            migrateLegacyPaths();
            expect(fs.renameSync).not.toHaveBeenCalled();
        });

        it('renames legacy → new when only legacy exists', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => p === legacyDir);
            vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
            vi.mocked(fs.renameSync).mockImplementation(() => undefined);
            migrateLegacyPaths();
            expect(fs.mkdirSync).toHaveBeenCalledWith(PHYLLA_HOME, { recursive: true });
            expect(fs.renameSync).toHaveBeenCalledWith(legacyDir, DEFAULT_MODELS_DIR);
        });

        it('renames ~/.leaf → ~/.phylla when only the legacy home exists', () => {
            const legacyHome = path.join(os.homedir(), '.leaf');
            vi.mocked(fs.existsSync).mockImplementation((p) => p === legacyHome);
            vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
            vi.mocked(fs.renameSync).mockImplementation(() => undefined);
            migrateLegacyPaths();
            expect(fs.renameSync).toHaveBeenCalledWith(legacyHome, PHYLLA_HOME);
        });

        it('swallows errors instead of throwing', () => {
            vi.mocked(fs.existsSync).mockImplementation((p) => p === legacyDir);
            vi.mocked(fs.renameSync).mockImplementation(() => {
                throw new Error('boom');
            });
            expect(() => migrateLegacyPaths()).not.toThrow();
        });
    });

    describe('migrateLegacyUserData', () => {
        let root: string;

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            vi.mocked(fs.mkdirSync).mockReset();
            vi.mocked(fs.renameSync).mockReset();
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'phylla-userdata-test-'));
        });

        afterEach(() => {
            fs.rmSync(root, { recursive: true, force: true });
        });

        it('moves legacy entries and the session partition into the new dir', () => {
            const legacy = path.join(root, 'Leaf');
            const current = path.join(root, 'Phylla');
            fs.mkdirSync(path.join(legacy, 'conversations'), { recursive: true });
            fs.mkdirSync(path.join(legacy, 'Partitions', 'leaf'), { recursive: true });
            migrateLegacyUserData(legacy, current);
            expect(fs.existsSync(path.join(current, 'conversations'))).toBe(true);
            expect(fs.existsSync(path.join(current, 'Partitions', 'phylla'))).toBe(true);
            expect(fs.existsSync(path.join(current, 'Partitions', 'leaf'))).toBe(false);
        });

        it('keeps entries the new dir already has', () => {
            const legacy = path.join(root, 'Leaf');
            const current = path.join(root, 'Phylla');
            fs.mkdirSync(path.join(legacy, 'Crashpad'), { recursive: true });
            fs.mkdirSync(path.join(legacy, 'conversations'), { recursive: true });
            fs.mkdirSync(path.join(current, 'Crashpad'), { recursive: true });
            migrateLegacyUserData(legacy, current);
            expect(fs.existsSync(path.join(legacy, 'Crashpad'))).toBe(true);
            expect(fs.existsSync(path.join(current, 'conversations'))).toBe(true);
        });

        it('is a no-op when there is no legacy dir', () => {
            const current = path.join(root, 'Phylla');
            migrateLegacyUserData(path.join(root, 'Leaf'), current);
            expect(fs.existsSync(current)).toBe(false);
        });
    });

    describe('getWhisperModelDir', () => {
        const originalResourcesPath = process.resourcesPath;

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        afterEach(() => {
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        it('returns dev path when resourcesPath is undefined', () => {
            (process as { resourcesPath?: string | undefined }).resourcesPath = undefined;
            const result = getWhisperModelDir();
            expect(result).toContain('models/whisper');
            expect(result).not.toContain('Resources/models');
        });

        it('returns production path when resourcesPath is set and path exists', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(true);

            const result = getWhisperModelDir();
            expect(result).toBe(path.join('/app/Contents/Resources', 'models/whisper'));
        });

        it('falls back to dev path when resourcesPath is set but path does not exist', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result = getWhisperModelDir();
            expect(result).toContain('models/whisper');
            expect(result).not.toContain('/app/Contents/Resources');
        });
    });

    describe('getBundledThemesDir', () => {
        const originalResourcesPath = process.resourcesPath;

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        afterEach(() => {
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        it('returns dev path when resourcesPath is undefined', () => {
            (process as { resourcesPath?: string | undefined }).resourcesPath = undefined;
            const result = getBundledThemesDir();
            expect(result).toContain('assets/themes');
        });

        it('returns production path when resourcesPath is set and path exists', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const result = getBundledThemesDir();
            expect(result).toBe(path.join('/app/Contents/Resources', 'assets/themes'));
        });

        it('falls back to dev path when production path does not exist', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const result = getBundledThemesDir();
            expect(result).toContain('assets/themes');
            expect(result).not.toContain('/app/Contents/Resources');
        });
    });

    describe('getBundledLocalesDir', () => {
        const originalResourcesPath = process.resourcesPath;

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        afterEach(() => {
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        it('returns dev path when resourcesPath is undefined', () => {
            (process as { resourcesPath?: string | undefined }).resourcesPath = undefined;
            const result = getBundledLocalesDir();
            expect(result).toContain('assets/locales');
        });

        it('returns production path when resourcesPath is set and path exists', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const result = getBundledLocalesDir();
            expect(result).toBe(path.join('/app/Contents/Resources', 'assets/locales'));
        });

        it('falls back to dev path when production path does not exist', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const result = getBundledLocalesDir();
            expect(result).toContain('assets/locales');
            expect(result).not.toContain('/app/Contents/Resources');
        });
    });

    describe('getBundledPromptsDir', () => {
        const originalResourcesPath = process.resourcesPath;

        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        afterEach(() => {
            (process as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
        });

        it('returns dev path when resourcesPath is undefined', () => {
            (process as { resourcesPath?: string | undefined }).resourcesPath = undefined;
            const result = getBundledPromptsDir();
            expect(result).toContain('assets/prompts');
        });

        it('returns production path when resourcesPath is set and path exists', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const result = getBundledPromptsDir();
            expect(result).toBe(path.join('/app/Contents/Resources', 'assets/prompts'));
        });

        it('falls back to dev path when production path does not exist', () => {
            (process as { resourcesPath?: string }).resourcesPath = '/app/Contents/Resources';
            vi.mocked(fs.existsSync).mockReturnValue(false);
            const result = getBundledPromptsDir();
            expect(result).toContain('assets/prompts');
            expect(result).not.toContain('/app/Contents/Resources');
        });
    });
});
