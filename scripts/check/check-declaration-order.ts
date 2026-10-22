#!/usr/bin/env node
/**
 * Declaration order. The canonical order of a module's top-level statements, the
 * topological sort that computes the one legitimate exception to it, the separate
 * table a test file is read against, and the import-sorting pass behind `--fix`
 * all live in @larrydarko/lint-config/gates/declaration-order.
 *
 * What stays here is the scope, which is the only thing this project knows:
 *   - src/ and tests/ are the whole of it.
 *   - No workspace scope: Phylla is a single package, so imports get three groups,
 *     not four — builtin → external → local.
 *   - `@test-utils` is a tsconfig path into this repo, not an npm package, so it
 *     sorts as local.
 *
 * Run `node scripts/check/check-declaration-order.ts --fix` to rewrite the import
 * block in place. That is the only pass with a fixer, because it is the only one
 * whose fix cannot change what a module does.
 */
import { checkDeclarationOrder } from '@larrydarko/lint-config/gates/declaration-order';

checkDeclarationOrder({
    sourceRoots: ['src', 'tests'],
    importOrder: { localAliases: ['@test-utils'] },
});
