/**
 * useLanguage — manages the active language / locale.
 *
 * The library of languages lives at ~/.phylla/locales/*.json and is hand-edited
 * or added by the user. This composable lists them and switches the active one.
 *
 * Architecture mirrors useTheme.
 */

import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { i18n } from '@/renderer/i18n';
import { LocaleMessagesSchema, type LocaleMessages } from '@/schemas/json';
import type { LanguageInfo } from '@/schemas/vault';

type UseLanguageReturn = {
    languages: Ref<LanguageInfo[]>;
    activeId: Ref<string>;
    isLoading: Ref<boolean>;
    refresh: () => Promise<void>;
    setActive: (id: string) => Promise<boolean>;
    openLocalesFolder: () => Promise<void>;
};

const ACTIVE_LANGUAGE_LS_KEY = 'phylla-language-id';

// Singleton state — one language applies app-wide.
const languages: Ref<LanguageInfo[]> = ref<LanguageInfo[]>([]);
const activeId: Ref<string> = ref<string>('en');
const isLoading: Ref<boolean> = ref<boolean>(false);

export function useLanguage(): UseLanguageReturn {
    const { locale } = useI18n();

    async function refresh(): Promise<void> {
        isLoading.value = true;
        try {
            const result = await window.electronAPI.languageList();
            if (result.success) {
                languages.value = result.languages;
                const id = result.activeId;

                // Always keep English loaded as the fallback locale.
                const fallback = id !== 'en' ? await loadLanguageMessages('en') : null;
                if (fallback !== null) i18n.global.setLocaleMessage<LocaleMessages>('en', fallback);
                const messages = await loadLanguageMessages(id);
                if (messages !== null) i18n.global.setLocaleMessage<LocaleMessages>(id, messages);

                activeId.value = id;
                locale.value = id;
            }
        } catch (err) {
            window.electronAPI.log.error('Failed to list languages:', err);
        } finally {
            isLoading.value = false;
        }
    }

    async function setActive(id: string): Promise<boolean> {
        // Early return if already active
        if (id === activeId.value) {
            return true;
        }

        const language = languages.value.find((l): boolean => l.id === id);
        if (language === undefined) return false;
        try {
            const result = await window.electronAPI.languageSetActive(id);
            if (result.success) {
                const messages = await loadLanguageMessages(id);
                if (messages !== null) {
                    i18n.global.setLocaleMessage<LocaleMessages>(id, messages);
                }
                activeId.value = id;
                locale.value = id;
                try {
                    localStorage.setItem(ACTIVE_LANGUAGE_LS_KEY, id);
                } catch {
                    /* ignore quota errors */
                }
                return true;
            }
            window.electronAPI.log.warn('languageSetActive failed:', result.error);
        } catch (err) {
            window.electronAPI.log.error('languageSetActive error:', err);
        }
        return false;
    }

    async function openLocalesFolder(): Promise<void> {
        try {
            await window.electronAPI.languageOpenPhyllaDir();
        } catch (err) {
            window.electronAPI.log.error('languageOpenPhyllaDir error:', err);
        }
    }

    return {
        languages,
        activeId,
        isLoading,
        refresh,
        setActive,
        openLocalesFolder,
    };
}

async function loadLanguageMessages(id: string): Promise<LocaleMessages | null> {
    try {
        const result = await window.electronAPI.languageLoad(id);
        if (result.success && result.content !== undefined) {
            const parsed = LocaleMessagesSchema.safeParse(result.content);
            if (parsed.success) return parsed.data;
            window.electronAPI.log.warn('Language file is not a tree of messages', { id, issues: parsed.error.issues });
            return null;
        }
        window.electronAPI.log.warn('Failed to load language', { id, error: result.error });
    } catch (err) {
        window.electronAPI.log.error('Error loading language', { id }, err);
    }
    return null;
}
