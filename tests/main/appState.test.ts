import fs from 'fs';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PATHS = vi.hoisted(() => {
    const { join } = process.getBuiltinModule('path');
    const { tmpdir } = process.getBuiltinModule('os');
    const tmpRoot = join(tmpdir(), `phylla-appstate-test-${process.pid}-${Date.now()}`);
    const phyllaHome = join(tmpRoot, '.phylla');
    return {
        TMP_ROOT: tmpRoot,
        PHYLLA_HOME: phyllaHome,
        STATE_FILE: join(phyllaHome, 'state.json'),
    };
});

vi.mock('@/main/lib/paths', () => ({
    PHYLLA_HOME: PATHS.PHYLLA_HOME,
    STATE_FILE: PATHS.STATE_FILE,
}));

const { PHYLLA_HOME, STATE_FILE } = PATHS;

function resetTmp() {
    fs.rmSync(PHYLLA_HOME, { recursive: true, force: true });
}

beforeEach(() => {
    resetTmp();
    vi.resetModules();
});

afterEach(() => {
    resetTmp();
});

describe('appState', () => {
    it('readState returns {} when the file does not exist', async () => {
        const { readState } = await import('@/main/lib/appState');
        expect(await readState()).toEqual({});
    });

    it('updateState creates the file and persists the mutation', async () => {
        const { readState, updateState } = await import('@/main/lib/appState');
        await updateState((s) => ({ ...s, activePrompt: 'coding' }));

        expect(await readState()).toEqual({ activePrompt: 'coding' });
        const onDisk: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        expect(onDisk).toMatchObject({ activePrompt: 'coding' });
    });

    it('preserves keys written by other services (no clobbering)', async () => {
        const { readState, updateState } = await import('@/main/lib/appState');
        await updateState((s) => ({ ...s, activeTheme: 'dark' }));
        await updateState((s) => ({ ...s, activeLanguage: 'en' }));
        await updateState((s) => ({ ...s, activePrompt: 'default' }));

        expect(await readState()).toEqual({
            activeTheme: 'dark',
            activeLanguage: 'en',
            activePrompt: 'default',
        });
    });

    it('serialises concurrent read-modify-writes without losing any of them', async () => {
        const { readState, updateState } = await import('@/main/lib/appState');
        await Promise.all([
            updateState((s) => ({ ...s, activeTheme: 'dark' })),
            updateState((s) => ({ ...s, activeLanguage: 'en' })),
            updateState((s) => ({ ...s, activePrompt: 'default' })),
        ]);

        expect(await readState()).toEqual({
            activeTheme: 'dark',
            activeLanguage: 'en',
            activePrompt: 'default',
        });
    });

    it('recovers from an unparseable state file by treating it as empty', async () => {
        fs.mkdirSync(PHYLLA_HOME, { recursive: true });
        fs.writeFileSync(STATE_FILE, '{ this is not json');
        const { readState, updateState } = await import('@/main/lib/appState');

        expect(await readState()).toEqual({});
        await updateState((s) => ({ ...s, activePrompt: 'default' }));
        expect(await readState()).toEqual({ activePrompt: 'default' });
    });

    it('does not leave the temp file behind after a write', async () => {
        const { updateState } = await import('@/main/lib/appState');
        await updateState((s) => ({ ...s, activeTheme: 'dark' }));

        const leftovers = fs.readdirSync(PHYLLA_HOME).filter((f) => f.includes('.tmp'));
        expect(leftovers).toEqual([]);
    });
});
