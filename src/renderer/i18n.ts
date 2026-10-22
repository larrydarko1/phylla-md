import { createI18n } from 'vue-i18n';

import en from '../../assets/locales/en.json';

const DEFAULT_LOCALE = 'en';

/**
 * Locales are loaded at runtime from ~/.phylla/locales/ via IPC and applied by
 * useLanguage() with i18n.global.setLocaleMessage(). the bundled `en` is seeded
 * so the very first paint has real strings (before that load resolves), and it
 * doubles as the fallback locale for any key a translation is missing.
 */
const defaultMessages = { en };

export const i18n = createI18n({
    legacy: false,
    escapeParameter: true,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: defaultMessages,
});
