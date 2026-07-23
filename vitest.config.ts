import { configDefaults, defineConfig } from 'vitest/config';

// `.claude/` is untracked tooling scratch and can hold nested git worktrees
// (full repo checkouts). Exclude it so the unit runner doesn't collect another
// context's copy of the suite — `vitest run tests/unit` treats its argument as a
// substring filter, which otherwise matches `.claude/worktrees/*/tests/unit`.
export default defineConfig({
  test: {
    // `measure-proof/**` is a self-contained scratch experiment repo with its own
    // vitest config; its tests (`measure-proof/tests/unit/*`) match the `tests/unit`
    // substring filter, so exclude them from the app's unit run.
    exclude: [...configDefaults.exclude, '.claude/**', 'measure-proof/**'],
  },
});
