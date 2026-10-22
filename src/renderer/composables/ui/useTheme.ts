/**
 * useTheme — manages the active theme preset.
 *
 * The library of themes lives at ~/.phylla/themes/*.json and is hand-edited
 * by the user. This composable lists them, applies the active one to
 * <html> by setting CSS custom properties + data-theme, and switches active.
 *
 * Architecture mirrors useSystemPrompt.
 */

import { ref, type Ref } from 'vue';

import type { ThemeInfo } from '@/schemas/vault';

type UseThemeReturn = {
    themes: Ref<ThemeInfo[]>;
    activeId: Ref<string>;
    isLoading: Ref<boolean>;
    refresh: () => Promise<void>;
    setActive: (id: string) => Promise<boolean>;
    openThemesFolder: () => Promise<void>;
};

const ACTIVE_ID_LS_KEY = 'phylla-theme-id';

// Singleton state — one theme applies app-wide.
const themes = ref<ThemeInfo[]>([]);
const activeId = ref<string>('dark');
const isLoading = ref(false);

export function useTheme(): UseThemeReturn {
    async function refresh(): Promise<void> {
        isLoading.value = true;
        try {
            const result = await window.electronAPI.themeList();
            if (result.success) {
                themes.value = result.themes;
                activeId.value = result.activeId;
                const active = result.themes.find((t): boolean => t.id === result.activeId) ?? result.themes[0];
                if (active !== undefined) applyTheme(active);
            }
        } catch (err) {
            window.electronAPI.log.error('Failed to list themes:', err);
        } finally {
            isLoading.value = false;
        }
    }

    async function setActive(id: string): Promise<boolean> {
        const theme = themes.value.find((t): boolean => t.id === id);
        if (theme === undefined) return false;
        try {
            const result = await window.electronAPI.themeSetActive(id);
            if (result.success) {
                activeId.value = id;
                applyTheme(theme);
                // Cache for next launch's first-paint hint (data-theme set
                // synchronously before refresh() resolves).
                try {
                    localStorage.setItem(ACTIVE_ID_LS_KEY, id);
                } catch {
                    /* ignore quota errors */
                }
                return true;
            }
            window.electronAPI.log.warn('themeSetActive failed:', result.error);
        } catch (err) {
            window.electronAPI.log.error('themeSetActive error:', err);
        }
        return false;
    }

    async function openThemesFolder(): Promise<void> {
        try {
            await window.electronAPI.themeOpenPhyllaDir();
        } catch (err) {
            window.electronAPI.log.error('themeOpenPhyllaDir error:', err);
        }
    }

    return {
        themes,
        activeId,
        isLoading,
        refresh,
        setActive,
        openThemesFolder,
    };
}

/** Apply a theme to <html> by setting every color as a CSS custom property. */
function applyTheme(theme: ThemeInfo): void {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(`--${key}`, value);
    }
}
