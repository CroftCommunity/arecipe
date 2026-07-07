import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'spike/', 'playwright-report/', 'test-results/'] },
  ...tseslint.configs.recommended,
);
