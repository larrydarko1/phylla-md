#!/usr/bin/env node
/**
 * SCSS architecture gate. Stylesheets fail quietly — nothing throws when a token
 * is missing from one theme, when a rule is emitted once per component, or when a
 * `var()` names something nothing declares. The rules live in
 * @larrydarko/lint-config/gates/scss-standards.
 *
 * What stays here is this repo's answers.
 *
 * THE TWO FILE ROLES. `index.scss` is the ENTRY: it `@use`s the modules that
 * emit, and main.ts imports it exactly once. `_variables.scss` is the INJECTED
 * module — both Vite configs prepend it to every SFC style block, and each block
 * is its own Sass compilation, so anything reachable from it that emits a rule
 * ships once per component. The mixins live in it too, for that reason: a mixin
 * emits nothing until it is included. The gate fixes both names.
 *
 * `themes.source: 'json-presets'` is the one real switch, and it is a product
 * decision rather than a style preference: Phylla's themes are JSON files seeded
 * into ~/.phylla/themes/ where users hand-edit them, so the palettes cannot live in
 * a Sass map. The parity rule is the same one every other project gets — a
 * reference preset, every other preset carrying exactly its key set, a fallback
 * layer that matches, and no `var()` naming something nothing declares. Only
 * where the key sets are READ FROM differs.
 *
 * `fallbackFile` is _theme.scss's `:root` block. It matters more here than
 * elsewhere: a user's hand-edited preset in ~/.phylla/themes/ can predate a token,
 * and then this layer is the only thing standing between them and an element
 * that renders with no colour at all.
 *
 * `componentLocalVars` — a custom property a component sets on itself through a
 * `:style` binding is deliberately absent from every preset, so the sweep has to
 * be told. The reason travels with the name so the exemption justifies itself.
 *
 * No `standard` is passed: CONTRIBUTING.md has no SCSS section to point at.
 */
import { checkScssStandards } from '@larrydarko/lint-config/gates/scss-standards';

checkScssStandards({
    styles: 'src/renderer/styles',
    src: 'src/renderer',
    mainScript: 'src/renderer/main.ts',
    viteConfigs: ['electron.vite.config.ts'],
    injectedSpecifier: '@/renderer/styles/variables',
    emitters: [
        {
            module: 'theme',
            why: '_theme.scss carries the `:root` fallback layer. Un-@used, every `var(--token)` resolves to nothing until a preset loads — and to nothing at all if one fails to.',
        },
        {
            module: 'base',
            why: '_base.scss carries the reset, element defaults and the keyframes. Un-@used, none of it reaches the bundle.',
        },
        {
            module: 'components',
            why: 'components/ holds the classes shared across unrelated SFCs. Un-@used, every template naming one of them renders unstyled.',
        },
        {
            module: 'layout',
            why: '_layout.scss carries the pane shells and grid helpers. Un-@used, the window loses its frame.',
        },
    ],
    themes: {
        source: 'json-presets',
        dir: 'assets/themes',
        reference: 'dark',
        fallbackFile: 'src/renderer/styles/_theme.scss',
    },
    componentLocalVars: {
        'scroll-distance': 'FolderNode.vue — marquee offset for a truncated name',
        'scroll-duration': 'FolderNode.vue — marquee duration, proportional to the name length',
        'volume': 'components/_media.scss — volume slider fill width, set by AudioViewer.vue / VideoViewer.vue',
    },
});
