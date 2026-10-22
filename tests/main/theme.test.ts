import fs from 'fs';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply } from './test-utils';

const PATHS = vi.hoisted(() => {
    const { join } = process.getBuiltinModule('path');
    const { tmpdir } = process.getBuiltinModule('os');
    const tmpRoot = join(tmpdir(), `phylla-theme-test-${process.pid}-${Date.now()}`);
    const phyllaHome = join(tmpRoot, '.phylla');
    return {
        PHYLLA_HOME: phyllaHome,
        THEMES_DIR: join(phyllaHome, 'themes'),
        STATE_FILE: join(phyllaHome, 'state.json'),
        BUNDLED_DIR: join(tmpRoot, 'bundled-themes'),
    };
});

vi.mock('electron', () => ({
    shell: { openPath: vi.fn().mockResolvedValue('') },
}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/main/lib/paths', () => ({
    PHYLLA_HOME: PATHS.PHYLLA_HOME,
    THEMES_DIR: PATHS.THEMES_DIR,
    STATE_FILE: PATHS.STATE_FILE,
    getBundledThemesDir: () => PATHS.BUNDLED_DIR,
}));

const { PHYLLA_HOME, THEMES_DIR, STATE_FILE, BUNDLED_DIR } = PATHS;

function resetDirs() {
    fs.rmSync(PHYLLA_HOME, { recursive: true, force: true });
    fs.rmSync(BUNDLED_DIR, { recursive: true, force: true });
    fs.mkdirSync(BUNDLED_DIR, { recursive: true });
}

function writeBundledTheme(id: string, content: Record<string, unknown>) {
    fs.writeFileSync(path.join(BUNDLED_DIR, `${id}.json`), JSON.stringify(content));
}

function writeState(state: Record<string, unknown>) {
    fs.mkdirSync(PHYLLA_HOME, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function writeTheme(id: string, content: Record<string, unknown>) {
    fs.mkdirSync(THEMES_DIR, { recursive: true });
    fs.writeFileSync(path.join(THEMES_DIR, `${id}.json`), JSON.stringify(content));
}

async function freshModule() {
    vi.resetModules();
    return await import('@/main/services/theme');
}

async function freshHandlers() {
    const { register } = await freshModule();
    const handlers = createFakeIpc();
    register(handlers);
    return handlers;
}

beforeEach(() => {
    resetDirs();
});

afterEach(() => {
    fs.rmSync(PHYLLA_HOME, { recursive: true, force: true });
    fs.rmSync(BUNDLED_DIR, { recursive: true, force: true });
});

describe('seeding, via theme:list', () => {
    it('copies bundled themes into THEMES_DIR', async () => {
        writeBundledTheme('dark', { name: 'Dark', colors: { bg: '#000' } });
        const handlers = await freshHandlers();
        await handlers.invoke('theme:list');
        expect(fs.existsSync(path.join(THEMES_DIR, 'dark.json'))).toBe(true);
    });

    it('does not overwrite existing user themes', async () => {
        writeBundledTheme('dark', { name: 'Dark', colors: { bg: '#000' } });
        writeTheme('dark', { name: 'Custom Dark', colors: { bg: '#111' } });
        const handlers = await freshHandlers();
        await handlers.invoke('theme:list');
        const content: unknown = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, 'dark.json'), 'utf-8'));
        expect(content).toMatchObject({ name: 'Custom Dark' });
    });

    it('is idempotent — runs seeding only once', async () => {
        writeBundledTheme('dark', { name: 'Dark', colors: {} });
        const handlers = await freshHandlers();
        await handlers.invoke('theme:list');
        writeBundledTheme('light', { name: 'Light', colors: {} });
        await handlers.invoke('theme:list');
        expect(fs.existsSync(path.join(THEMES_DIR, 'light.json'))).toBe(false);
    });

    it('handles a missing bundled dir gracefully', async () => {
        fs.rmSync(BUNDLED_DIR, { recursive: true, force: true });
        const handlers = await freshHandlers();
        await expect(handlers.invoke('theme:list')).resolves.toMatchObject({ success: true });
    });
});

describe('register — theme:list', () => {
    it('returns the list of themes and the active theme id', async () => {
        writeTheme('dark', { name: 'Dark', description: 'Dark theme', colors: { bg: '#000' } });
        writeState({ activeTheme: 'dark' });
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = z
            .object({ success: z.boolean(), themes: z.array(z.object({ id: z.string() })), activeId: z.string() })
            .parse(await handlers.invoke('theme:list'));
        expect(result.success).toBe(true);
        expect(result.themes).toHaveLength(1);
        expect(result.themes[0]!.id).toBe('dark');
        expect(result.activeId).toBe('dark');
    });

    it('returns dark as the default activeId when state has no activeTheme', async () => {
        writeTheme('dark', { name: 'Dark', colors: {} });
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = z.object({ activeId: z.string() }).parse(await handlers.invoke('theme:list'));
        expect(result.activeId).toBe('dark');
    });

    it('pins dark theme first, then alphabetical order', async () => {
        writeTheme('dark', { name: 'Dark', colors: {} });
        writeTheme('aurora', { name: 'Aurora', colors: {} });
        writeTheme('zen', { name: 'Zen', colors: {} });
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = z
            .object({ themes: z.array(z.object({ id: z.string() })) })
            .parse(await handlers.invoke('theme:list'));
        const ids = result.themes.map((t) => t.id);
        expect(ids[0]).toBe('dark');
        expect(ids[1]).toBe('aurora');
        expect(ids[2]).toBe('zen');
    });

    it('skips files with invalid JSON', async () => {
        writeTheme('dark', { name: 'Dark', colors: {} });
        fs.writeFileSync(path.join(THEMES_DIR, 'bad.json'), 'not json');
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = z.object({ themes: z.array(z.unknown()) }).parse(await handlers.invoke('theme:list'));
        expect(result.themes).toHaveLength(1);
    });

    it('strips unsafe color keys', async () => {
        writeTheme('dark', { name: 'Dark', colors: { 'bg-primary': '#000', '../../evil': 'red' } });
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = z
            .object({ themes: z.array(z.object({ colors: z.record(z.string(), z.string()) })) })
            .parse(await handlers.invoke('theme:list'));
        const colors = result.themes[0]!.colors;
        expect(colors['bg-primary']).toBe('#000');
        expect(colors['../../evil']).toBeUndefined();
    });
});

describe('register — theme:setActive', () => {
    it('persists the active theme id', async () => {
        writeTheme('dark', { name: 'Dark', colors: {} });
        const { register } = await freshModule();

        const handlers = createFakeIpc();
        register(handlers);

        const result = readReply(await handlers.invoke('theme:setActive', 'dark'));
        expect(result.success).toBe(true);
        const state = z.object({ activeTheme: z.string() }).parse(JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')));
        expect(state.activeTheme).toBe('dark');
    });

    it('rejects a theme id with path traversal characters', async () => {
        const { register } = await freshModule();
        const handlers = createFakeIpc();
        register(handlers);

        const result = readReply(await handlers.invoke('theme:setActive', '../evil'));
        expect(result.success).toBe(false);
    });

    it('rejects an id longer than 64 characters', async () => {
        const { register } = await freshModule();
        const handlers = createFakeIpc();
        register(handlers);

        const result = readReply(await handlers.invoke('theme:setActive', 'a'.repeat(65)));
        expect(result.success).toBe(false);
    });

    it('rejects a non-existent theme id', async () => {
        const { register } = await freshModule();
        const handlers = createFakeIpc();
        register(handlers);

        const result = readReply(await handlers.invoke('theme:setActive', 'nonexistent'));
        expect(result.success).toBe(false);
    });
});
