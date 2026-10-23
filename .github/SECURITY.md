# Security Policy

## Security Architecture

Phylla is a **desktop-only application** with local-first architecture, which provides enhanced security:

- ✅ **No server-side code** - No backend vulnerabilities
- ✅ **Local-only storage** - Notes stored as plain text files on user's computer
- ✅ **No network requests** - The app makes no outbound connections; nothing is ever transmitted
- ✅ **No encryption needed** - Files are standard text files accessible to user
- ✅ **No telemetry** - No tracking or analytics
- ✅ **Open source** - Fully auditable code

## Data Privacy

Your notes are stored in the vault folder you choose. App settings are stored locally at:

- **macOS:** `~/Library/Application Support/Phylla/`
- **Windows:** `%APPDATA%/Phylla/`
- **Linux:** `~/.config/Phylla/`

Your notes (.txt, .md, .rtf files) never leave your device.

## Reporting a Vulnerability

**Do not open a public issue.** Phylla has no auto-update — installed copies stay on whatever version
the user downloaded until they choose to replace it. A public report is therefore a working
disclosure against every existing install, and unlike a web app there is no way to push the fix out.

Email the maintainer at <hello@larrydarko.dev> instead. Private reporting on GitHub is not enabled,
so email is the only private channel — reports sent any other way risk being public.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if applicable)

Expect an acknowledgement within a week. Phylla is maintained by one person, so a fix timeline depends
on severity; you will be told which release carries the fix, and credited in it unless you ask not to
be.

## Scope

In scope: anything reachable in the Electron app or its IPC surface — preload bridge escapes, path
traversal out of the vault, renderer code execution through note content, and tampering with the
model download path.

Out of scope: findings that require an attacker to already have the user's filesystem or OS account.
Notes are plain files with the user's own permissions by design, so "another local process can read
the vault" is the threat model working as intended, not a vulnerability.

Dependency advisories with no reachable path in Phylla's code are tracked in the audit gate's
allowlist ([scripts/check/check-audit.ts](../scripts/check/check-audit.ts)) rather than reported
as vulnerabilities. Each entry carries the reason it cannot be fixed here, and CI fails once the
advisory stops being reported — upstream shipped a fix, so the waiver has to go.

## Supported Versions

Security issues are fixed in the latest release only. There are no backports — upgrade is the
remediation path.

## Security Best Practices for Users

- Keep the app updated to the latest version
- Regularly backup your vault folder
- Only download from official releases
- Store sensitive notes in encrypted volumes if needed (OS-level encryption)
