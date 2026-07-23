import { defineConfig } from 'vitest/config';

// Self-contained scratch project. Uses the arecipe repo-root node_modules
// (vitest, typescript, playwright are already installed there); measure-proof
// declares no deps of its own. Run from repo root:
//   npx vitest run --config measure-proof/vitest.config.ts
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
