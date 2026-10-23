#!/usr/bin/env node
/**
 * i18n locale consistency gate. What it checks — plural, placeholder and array
 * parity across locales, plus the createI18n options — lives in
 * @larrydarko/lint-config/gates/i18n; only this project's paths and the reasons
 * that are specific to it are here.
 *
 * assets/locales/*.json are not build artefacts: language.ts seeds them into
 * ~/.phylla/locales/ where users edit them, so `en` is both reference and fallback.
 */
import { checkI18n } from '@larrydarko/lint-config/gates/i18n';

checkI18n({
    localeDir: 'assets/locales',
    configFile: 'src/renderer/i18n.ts',
    configNotes: {
        escapeParameter:
            'The messages themselves are user-editable under ~/.phylla/locales/, and the renderer already has ' +
            'v-html sites (ai/AiMessageList.vue, drawing/DrawingToolbar.vue), so an unescaped param is one ' +
            'refactor away from an XSS sink.',
        fallbackLocale:
            'Locales are hand-edited in ~/.phylla/locales/, so missing keys are a runtime reality here, not only ' +
            'a build-time one.',
    },
});
