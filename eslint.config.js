import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `spike/` and `tools/` are ops/import scratch; `.claude/` is untracked tooling
  // scratch (incl. nested git worktrees) — never lint them. A nested worktree
  // checkout otherwise trips typescript-eslint's "multiple candidate
  // TSConfigRootDirs" root detection.
  { ignores: ['dist/', 'node_modules/', 'spike/', 'tools/', 'playwright-report/', 'test-results/', '.claude/'] },
  ...tseslint.configs.recommended,
);
