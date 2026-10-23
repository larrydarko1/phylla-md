# Changelog

All notable changes to Phylla (formerly Leaf) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0] - 2026-10-23

Leaf is now Phylla. Your notes, models, conversations and settings move over automatically on first launch.

### Upgrading

- Uninstall Leaf before installing Phylla. Linux packages are now named `phylla-md` and the binary is `phylla`, so your package manager won't replace the old `leaf` package.
- Migration is one-way: after running 4.0.0, going back to 3.x won't find your data.

### Changed

- Renamed the app from Leaf to Phylla. `~/.leaf/` moves to `~/.phylla/`, and each vault's `.leaf/` folder becomes `.phylla/` when opened.
- Formatting and lint rules now come from the shared `@larrydarko/lint-config` package.

### Removed

- Brainrot as an interface language.

### Security

- Updated dependencies.

## [3.1.0] - 2026-09-22

### Changed

- UI improvements across the app.
- Updated Electron to 43.4.0.

### Removed

- In-app model download from Hugging Face. Place GGUF models in the models folder manually.

### Fixed

- Whisper dictation now uses the selected language instead of guessing it.

### Security

- Updated dependencies.

## [3.0.1] - 2026-08-16

### Fixed

- Pruned unused llama backend packages from the build.

## 3.0.0 - 2026-08-13

Never published as a release; its changes shipped in 3.0.1.

### Changed

- Improved Linux support. Releases now carry Linux packages.

### Removed

- Windows support.
- AI agent mode. It was experimental and unreliable.
- External drag and drop, which was dead code.

### Fixed

- Serialized `state.json` access to fix concurrent writes during seeding.

### Security

- Reduced dependency vulnerabilities and added an audit gate to CI.
- Updated the security reporting policy.

## [2.6.6] - 2026-07-11

### Added

- Brainrot as an interface language.

### Changed

- The language selector shows each language by its native name.

### Fixed

- Moving a bookmarked file now updates its bookmark.
- Missing translation keys.

### Security

- Added a Content Security Policy.

## [2.6.2] - 2026-06-30

### Added

- The AI context can include up to 10 selected `.md` or `.txt` files instead of only the active file.
- Truncated names in the sidebar scroll on hover.

## [2.4.1] - 2026-06-23

### Added

- Interface translations (i18n), including custom languages loaded from the vault's dot folder.
- Option to display the LLM's thinking, for models that support it.
- Multi-language dictation, with the speech model upgraded to whisper-base.

### Changed

- Smoother animations in the sidebar and AI input.
- Throttling and debouncing on busy inputs.
- Rendering performance improvements.

### Fixed

- AI chat not working properly in some cases.
- Translation bugs in the drawing panel and model selection.
- Language files not loading from the dot folder.
- Deprecated audio API in dictation, which now uses an AudioWorklet.

### Security

- LLM output is sanitized with DOMPurify before rendering.
- Hardened Hugging Face downloads and language file validation.

## [2.1.0] - 2026-06-11

### Added

- Copy button for code blocks in AI chat messages.
- Resizable AI panel width and AI text input.

### Changed

- Accessibility improvements across renderer components.

### Fixed

- The drawing canvas now follows the selected theme.
- The empty tab bar is hidden when no tabs are open.
- Audio volume sliders now fill correctly.

### Security

- Updated dependencies.

## [2.0.1] - 2026-05-17

### Changed

- Checkbox accent color follows the selected theme.

### Fixed

- The `.leaf` folder is now hidden in the vault.

## [2.0.0] - 2026-05-16

### Added

- Theme panel that replaces the light/dark toggle, with multiple built-in themes and custom themes.

### Changed

- License changed to AGPL v3 from this version onward.

### Fixed

- Bookmarks now persist.
- Regex issue that crashed input.

## [1.5.8] - 2026-05-15

### Added

- Customizable AI system prompts.

### Changed

- Restructured the `.leaf` directory.

### Fixed

- Keyboard navigation in the file explorer.
- Folders now start collapsed when a vault is loaded.

### Security

- Updated dependencies.

## [1.5.7] - 2026-04-25

### Added

- Tab reordering.
- Table rendering in Markdown.

### Fixed

- Restoring a chat now resumes its conversation context, and a new conversation clears it.
- Checkbox rendering.

## [1.5.6] - 2026-04-20

### Added

- Open tabs persist between sessions.
- Nested checkboxes with fold toggles.
- Syntax highlighting and language support for code blocks.
- Drawing: multi-element selection and export.

### Fixed

- Drawing: text scaling and the undo shortcut.

### Security

- Updated dependencies to their latest stable versions.

## [1.5.5] - 2026-04-04

### Added

- Multiple tabs.
- Live Markdown rendering with CodeMirror.

### Changed

- Removed the note editor header, which tabs replace.

### Fixed

- Renaming an embedded media file updates every note that embeds it.
- Numbered lists renumber when edited.
- Tab, bookmark and search styling.

### Security

- Updated dependencies.

## [1.5.4] - 2026-03-27

### Changed

- New icons.

### Fixed

- Hugging Face model downloads, broken by a CDN migration.

## [1.5.3] - 2026-03-24

### Changed

- The title bar looks consistent across operating systems.
- Improved checkbox styling and margins.

### Fixed

- Media rendering in Markdown preview was slow and sometimes crashed the app.

## [1.5.2] - 2026-03-21

### Fixed

- Unwanted alerts when renaming files.
- Checkbox lists with blank lines between items were parsed as loose lists.

## [1.5.1] - 2026-03-15

### Changed

- Refactored large components and hardened the app. Added the first tests and linting.

### Fixed

- The chat copy button.
- Some LLMs crashing the app.

## [1.5.0] - 2026-03-14

### Changed

- Large internal refactor.

### Fixed

- Audio recorder bug.

### Security

- Security update.

## 1.4.0 – 1.4.9 - 2026-02-23 to 2026-03-03

Before 1.5.0, the version was bumped on almost every commit, so earlier versions are grouped by minor version.

### Added

- Local speech-to-text dictation for `.txt` and `.md` files (1.4.0).
- The AI summarizes conversation history when a chat is reloaded or exceeds the token limit (1.4.1).
- Media embed syntax compatible with Obsidian vaults. Media can be dragged into a note to embed it (1.4.3).
- Markdown toolbar for applying syntax with buttons (1.4.6).
- Collapsible sections under headings and automatic lists (1.4.7).

### Changed

- Larger default window and new icons (1.4.2).
- Polished Markdown styling (1.4.5).
- Reworked the drawing section (1.4.8) and improved the drawing canvas (1.4.9).
- The Whisper model is downloaded manually rather than bundled (1.4.6).

### Removed

- `.odt` support, which was too unstable (1.4.9).

### Fixed

- Window sizing on small screens (1.4.6).
- Corrupted DMG and AppImage failing to load the speech-to-text model (1.4.8).

## 1.3.0 – 1.3.9 - 2026-02-12 to 2026-02-21

### Added

- AI chat: stop button (1.3.0), token count (1.3.1), deleting the last message, regenerating replies and editing prompts (1.3.2).
- AI agent mode, which edits the selected file and lets you approve or revert each change (1.3.4).
- Experimental `.odt` support (1.3.5).
- Chat history can be viewed without loading a model, and the chat's previous model can be reloaded (1.3.6).
- GGUF model downloads from Hugging Face inside the app (1.3.7).

### Changed

- The chat can be scrolled while the AI is responding (1.3.3).
- The vault refreshes automatically when files are added outside the app (1.3.8).

### Fixed

- Approved agent edits now refresh the file (1.3.8).
- Markdown issues (1.3.9).

## 1.2.0 – 1.2.9 - 2026-02-01 to 2026-02-12

### Added

- Search, accent color and restyled icons (1.2.0).
- Bookmarks (1.2.1).
- Audio recorder (1.2.2).
- Drawing canvas (1.2.4) with shapes (1.2.5).
- Local AI chat with GGUF models (1.2.8), with persistent chat history (1.2.9).

### Changed

- The menu header became a sidebar, with a smaller default window (1.2.6).

### Fixed

- Color theme issue (1.2.3).

## 1.1.0 – 1.1.9 - 2026-01-31 to 2026-02-01

### Added

- Support for videos (1.1.0), code files (1.1.1), audio (1.1.4) and PDF (1.1.6).
- Keyboard navigation in the file tree (1.1.2). Space plays and pauses video (1.1.3).
- Spellcheck with suggestions in the context menu (1.1.7).
- Multi-file selection (1.1.8).
- Markdown preview button (1.1.9).

## 1.0.0 – 1.0.9 - 2026-01-29 to 2026-01-31

### Added

- Initial release: a core note app for `.md` and `.txt` files (1.0.0 – 1.0.1).
- Light/dark theme and inline file renaming (1.0.2).
- Nested folders (1.0.4), with renaming and deleting through a dropdown menu (1.0.6).
- Logo (1.0.5).
- Drag and drop for files (1.0.7) and folders (1.0.8).
- Image support (1.0.9).

### Removed

- `.rtf` support (1.0.3).

[Unreleased]: https://github.com/larrydarko1/phylla-md/compare/v4.0.0...HEAD
[4.0.0]: https://github.com/larrydarko1/phylla-md/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/larrydarko1/phylla-md/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/larrydarko1/phylla-md/compare/v2.6.6...v3.0.1
[2.6.6]: https://github.com/larrydarko1/phylla-md/compare/v2.6.2...v2.6.6
[2.6.2]: https://github.com/larrydarko1/phylla-md/compare/v2.4.1...v2.6.2
[2.4.1]: https://github.com/larrydarko1/phylla-md/compare/v2.1.0...v2.4.1
[2.1.0]: https://github.com/larrydarko1/phylla-md/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/larrydarko1/phylla-md/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/larrydarko1/phylla-md/compare/v1.5.8...v2.0.0
[1.5.8]: https://github.com/larrydarko1/phylla-md/compare/v1.5.7...v1.5.8
[1.5.7]: https://github.com/larrydarko1/phylla-md/compare/v1.5.6...v1.5.7
[1.5.6]: https://github.com/larrydarko1/phylla-md/compare/v1.5.5...v1.5.6
[1.5.5]: https://github.com/larrydarko1/phylla-md/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/larrydarko1/phylla-md/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/larrydarko1/phylla-md/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/larrydarko1/phylla-md/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/larrydarko1/phylla-md/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/larrydarko1/phylla-md/compare/v1.4.9...v1.5.0
