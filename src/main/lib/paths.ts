/**
 * App path constants and resolution helpers — pure Node, no Electron imports.
 * Used by ai-service, speech-service, and systemPrompt-service.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { log } from '@/main/lib/logger';

// ─── Phylla user directory: ~/.phylla/ ───────────────────────────────────────
// All user-owned, user-editable Phylla data lives under here.
//   ~/.phylla/models/      → GGUF model files
//   ~/.phylla/prompts/     → markdown system prompts (one per template)
//   ~/.phylla/themes/      → JSON theme presets
//   ~/.phylla/locales/     → JSON language files
//   ~/.phylla/state.json   → small key/value file (active prompt id, etc.)
export const PHYLLA_HOME: string = path.join(os.homedir(), '.phylla');

// Directory where the user stores their GGUF models: ~/.phylla/models/
export const DEFAULT_MODELS_DIR: string = path.join(PHYLLA_HOME, 'models');

// Directory where system-prompt templates live: ~/.phylla/prompts/
export const PROMPTS_DIR: string = path.join(PHYLLA_HOME, 'prompts');

// Directory where user-editable theme presets live: ~/.phylla/themes/
export const THEMES_DIR: string = path.join(PHYLLA_HOME, 'themes');

// Directory where user-editable language files live: ~/.phylla/locales/
export const LOCALES_DIR: string = path.join(PHYLLA_HOME, 'locales');

// Persistent app state (active prompt id, active theme id, etc.): ~/.phylla/state.json
export const STATE_FILE: string = path.join(PHYLLA_HOME, 'state.json');

// Legacy locations from before the rename (Leaf → Phylla) and the ~/.phylla/ consolidation.
const LEGACY_HOME: string = path.join(os.homedir(), '.leaf');
const LEGACY_MODELS_DIR: string = path.join(os.homedir(), 'leaf-models');

// Per-vault metadata folder (bookmarks), under its current and pre-rename names.
export const VAULT_META_DIRS: ReadonlySet<string> = new Set(['.phylla', '.leaf']);

/** Migrate `~/.leaf/` → `~/.phylla/` and `~/leaf-models/` → `~/.phylla/models/`; runs before any service touches PHYLLA_HOME. */
export function migrateLegacyPaths(): void {
    moveIfAbsent(LEGACY_HOME, PHYLLA_HOME);
    moveIfAbsent(LEGACY_MODELS_DIR, DEFAULT_MODELS_DIR);
}

/** Move a pre-rename userData dir's entries into the current one — per entry, as Chromium may have created it already. */
export function migrateLegacyUserData(legacyDir: string, userDataDir: string): void {
    try {
        if (fs.existsSync(legacyDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
            for (const entry of fs.readdirSync(legacyDir)) {
                moveIfAbsent(path.join(legacyDir, entry), path.join(userDataDir, entry));
            }
        }
    } catch (err) {
        log.error('[paths] Legacy userData migration failed:', err);
    }
    const partitions = path.join(userDataDir, 'Partitions');
    moveIfAbsent(path.join(partitions, 'leaf'), path.join(partitions, 'phylla'));
}

/** `<vault>/.phylla/`, moving a pre-rename `<vault>/.leaf/` into place first. */
export function vaultMetaDir(root: string): string {
    const dir = path.join(root, '.phylla');
    moveIfAbsent(path.join(root, '.leaf'), dir);
    return dir;
}

/**
 * Resolve the bundled prompt-templates directory shipped with the app.
 * In development  →  <repo>/assets/prompts/
 * In production   →  <app>/Contents/Resources/assets/prompts/
 */
export function getBundledPromptsDir(): string {
    const devPath = path.join(import.meta.dirname, '../../assets/prompts');

    const resources = resourcesPath();
    if (resources !== undefined) {
        const prodPath = path.join(resources, 'assets/prompts');
        if (fs.existsSync(prodPath)) return prodPath;
    }

    return devPath;
}

/**
 * Resolve the bundled theme presets directory shipped with the app.
 * In development  →  <repo>/assets/themes/
 * In production   →  <app>/Contents/Resources/assets/themes/
 */
export function getBundledThemesDir(): string {
    const devPath = path.join(import.meta.dirname, '../../assets/themes');

    const resources = resourcesPath();
    if (resources !== undefined) {
        const prodPath = path.join(resources, 'assets/themes');
        if (fs.existsSync(prodPath)) return prodPath;
    }

    return devPath;
}

/**
 * Resolve the bundled language files directory shipped with the app.
 * In development  →  <repo>/assets/locales/
 * In production   →  <app>/Contents/Resources/assets/locales/
 */
export function getBundledLocalesDir(): string {
    const devPath = path.join(import.meta.dirname, '../../assets/locales');

    const resources = resourcesPath();
    if (resources !== undefined) {
        const prodPath = path.join(resources, 'assets/locales');
        if (fs.existsSync(prodPath)) return prodPath;
    }

    return devPath;
}

/**
 * Resolve the bundled Whisper model directory.
 * In development  →  <repo>/models/whisper/
 * In production   →  <app>/Contents/Resources/models/whisper/
 *
 * After electron-vite bundles everything to out/main/index.js,
 * import.meta.dirname points to out/main/, so ../../ reaches the repo root.
 */
export function getWhisperModelDir(): string {
    const devPath = path.join(import.meta.dirname, '../../models/whisper');

    const resources = resourcesPath();
    if (resources !== undefined) {
        const prodPath = path.join(resources, 'models/whisper');
        if (fs.existsSync(prodPath)) {
            log.info('[paths] Whisper model → production:', prodPath);
            return prodPath;
        }
        log.warn('[paths] Production model path not found, falling back to dev:', devPath);
    }

    log.info('[paths] Whisper model → dev:', devPath);
    return devPath;
}

/**
 * Electron's resources directory. Electron types it as always set, but this module is pure Node
 * and also runs without Electron (under Vitest), where it is undefined.
 */
function resourcesPath(): string | undefined {
    return process.resourcesPath;
}

/** Rename `from` → `to` unless `to` exists; logs instead of throwing so startup is never blocked. */
function moveIfAbsent(from: string, to: string): void {
    try {
        if (!fs.existsSync(from)) return;
        if (fs.existsSync(to)) {
            log.info('[paths] Both legacy and new paths exist — leaving legacy alone.', { from, to });
            return;
        }
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        log.info('[paths] Migrated legacy path', { from, to });
    } catch (err) {
        log.error('[paths] Legacy path migration failed:', err);
    }
}
