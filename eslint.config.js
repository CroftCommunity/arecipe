import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `spike/` and `tools/` are ops/import scratch; `.claude/` is untracked tooling
  // scratch (incl. nested git worktrees) — never lint them. A nested worktree
  // checkout otherwise trips typescript-eslint's "multiple candidate
  // TSConfigRootDirs" root detection.
  // `assets/ocr/` holds self-hosted Tesseract.js assets (minified worker + WASM
  // glue) — vendored binaries, never our source, so never linted.
  // `measure-proof/` is a self-contained scratch experiment repo (RUN-MEASURE-01)
  // with its own tsconfig/vitest/playwright config; it is not part of the arecipe
  // app or its gate. Never lint it from the root — its `.ts` imports use explicit
  // extensions for Node's native type-stripping, which trips the app's TS rules.
  { ignores: ['dist/', 'node_modules/', 'spike/', 'tools/', 'assets/ocr/', 'playwright-report/', 'test-results/', '.claude/', 'measure-proof/'] },
  ...tseslint.configs.recommended,
);
