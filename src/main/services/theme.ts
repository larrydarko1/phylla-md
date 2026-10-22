/**
 * Theme Service — manages user-editable theme presets stored as JSON
 * files under ~/.phylla/themes/.
 *
 * Architecture mirrors systemPrompt.ts:
 *   - Each *.json file in ~/.phylla/themes/ is a theme preset.
 *   - ~/.phylla/state.json records which theme id is active.
 *   - Bundled defaults from <app>/assets/themes/ are copied in once on
 *     first launch; user edits are never overwritten.
 *
 * Theme JSON shape:
 *   {
 *     "name": "Dark",
 *     "description": "Optional human-readable description",
 *     "colors": {
 *        "text1": "#ffffff",
 *        "bg-primary": "#1e1e1e",
 *        ...
 *     }
 *   }
 *
 * The renderer is responsible for applying `colors` to :root as CSS
 * custom properties.
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { shell } from 'electron';

import { readState as readRawState, updateState } from '@/main/lib/appState';
import { toIpcErrorCode, ipcFailure } from '@/main/lib/errors';
import type { IpcMain } from '@/main/lib/ipc';
import { log } from '@/main/lib/logger';
import { THEMES_DIR, getBundledThemesDir } from '@/main/lib/paths';
import type { AiSimpleResult } from '@/schemas/ai';
import type { IpcErrorCode } from '@/schemas/errors';
import { JsonObjectSchema } from '@/schemas/json';
import { type ThemeInfo, type ThemeState, ThemeStateSchema } from '@/schemas/vault';

const DEFAULT_THEME_ID = 'dark';
const THEME_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
let seedPromise: Promise<void> | null = null;

export function register(ipc: IpcMain): void {
    ipc.handle(
        'theme:list',
        async (): Promise<
            | { success: boolean; themes: ThemeInfo[]; activeId: string; themesDir: string; error?: undefined }
            | { success: boolean; error: IpcErrorCode; themes: never[]; activeId: string; themesDir: string }
        > => {
            try {
                const themes = await listThemes();
                const state = await readState();
                return {
                    success: true,
                    themes,
                    activeId: typeof state.activeTheme === 'string' ? state.activeTheme : DEFAULT_THEME_ID,
                    themesDir: THEMES_DIR,
                };
            } catch (err) {
                log.error('[theme] list failed:', err);
                return {
                    success: false,
                    error: toIpcErrorCode(err),
                    themes: [],
                    activeId: DEFAULT_THEME_ID,
                    themesDir: THEMES_DIR,
                };
            }
        },
    );

    ipc.handle('theme:setActive', async (_event, id: unknown): Promise<AiSimpleResult> => {
        if (typeof id !== 'string' || !isValidThemeId(id)) {
            return { success: false, error: 'INVALID_ARGUMENTS' };
        }
        const file = path.join(THEMES_DIR, `${id}.json`);
        if (!existsSync(file)) return { success: false, error: 'NOT_FOUND' };
        try {
            await updateState((s): { activeTheme: string } => ({ ...s, activeTheme: id }));
            return { success: true };
        } catch (err) {
            return ipcFailure('theme theme:setActive', err);
        }
    });

    ipc.handle('theme:openPhyllaDir', async (): Promise<AiSimpleResult> => {
        try {
            await fs.mkdir(THEMES_DIR, { recursive: true });
            await shell.openPath(THEMES_DIR);
            return { success: true };
        } catch (err) {
            return ipcFailure('theme theme:openPhyllaDir', err);
        }
    });
}

/**
 * Idempotent: copy bundled theme files into ~/.phylla/themes/ if absent.
 *
 * Memoised on the in-flight promise (not a boolean flag) so concurrent callers
 * all await the same run instead of racing through the copy loop. The "start
 * it once" decision happens synchronously, before any await. Resets to null on
 * failure so a later call can retry.
 */
function ensureSeeded(): Promise<void> {
    seedPromise ??= doSeed().catch((err: unknown): void => {
        seedPromise = null;
        log.error('[theme] seeding failed:', err);
    });
    return seedPromise;
}

async function doSeed(): Promise<void> {
    await fs.mkdir(THEMES_DIR, { recursive: true });

    const bundled = getBundledThemesDir();
    if (existsSync(bundled)) {
        const entries = await fs.readdir(bundled, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
            const dest = path.join(THEMES_DIR, entry.name);
            if (existsSync(dest)) continue;
            await fs.copyFile(path.join(bundled, entry.name), dest);
            log.info('[theme] Seeded theme file', { file: entry.name });
        }
    }
}

async function listThemes(): Promise<ThemeInfo[]> {
    await ensureSeeded();
    let entries;
    try {
        entries = await fs.readdir(THEMES_DIR, { withFileTypes: true });
    } catch {
        return [];
    }

    const list: ThemeInfo[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
        const id = entry.name.replace(/\.json$/i, '');
        if (!isValidThemeId(id)) continue;

        const file = path.join(THEMES_DIR, entry.name);
        try {
            const raw = await fs.readFile(file, 'utf-8');
            const parsed = JSON.parse(raw) as unknown;
            const info = normalizeTheme(id, file, parsed);
            if (info !== null) list.push(info);
        } catch (err) {
            log.warn('[theme] failed to parse theme file', { file: entry.name }, err);
        }
    }

    list.sort((a, b): number => {
        // Pin "dark" first, then alphabetical.
        if (a.id === DEFAULT_THEME_ID && b.id !== DEFAULT_THEME_ID) return -1;
        if (b.id === DEFAULT_THEME_ID && a.id !== DEFAULT_THEME_ID) return 1;
        return a.name.localeCompare(b.name);
    });
    return list;
}

function normalizeTheme(id: string, filePath: string, raw: unknown): ThemeInfo | null {
    const parsed = JsonObjectSchema.safeParse(raw);
    if (!parsed.success) return null;
    const obj = parsed.data;

    const rawName = obj['name'];
    const rawDescription = obj['description'];
    const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : id;
    const description = typeof rawDescription === 'string' ? rawDescription.trim() : '';

    const colorsRaw = JsonObjectSchema.safeParse(obj['colors']);
    const colors: Record<string, string> = {};
    if (colorsRaw.success) {
        for (const [key, value] of Object.entries(colorsRaw.data)) {
            if (typeof value !== 'string') continue;
            // Only allow safe CSS-variable keys (letters, digits, dashes, underscore).
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) continue;
            colors[key] = value;
        }
    }

    return { id, name, description, colors, path: filePath };
}

/** Read the shared state file and validate the theme-relevant view of it. */
async function readState(): Promise<ThemeState> {
    const raw = await readRawState();
    const result = ThemeStateSchema.safeParse(raw);
    if (result.success) return result.data;
    log.warn('[theme] state validation failed:', result.error);
    return {};
}

function isValidThemeId(id: string): boolean {
    return THEME_ID_PATTERN.test(id) && id.length > 0 && id.length <= 64;
}
