#!/usr/bin/env node
/**
 * Electron security gate — the process-model invariants: webPreferences on every
 * window, navigation containment, permission handlers that deny by default, the
 * phylla:// boundary, HTML sinks, RegExp inputs, certificate overrides. The rules
 * live in @larrydarko/lint-config/gates/electron-security.
 *
 * What stays here is what only this repo can vouch for.
 *
 * `vHtml` names each v-html BINDING, not each file, so a second binding added to
 * one of these components fails until someone writes down why it is safe too.
 * The reason was checked against the code when it was written: the chat's copy
 * buttons are wrapped around markup that has already been through DOMPurify
 * with an ALLOWED_TAGS allowlist.
 *
 * `sanitizers` adds `renderInline` to the built-in escapeHtml and
 * DOMPurify.sanitize: it is how markdown table cells reach innerHTML.
 */
import { checkElectronSecurity } from '@larrydarko/lint-config/gates/electron-security';

checkElectronSecurity({
    vHtml: [
        {
            file: 'src/renderer/components/ai/AiMessageList.vue',
            binding: 'renderWithCopyBtns(msg.content)',
            why: 'Model output, passed through `renderMarkdown` in useAIChat.ts — DOMPurify with an ALLOWED_TAGS allowlist — before the copy buttons, which hold only a counter and a static icon, are wrapped around each <pre>.',
        },
    ],
    sanitizers: [
        {
            name: 'renderInline',
            why: 'cm-widgets.ts escapes the whole cell with escapeHtml FIRST, then wraps runs of that escaped text in fixed tags (<strong>, <em>, <code>, <del>, <mark>). No input reaches the output unescaped.',
        },
    ],
});
