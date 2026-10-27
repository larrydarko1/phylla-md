// The gates `larry check` runs, and each one's options. The editor lists every option a gate takes.
import { defineConfig } from '@larrydarko/lint-config/config';

/** CodeMirror extension modules, named by upstream's convention rather than ours. */
const CODEMIRROR = /^src\/renderer\/composables\/editor\/codemirror\/cm-[a-z0-9-]+\.ts$/;

/**
 * Files over the 400-line softcap when the ratchet was set, at the size they were.
 * A file may shrink freely; growing past its entry, or a new file crossing the cap,
 * fails. Lower a number when you refactor, never raise it — and when one drops back
 * under the cap the gate says so, because an entry left behind is a licence to
 * regrow to the old number.
 */
const LENGTH_BASELINE: Record<string, number> = {
    'src/renderer/composables/drawing/useDrawingInteraction.ts': 747,
    'src/main/services/fs.ts': 658,
    'src/renderer/composables/drawing/useCanvasRenderer.ts': 623,
    'src/renderer/App.vue': 516,
    'src/renderer/composables/ai/useAIChat.ts': 447,
    'src/renderer/components/NoteEditor.vue': 425,
    'src/renderer/composables/editor/codemirror/cm-theme.ts': 421,
    'src/main/services/ai.ts': 412,
};

export default defineConfig({
    family: 'electron',
    gates: {
        // The allowlist is the one part that is this project's decision, and the goal is for it to stay
        // empty: an entry is only ever right when the fix is out of reach from here.
        'audit': {
            allowlist: [
                // Each entry: { id, package, reason, expires }. The reason must say BOTH
                // why it cannot be fixed here and why it is unreachable in Phylla's code.
            ],
        },
        // An SFC filename is PascalCase because it is the component name; everything else under src/ is
        // camelCase, except the `cm-*.ts` CodeMirror extensions under composables/editor/codemirror, named
        // after upstream's convention and matched on that path alone. Headers: first match wins. A
        // main-process module under lib/ or services/ owes a JSDoc block, since which external concern it
        // owns (the filesystem, a model handle, a config file) is not derivable from its exports; a
        // composable owes a `//` line saying what state it owns; an SFC owes nothing. The baseline counts
        // non-blank lines without `<style>`.
        'code-style': {
            scan: ['src'],
            baseline: LENGTH_BASELINE,
            casing: [
                { files: /\.vue$/, style: 'pascal' },
                { files: /\.ts$/, style: 'camel', exempt: CODEMIRROR },
            ],
            headers: [
                { files: /^src\/main\/(lib|services)\/.*\.ts$/, require: 'jsdoc' },
                { files: /^src\/renderer\/composables\/.*\.ts$/, require: 'comment' },
                { files: /\.vue$/, require: 'none' },
            ],
        },
        'contrast': { skip: 'No script ran it before larry upgrade.' },
        // A dependency Electron loads indirectly (a native backend, a builder hook) looks unused to an import
        // graph: it goes under `ignoreDependencies` in knip.config.js with a reason, never in a raised
        // budget. Budgets are all zero and stay there.
        'dead-code': {
            notMachineChecked:
                'code reachable from an entry point but never reached at RUNTIME — an IPC handler nothing calls, a branch no setting enables.',
        },
        // src/ and tests/ are the whole scope. Phylla is one package, so imports get three groups: builtin,
        // external, local. `@test-utils` is a tsconfig path into this repo, so it sorts as local.
        'declaration-order': {
            sourceRoots: ['src', 'tests'],
            importOrder: { localAliases: ['@test-utils'] },
        },
        // Each number is a judgement that only goes down, split by format because the three have different
        // stakes. A false positive (two blocks alike that mean different things) raises a ceiling with a
        // comment; the code stays as is.
        'duplication': {
            scan: ['src'],
            ceilings: {
                typescript: { limit: 4, note: 'logic — two copies of a branch is how a fixed bug comes back.' },
                scss: {
                    limit: 0.5,
                    note: 'presentation — real debt, and what the token system and the shared patterns in styles/components/ exist to absorb, but a stale copy makes something look wrong rather than behave wrong.',
                },
                html: {
                    limit: 6,
                    note: 'SFC markup — structural repetition is often the correct answer, and extracting a component would cost more than it saves.',
                },
            },
            // The largest clone today is 132. This leaves a little room without leaving room
            // for a new one.
            maxCloneTokens: 140,
        },
        // `require` is three tags, and leaving out the rest is deliberate: no mobile viewport, browser chrome
        // or tab, the window icon comes from BrowserWindow and electron-builder, src/main/index.ts sets
        // `title: ''` on purpose, and nothing crawls a `file://` document. `csp: true`: a packaged build
        // loads over `file://`, so the meta tag is the policy, and the only thing between a malicious note
        // (markdown is rendered, and there are v-html sites) and script running in a window that talks to the
        // main process.
        'html-standards': {
            indexHtml: 'src/renderer/index.html',
            baseScss: 'src/renderer/styles/_base.scss',
            require: ['lang', 'charset', 'appMount'],
            csp: true,
        },
        // The locale files are not build artefacts: language.ts seeds them into ~/.phylla/locales/, where
        // users edit them, so `en` is both reference and fallback.
        'i18n': {
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
        },
        'licenses': { skip: 'No script ran it before larry upgrade.' },
        // One manifest, no workspaces. `private: true` guards against a stray `npm publish` of an AGPL
        // desktop app, and `build`, `main` and `os` are required because the packaging rules read them.
        'package-json': {
            rootRequired: [
                'name',
                'version',
                'description',
                'keywords',
                'homepage',
                'bugs',
                'license',
                'author',
                'repository',
                'type',
                'main',
                'engines',
                'os',
                'private',
                'packageManager',
                'build',
            ],
            tildeAllowed: {
                typescript:
                    'Its minor releases introduce new type errors, so a minor bump is a code change, not a dependency bump.',
            },
        },
        'pipeline': {},
        'refactoring': {},
        // `index.scss` is the entry, imported once by main.ts. `_variables.scss` is injected into every SFC
        // style block, each its own Sass compilation, so anything reachable from it that emits ships once per
        // component. `json-presets` is a product decision: the themes are JSON files seeded into
        // ~/.phylla/themes/, where users hand-edit them, so the palettes cannot live in a Sass map. The
        // `fallbackFile` layer matters more here than elsewhere: a hand-edited preset can predate a token.
        // `componentLocalVars` names the properties a component sets on itself through `:style`. No
        // `standard`: CONTRIBUTING.md has no SCSS section.
        'scss-standards': {
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
        },
        'secrets': { skip: 'No script ran it before larry upgrade.' },
        // The mechanical half of the Testing section of CONTRIBUTING.md: where the two disagree, the document
        // is the standard. Tests mirror src/ under tests/: add a new area to both together. `e2e: false` is a
        // decision, not a gap: Playwright's Electron API is experimental and an attempt here was removed, so
        // raise adding E2E before doing it. Thresholds only rise and the exclude list may not grow.
        // `vmBaseline: 0`: `wrapper.vm` is counted rather than banned.
        'testing': {
            config: 'vitest.config.ts',
            layout: { kind: 'mirrored', root: 'tests', areas: ['main', 'preload', 'renderer', 'schemas'] },
            e2e: false,
            thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
            excludes: {
                'src/renderer/main.ts': 'renderer bootstrap — mounts the app and installs plugins, no branch to cover',
                'src/main/index.ts': 'Electron entry — creates the BrowserWindow, only exercised by launching the app',
                'src/**/*.d.ts': 'declarations, no runtime',
                'src/**/*.html': 'markup, not code',
            },
            domEnvironment: { name: 'jsdom', config: 'vitest.config.ts' },
            vmBaseline: 0,
        },
        // The renderer runs with context isolation on and node integration off, so `process`, `Buffer` and
        // `require` do not exist there. `browserSources` checks the code as well as the config: one `///
        // <reference types="node" />` in any dependency's typings puts Node's globals in scope. Tests are
        // exempt. `nonEmitting` is not passed: no package here is consumed as TypeScript source.
        'tsconfigs': {
            nodeTyped: ['tsconfig.node.json'],
            browserProjects: ['tsconfig.app.json'],
            browserSources: ['src/renderer'],
        },
        // `vHtml` names each v-html binding, not each file, so a second binding in one of these components
        // fails until someone writes down why it is safe too. `sanitizers` adds `renderInline`: it is how
        // markdown table cells reach innerHTML.
        'electron-security': {
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
        },
        // `cleanupRequired` names the services holding a native resource the OS does not reclaim when the
        // window closes.
        'error-handling/electron': {
            cleanupRequired: [
                [
                    'fsService',
                    'holds the vault fs watcher — an active watcher keeps the event loop alive after the window is gone.',
                ],
                [
                    'aiService',
                    'holds a node-llama-cpp model and its context, which are gigabytes of native memory outside the JS heap.',
                ],
                ['speechService', 'holds the whisper ONNX session — a native handle with its own threads.'],
            ],
        },
        'ipc-standards': {},
    },
});
