import { stylelint } from '@larrydarko/lint-config/stylelint';

// `variablesOverride`: _variables.scss maps every `--token` to a `$variable`, but the `:root` that
// declares them is in _theme.scss, and stylelint resolves custom properties per file — so from
// there every token looks undeclared. The real three-way check is the scss-standards gate in larry.config.ts.
export default stylelint({ variablesOverride: true });
