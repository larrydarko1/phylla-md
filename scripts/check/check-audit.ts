#!/usr/bin/env node
/**
 * Dependency audit with a reviewed allowlist. `npm audit` has no ignore
 * mechanism, so one upstream-blocked advisory turns CI permanently red — and the
 * usual reaction, dropping `--audit-level` to critical, silently swallows every
 * future high finding too. The wrapper, and the three ways a waiver fails on its
 * own (past its review date, no longer reported, or missing a field), live in
 * @larrydarko/lint-config/gates/audit.
 *
 * What stays here is the allowlist, which is the only part that is this project's
 * decision — and the goal is for it to stay empty. An entry is an advisory this
 * repo has decided to ship with, which is only ever right when the fix is
 * genuinely out of reach from here.
 */
import { checkAudit } from '@larrydarko/lint-config/gates/audit';

checkAudit({
    allowlist: [
        // Each entry: { id, package, reason, expires }. The reason must say BOTH
        // why it cannot be fixed here and why it is unreachable in Phylla's code.
    ],
});
