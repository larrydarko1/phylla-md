# Contributing to Phylla

Thank you for considering contributing to Phylla! This is a desktop note-taking application built with Electron and Vue 3.

## Platform support

**Releases carry Linux packages only.** macOS and Windows are not shipped because signed binaries
need paid certificates, and unsigned ones get warned about or blocked by the OS. Both targets stay
in `package.json` (`build:mac`, `build:win`) and build fine from source, where no signature is
needed — they are just untested. See [Other platforms](../README.md#other-platforms).

Bug reports from a self-built macOS or Windows copy are welcome and will be read, but they are
fixed on a best-effort basis, and CI never builds or tests them. Proper support for both is planned
once the project has the resources for it.

## Development Setup

1. **Fork the repository**
2. **Clone your fork**
    ```sh
    git clone https://github.com/larrydarko1/phylla-md.git
    cd phylla-md
    ```
3. **Install dependencies**
    ```sh
    npm install
    ```
4. **Start the development environment**
    ```sh
    npm run dev
    ```

This will launch the Electron app with hot reload enabled.

## Project Structure

See the [README](../README.md#project-structure) for the full project structure tree.

Key conventions:

- **Main process** (`src/main/`) — Electron backend. Business logic lives in `services/`, shared constants in `lib/`
- **Preload** (`src/preload/`) — Secure IPC bridge. All renderer↔main communication goes through here
- **Renderer** (`src/renderer/`) — Vue 3 frontend. Components in `components/`, reusable logic in `composables/` (grouped by domain: `ai/`, `editor/`, `drawing/`, `vault/`, `ui/`)
- **Tests** (`tests/`) — Mirrors the `src/` structure (`tests/main/`, `tests/renderer/`)

## How to Contribute

### Branching

Phylla is trunk-based: `main` is the only long-lived branch, and everything else is a short-lived
branch off it that gets squash-merged and deleted. Branch names carry the same type prefix as the
commits — `feat/`, `fix/` or `chore/`:

```sh
git switch -c feat/markdown-table-shortcut
```

Keep them short-lived — hours to days, ideally under a week. A branch that stays open for weeks
diverges far enough from `main` that merging it stops being a merge and starts being a rewrite.

`main` is always deployable, so nothing half-working lands on it. That is not a style preference
here: any green commit on `main` whose `package.json` version is untagged will be tagged, built and
published by `release.yml`.

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), enforced locally by the
husky `commit-msg` hook. `commitlint.config.js` pulls its rules from `@larrydarko/lint-config`, where
the allowed types are listed with their meanings (`node_modules/@larrydarko/lint-config/dist/commitlint.js`):
`feat`, `fix`, `perf`, `refactor`, `test`, `security`, `docs`, `style`, `chore`, `bump` and `revert`.

```
<type>(<scope>): <subject>          required, imperative mood, 200 chars max

<body>                              optional, why not what, wrap at 400 chars
```

- **Subject** — title ("added table shortcut, etc")
- **Scope** — optional, the area touched: `feat(editor):`, `fix(vault):`. Skip it when it isn't obvious
- **Body** — explain _why_, especially trade-offs and approaches you rejected. The diff already shows _what_. Leave it blank only for genuinely trivial changes

Commits inside your branch can be messy — `wip`, fixups, whatever you need. They get squashed away.
Only the hook's format rule has to pass on each one.

### Pull requests

**The PR title has to be a valid conventional commit.** Squash-merge discards the branch's individual
subjects and uses the PR title as the commit that lands on `main` — so the title is the only thing
history keeps. `pr-title.yml` lints it on every edit, so a wrong title is a red check rather than a
surprise at merge time.

```
feat(editor): added markdown table shortcut     ✅
Added markdown table shortcut                   ❌
```

Merging:

- **Squash and merge only.** Not rebase-and-merge, not a merge commit — `main` stays linear
- **Delete the branch** afterwards
- Full CI has to be green first
- Never force-push `main`, or any branch someone else has pulled

Don't bump the version in a feature PR — see [Releases](#releases) below.

### Before Submitting a PR

One command runs the exact gate list CI runs:

```sh
npm run ci:check
```

That is the audit gate (production deps, high and above, via `scripts/check/check-audit.ts` and its
reviewed allowlist) → lint → format check → stylelint → the standards gates → tests with coverage →
testing standards → build. The standards gates are one `*:check` script each — package manifest,
pipeline, code style, declaration order, HTML, SCSS, refactoring, IPC, Electron security, error
handling, duplication, dead code, i18n and tsconfigs. Running it locally first is the difference
between one push and six.

If lint or formatting fails, auto-fix with:

```sh
npm run lint:fix
npm run format
npm run stylelint:fix
```

CI builds the app but never launches it, so `npm run dev` and clicking through your change is still
worth doing — a broken IPC call or a component that fails to mount passes every check above.

### Local hooks

[husky](https://typicode.github.io/husky/) installs the hooks automatically via the `prepare` script,
so `npm install` is all the setup there is. They are the first line of defence before CI:

| Hook         | Runs                                                | On                         |
| ------------ | --------------------------------------------------- | -------------------------- |
| `pre-commit` | `lint-staged` → `eslint --fix` + `prettier --write` | `*.ts`, `*.vue`            |
|              | `stylelint --fix`                                   | `*.scss`, `*.vue`          |
|              | `prettier --write`                                  | `*.scss`, `*.json`, `*.md` |
| `commit-msg` | `commitlint`                                        | the commit message         |

Because these only touch staged files, they are fast but partial — they are not a substitute for
`npm run ci:check`, which is what CI actually runs.

## Testing

[Vitest](https://vitest.dev) is the only test runner — main process, renderer, composables and Vue
components all go through it. Vue components mount with
[Vue Test Utils](https://test-utils.vuejs.org/) under `jsdom`.

### Where tests live

Tests mirror `src/` under `tests/`. That is the pattern this project picked — don't co-locate
`__tests__/` folders alongside source:

```
src/main/lib/paths.ts            →  tests/main/paths.test.ts
src/renderer/composables/vault/  →  tests/renderer/composables/vault/
src/schemas/                     →  tests/schemas/
```

- The `.test.ts` suffix is what Vitest actually discovers — the folder is convention, the suffix is the mechanism
- Shared helpers live in `tests/renderer/test-utils.ts`, importable as `@test-utils` (aliased in `vitest.config.ts` alongside `@/main`, `@/renderer`, `@/schemas`, `@/preload`)
- **Every test file ends in `.test.ts`.** Not `.spec.ts` — Vitest is configured to match `.test.ts`, so a `.spec.ts` is picked up by no runner at all. It stops running while still looking like a test, which is the worst of both

### What to test, in priority order

1. **Security-relevant functions** — vault path resolution, anything sanitising note content before it reaches the DOM, anything validating IPC payloads
2. **Pure utilities** — the cheapest tests you will ever write
3. **Main-process service logic** — `src/main/services/`
4. **Composables** — state, transforms, side effects
5. **Components** — conditional rendering, emitted events, form validation, and accessibility: semantic elements over click-handling `<div>`s, ARIA where semantics aren't enough, keyboard paths (Tab order, Enter/Space, Esc to close), and focus moving into a modal and back to its trigger

**Rule of thumb: if it has an `if`, a loop, or a transform, it gets a test.**

**Test the negative cases.** Wrong types, boundary conditions, empty and malformed input, and — because
this app reads and writes arbitrary files — path traversal attempts. A vault function tested only on
`notes/todo.md` is untested against `../../.ssh/id_rsa`.

### Test behaviour, not implementation

Assert what a component does — what renders, what it emits, what a function returns — not how it does
it internally. Tests that reach into private state break during refactors without catching real bugs.

The mechanical form of that mistake is `wrapper.vm.someRef`. Note that `$`-prefixed members are **not**
the same thing: `wrapper.vm.$nextTick()` and `wrapper.vm.$emit()` are Vue's public instance API and
are fine.

### Suite hygiene

These are the ways a suite goes wrong while every run stays green, so none of them announce themselves:

- **No `.only`.** A stray `describe.only` or `it.only` silently disables every other test in its file. The run stays green and the count drops by an amount nobody investigates
- **No test without an assertion.** A test that calls a function and asserts nothing passes even if that function becomes a no-op
- **No parked `.skip`.** A skipped test is a deferred fix living in the code — fix it or delete it, don't park it
- **No duplicate `describe`/`it` titles in a file.** That is a copy-paste that lost its edit: both run, neither fails, and the second one's intent is gone
- **No commented-out tests.** Deleting a test is fine; leaving it as a comment is a deletion without the honesty
- **`describe` for grouping, `it` for cases** — not `test`. Use `it.each()` for parametric cases and `beforeEach` to reset state between them

### Coverage

`npm run test:coverage` runs the suite through `@vitest/coverage-v8`. CI runs the same thing and
fails the build if any of the four metrics drops below the thresholds in `vitest.config.ts`
(currently **80%** for statements, branches, functions and lines).

- **The target is 100%.** 80 is the floor that fails the build today, not the goal. It ratchets up and never down — lowering a threshold to make a red build green is fixing the number that defines failure, not the failure
- **Coverage is written in the same PR as the change.** A coverage gap is a bug, not follow-up work
- **Branches is the honest metric.** Statements and lines happily skip over an unvisited `if` arm or a short-circuit that branches will catch
- **Coverage measures execution, not assertion quality.** A test that calls a function and asserts nothing still counts as covered. Treat the percentage as a floor, not a finish line

### There is no E2E suite

This is a decision, not a gap. Playwright currently has no officially supported Electron story — its Electron
API is experimental — and an attempt here ran into enough problems that it was
removed. Don't open a PR adding one back without raising it first.

The consequence is that **nothing tests the assembled app automatically.** Window creation, IPC
registration, the preload bridge and packaging all go unverified by CI, which is why running
`npm run dev` and clicking through your change is part of the PR checklist rather than a nicety.
Where a bug could only appear in the wired-up app, say so in the PR — a reviewer needs to know it was
checked by hand, because nothing else will check it.

## Code Style

Linting, formatting and the CI gates all come from one shared package,
[`@larrydarko/lint-config`](https://www.npmjs.com/package/@larrydarko/lint-config). The config files
in this repo are thin: they call the package and pass only what is specific to Phylla. A change to a
shared rule belongs in the package, not here.

- **Prettier** (`prettier.config.js`): re-exports the shared config — single quotes, 4-space indent, 120 char line width, trailing commas, LF line endings
- **ESLint** (`eslint.config.js`): the shared TypeScript + Vue base, plus Phylla's own rules for what main, preload, renderer and schemas may import and use
- **stylelint** (`.stylelintrc.mjs`), **lint-staged** (`lint-staged.config.js`), **commitlint** (`commitlint.config.js`) and **knip** (`knip.config.js`) follow the same pattern
- **Gate scripts** (`scripts/check/`): each one runs a gate from the package with Phylla's paths and allowlists
- Follow existing patterns in the codebase — look at similar files before writing new code
- Keep components small and focused — extract sub-components and composables when a file grows beyond ~300 lines
- Write clear, descriptive comments only where the logic isn't self-evident

## Releases

Phylla uses [semantic versioning](https://semver.org/) — `vMAJOR.MINOR.PATCH`. The split is that
**humans decide, CI executes**.

| Bump      | When                                                              | Example           |
| --------- | ----------------------------------------------------------------- | ----------------- |
| **MAJOR** | Breaking change for users — altered vault format, changed license | `1.4.2` → `2.0.0` |
| **MINOR** | New feature, backwards-compatible                                 | `1.4.2` → `1.5.0` |
| **PATCH** | Bug fix, no new features, nothing breaking                        | `1.4.2` → `1.4.3` |

Releases are batched, not automatic. The maintainer decides when one is worth cutting, then:

1. **Counts the commits since the last tag** to determine the bump — any `feat:` means at least a
   MINOR, `fix:` / `perf:` / `security:` alone means a PATCH, a breaking change means a MAJOR
   (which resets MINOR and PATCH to `0`)
2. **Lands one commit that does nothing but bump** — type `bump:`, updating `package.json`'s
   `"version"` field and nothing else:
    ```sh
    git commit -m "bump: version 2.7.0"
    ```

CI takes it from there. `release.yml` watches for a green CI run on `main`, reads the version out of
`package.json`, and stops if that tag already exists — so ordinary commits are a no-op and only the
bump commit triggers anything. When the version is new it tags the commit, builds the Linux
packages, and publishes them as a GitHub release.

Nothing about that is manual, which is why the bump commit has to be correct: it is the only human
input into the release.

## Reverting

Reverts are normal. A quick revert beats a scrambled hotfix — undo first, diagnose after.

```sh
git revert <sha>
```

Because everything is squash-merged, each PR is a single ordinary commit on `main`, so a plain
`git revert` undoes the whole thing. There are no merge commits to pick a mainline for.

Never `git reset --hard` on `main`. Revert forward — it leaves the history intact and reviewable.

Reverting the commit that shipped a release does **not** unpublish it: the tag, the release and any
installer already downloaded all still exist. Pull the GitHub release manually and ship a new patch
version.

## Reporting Issues

Use the [issue templates](https://github.com/larrydarko1/phylla-md/issues/new/choose) — they ask for the
version, OS and log location up front, which is most of what a bug report needs. Screenshots help.

**Security vulnerabilities do not go in issues.** Email the maintainer at <hello@larrydarko.dev>
instead; see [SECURITY.md](SECURITY.md) for scope and what to expect.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Feel free to open a discussion or issue if you need help!
