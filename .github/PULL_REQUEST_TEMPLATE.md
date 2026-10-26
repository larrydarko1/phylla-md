<!--
Two things about this repo that catch people out, both mechanical:

  1. The PR TITLE becomes the commit on main. Squash-merge uses it as the commit
     subject, so it must be a conventional commit — `feat(editor): add markdown
     table shortcut`, not `Add markdown table shortcut`. pr-title.yml runs
     commitlint against it, so a wrong title is a red check, not a surprise
     later. Allowed types are in @larrydarko/lint-config (see CONTRIBUTING.md).
  2. `npm run ci:check` is the same gate list CI runs. Running it locally first
     is the difference between one push and six.

Delete any section below that does not apply. An empty heading is worse than no
heading.
-->

## Why

<!--
One why per PR. If this needs two paragraphs joined by "and also", it is two PRs
and both of them review better apart — the refactor separately from the feature
that needed it.

Explain the reasoning, not the diff. The files changed are already visible; what
isn't is which approaches you rejected and what the trade-off was.
-->

## What changed

<!-- Brief, only where the diff is not self-explanatory. Call out anything load-bearing. -->

## How it was verified

<!--
Say what you actually ran, not what should pass. "Added a test for the vault path
traversal case" and "loaded a 4k-line note and checked the editor still scrolls
at 60fps" are both fine; "should be fine" is not.

CI builds the app but never launches it, so anything about how it behaves as a
running desktop app is only known if you ran it.
-->

- [ ] `npm run ci:check` passes locally
- [ ] New or changed behaviour has tests **in this PR** — coverage is not follow-up work
- [ ] Negative cases covered too, not just the happy path
- [ ] No `.only`, no parked `.skip`, no test that asserts nothing
- [ ] Ran `npm run dev` and exercised the change in the actual app

## Standards touched

<!--
Tick only what this PR actually crosses. Each one has a gate that will tell you
anyway — the point of ticking it is that you thought about it before CI did.
-->

- [ ] Security (IPC surface, preload bridge, file paths, HTML sanitising) — see `SECURITY.md`
- [ ] Process boundary (new IPC channel, or main↔renderer contract changed)
- [ ] Filesystem (vault reads/writes, path handling, anything that can lose a note)
- [ ] Local AI (model loading, inference, download, or the Whisper weights the release build packs)
- [ ] Privacy (any new network call — Phylla makes none)
- [ ] Frontend (a11y checked, i18n strings added to every locale in `assets/locales/`)
- [ ] Packaging (electron-builder config, entitlements, per-platform installer behaviour)
- [ ] Pipeline (workflow, composite action, or a `ci:check` gate)
- [ ] Dependencies (adds a production dep, or changes what `npm audit` reports — see the `audit` gate in `larry.config.ts`)

## Anything a reviewer should push back on

<!--
The most useful section and the one most often left blank. Shortcuts taken,
things you were unsure about, the bit you'd like a second opinion on. Naming it
here costs nothing; having it found in six months costs a lot.
-->

---

<!--
Before merging: squash and merge, then delete the branch. Never rebase-merge or
create a merge commit — main is linear.

Releasing is separate: the maintainer decides when, counts the commits since the
last tag for the semver bump, and lands a `bump: version x.y.z` commit. Once CI
is green on that commit, release.yml tags it, builds the Linux packages and
publishes the GitHub release. Don't bump the version in a feature PR.
-->
