import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `spike/` and `tools/` are ops/import scratch; `.claude/` is untracked tooling
  // scratch (incl. nested git worktrees) — never lint them. A nested worktree
  // checkout otherwise trips typescript-eslint's "multiple candidate
  // TSConfigRootDirs" root detection.
  // `assets/ocr/` holds self-hosted Tesseract.js assets (minified worker + WASM
  // glue) — vendored binaries, never our source, so never linted.
  { ignores: ['dist/', 'node_modules/', 'spike/', 'tools/', 'assets/ocr/', 'playwright-report/', 'test-results/', '.claude/'] },
  ...tseslint.configs.recommended,
);
