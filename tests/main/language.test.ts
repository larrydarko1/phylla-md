import fs from 'fs';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc } from './test-utils';

const PATHS = vi.hoisted(() => {
    const { join } = process.getBuiltinModule('path');
    const { tmpdir } = process.getBuiltinModule('os');
    const tmpRoot = join(tmpdir(), `phylla-language-test-${process.pid}-${Date.now()}`);
    const phyllaHome = join(tmpRoot, '.phylla');
    return {
        TMP_ROOT: tmpRoot,
        PHYLLA_HOME: phyllaHome,
        LOCALES_DIR: join(phyllaHome, 'locales'),
        STATE_FILE: join(phyllaHome, 'state.json'),
        BUNDLED_DIR: join(tmpRoot, 'bundled-locales'),
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
    LOCALES_DIR: PATHS.LOCALES_DIR,
    STATE_FILE: PATHS.STATE_FILE,
    getBundledLocalesDir: () => PATHS.BUNDLED_DIR,
}));

const { PHYLLA_HOME, LOCALES_DIR, STATE_FILE, BUNDLED_DIR } = PATHS;

function resetTmp() {
    fs.rmSync(PHYLLA_HOME, { recursive: true, force: true });
    fs.rmSync(BUNDLED_DIR, { recursive: true, force: true });
    fs.mkdirSync(BUNDLED_DIR, { recursive: true });
}

function writeBundledLocale(id: string, content: Record<string, unknown>) {
    fs.writeFileSync(path.join(BUNDLED_DIR, `${id}.json`), JSON.stringify(content));
}

function writeState(state: Record<string, unknown>) {
    fs.mkdirSync(PHYLLA_HOME, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function freshService() {
    const { register } = await import('@/main/services/language');
    const handlers = createFakeIpc();
    register(handlers);
    return {
        list: () =>
            handlers.invoke('language:list').then((reply) =>
                z
                    .object({
                        success: z.boolean(),
                        languages: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
                        activeId: z.string(),
                        localesDir: z.string(),
                        error: z.string().optional(),
                    })
                    .parse(reply),
            ),
        setActive: (id: unknown) =>
            handlers
                .invoke('language:setActive', id)
                .then((reply) => z.object({ success: z.boolean(), error: z.string().optional() }).parse(reply)),
        load: (id: unknown) =>
            handlers.invoke('language:load', id).then((reply) =>
                z
                    .object({
                        success: z.boolean(),
                        content: z.record(z.string(), z.unknown()).optional(),
                        error: z.string().optional(),
                    })
                    .parse(reply),
            ),
    };
}

beforeEach(() => {
    resetTmp();
    vi.resetModules();
});

afterEach(() => {
    resetTmp();
});

describe('language service', () => {
    it('ensures locales directory exists on first seeding', async () => {
        writeBundledLocale('en', { common: { save: 'Save' } });
        const svc = await freshService();
        await svc.list();
        expect(fs.existsSync(LOCALES_DIR)).toBe(true);
    });

    it('copies bundled locale files to ~/.phylla/locales/ on first seed', async () => {
        writeBundledLocale('en', { common: { save: 'Save' } });
        writeBundledLocale('it', { common: { save: 'Salva' } });
        const svc = await freshService();
        await svc.list();
        expect(fs.existsSync(path.join(LOCALES_DIR, 'en.json'))).toBe(true);
        expect(fs.existsSync(path.join(LOCALES_DIR, 'it.json'))).toBe(true);
    });

    it('preserves existing values but backfills missing keys when seeding', async () => {
        writeBundledLocale('en', { common: { save: 'Save' } });
        fs.mkdirSync(LOCALES_DIR, { recursive: true });
        fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ custom: true }));
        const svc = await freshService();
        await svc.list();
        const content: unknown = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf-8'));
        expect(content).toMatchObject({ custom: true });
        expect(content).toMatchObject({ common: { save: 'Save' } });
    });

    it('is idempotent — listing twice only copies once', async () => {
        writeBundledLocale('en', { common: { save: 'Save' } });
        const svc = await freshService();
        await svc.list();
        const stats1 = fs.statSync(path.join(LOCALES_DIR, 'en.json'));
        await new Promise((resolve) => setTimeout(resolve, 10));
        await svc.list();
        const stats2 = fs.statSync(path.join(LOCALES_DIR, 'en.json'));
        expect(stats1.mtimeMs).toBe(stats2.mtimeMs);
    });

    describe('language:list', () => {
        it('returns all language files from ~/.phylla/locales/', async () => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: {} }));
            fs.writeFileSync(path.join(LOCALES_DIR, 'it.json'), JSON.stringify({ common: {} }));
            const svc = await freshService();
            const result = await svc.list();
            expect(result.success).toBe(true);
            expect(result.languages).toHaveLength(2);
            const ids = result.languages?.map((l) => l.id).sort();
            expect(ids).toEqual(['en', 'it']);
        });

        it('returns active language id from state', async () => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: {} }));
            writeState({ activeLanguage: 'en' });
            const svc = await freshService();
            const result = await svc.list();
            expect(result.activeId).toBe('en');
        });

        it('defaults to "en" when activeLanguage is not in state', async () => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: {} }));
            writeState({});
            const svc = await freshService();
            const result = await svc.list();
            expect(result.activeId).toBe('en');
        });

        it('returns empty list when locales directory does not exist', async () => {
            const svc = await freshService();
            const result = await svc.list();
            expect(result.success).toBe(true);
            expect(result.languages).toEqual([]);
        });

        it('ignores non-.json files in locales directory', async () => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: {} }));
            fs.writeFileSync(path.join(LOCALES_DIR, 'README.md'), '# Locales');
            const svc = await freshService();
            const result = await svc.list();
            expect(result.languages).toHaveLength(1);
            expect(result.languages?.[0]!.id).toBe('en');
        });

        it('returns localesDir path in response', async () => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            const svc = await freshService();
            const result = await svc.list();
            expect(result.localesDir).toBe(LOCALES_DIR);
        });
    });

    describe('language:setActive', () => {
        beforeEach(() => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: {} }));
            fs.writeFileSync(path.join(LOCALES_DIR, 'it.json'), JSON.stringify({ common: {} }));
            writeState({});
        });

        it('updates activeLanguage in state', async () => {
            const svc = await freshService();
            await svc.setActive('it');
            const state: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            expect(state).toMatchObject({ activeLanguage: 'it' });
        });

        it('returns success when language file exists', async () => {
            const svc = await freshService();
            const result = await svc.setActive('it');
            expect(result.success).toBe(true);
        });

        it('returns error when language file does not exist', async () => {
            const svc = await freshService();
            const result = await svc.setActive('fr');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('rejects invalid language ids', async () => {
            const svc = await freshService();
            const result = await svc.setActive('../../../etc/passwd');
            expect(result.success).toBe(false);
        });

        it('preserves other state properties when updating activeLanguage', async () => {
            writeState({ activeTheme: 'dark', activePrompt: 'coding' });
            const svc = await freshService();
            await svc.setActive('it');
            const state: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            expect(state).toMatchObject({ activeLanguage: 'it' });
            expect(state).toMatchObject({ activeTheme: 'dark' });
            expect(state).toMatchObject({ activePrompt: 'coding' });
        });
    });

    describe('language id validation, via language:setActive', () => {
        it.each(['en', 'en_US', 'zh-Hans', 'pt_BR'])('accepts the well-formed id %s', async (id) => {
            const svc = await freshService();
            const result = await svc.setActive(id);
            expect(result.error).toBe('NOT_FOUND');
        });

        it.each(['../../../etc/passwd', '..\\windows\\system32'])('rejects the traversal attempt %s', async (id) => {
            const svc = await freshService();
            const result = await svc.setActive(id);
            expect(result.success).toBe(false);
            expect(result.error).toBe('INVALID_ARGUMENTS');
        });

        it.each(['en;rm -rf /', 'en`whoami`', 'en$(cat /etc/passwd)', ''])(
            'rejects the special-character id %s',
            async (id) => {
                const svc = await freshService();
                const result = await svc.setActive(id);
                expect(result.success).toBe(false);
                expect(result.error).toBe('INVALID_ARGUMENTS');
            },
        );

        it('rejects a non-string id before it reaches the service', async () => {
            const svc = await freshService();
            const result = await svc.setActive(123);
            expect(result.success).toBe(false);
            expect(result.error).toBe('INVALID_ARGUMENTS');
        });
    });

    describe('language:load', () => {
        beforeEach(() => {
            fs.mkdirSync(LOCALES_DIR, { recursive: true });
        });

        it('returns content for a valid existing language file', async () => {
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify({ common: { save: 'Save' } }));
            const svc = await freshService();
            const result = await svc.load('en');
            expect(result.success).toBe(true);
            expect(result.content?.['common']).toBeDefined();
        });

        it('returns failure for invalid language id', async () => {
            const svc = await freshService();
            const result = await svc.load('../../../etc/passwd');
            expect(result.success).toBe(false);
            expect(result.error).toBe('INVALID_ARGUMENTS');
        });

        it('returns failure when language file does not exist', async () => {
            const svc = await freshService();
            const result = await svc.load('fr');
            expect(result.success).toBe(false);
            expect(result.error).toBe('NOT_FOUND');
        });

        it('returns failure when file contains invalid JSON', async () => {
            fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), 'not valid json{{');
            const svc = await freshService();
            const result = await svc.load('en');
            expect(result.success).toBe(false);
        });
    });

    describe('register', () => {
        it('registers all language IPC handlers', async () => {
            const { register } = await import('@/main/services/language');
            const handles: string[] = [];
            const ipc = {
                handle: vi.fn((ch: string) => {
                    handles.push(ch);
                }),
                on: vi.fn(),
            };
            register(ipc);
            expect(handles).toContain('language:list');
            expect(handles).toContain('language:setActive');
            expect(handles).toContain('language:load');
            expect(handles).toContain('language:openPhyllaDir');
        });
    });
});
