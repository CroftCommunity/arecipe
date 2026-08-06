// Toolchain pin guard. CI pins a Node version; a local checkout had nothing
// pointing at it, so `npm run test:unit` could be red locally and green in CI on
// code nobody touched. That actually happened: Node 25 ships a global
// `localStorage` that shadows happy-dom's, and without `--localstorage-file` it
// is a stub with no `.clear()` — so tests/unit/social/cookbook-members-view.spec.ts
// failed 7 tests locally while CI (Node 22) stayed green.
//
// The fix is `.nvmrc`, but a pin that silently drifts from CI is worse than
// none — it would point developers at the wrong version with false confidence.
// So the invariant under test is AGREEMENT, not the literal value: whatever CI
// pins, `.nvmrc` must match. Bumping CI without bumping `.nvmrc` fails here.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const nvmrcVersion = (): string => readFileSync(`${root}.nvmrc`, 'utf8').trim().replace(/^v/, '');

/** Every `node-version:` pin across the workflows, with its source file. */
const ciNodeVersions = (): { file: string; version: string }[] => {
  const dir = `${root}.github/workflows`;
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .flatMap((file) => {
      const text = readFileSync(`${dir}/${file}`, 'utf8');
      return [...text.matchAll(/node-version:\s*['"]?([0-9.]+)['"]?/g)].map((m) => ({
        file,
        version: m[1]!,
      }));
    });
};

describe('toolchain pin', () => {
  it('declares a local Node pin in .nvmrc', () => {
    expect(nvmrcVersion()).toMatch(/^\d+(\.\d+)*$/);
  });

  it('pins the same Node major locally as every workflow does in CI', () => {
    const local = nvmrcVersion().split('.')[0];
    const ci = ciNodeVersions();

    expect(ci.length, 'expected at least one node-version: pin in .github/workflows').toBeGreaterThan(0);

    const mismatched = ci.filter(({ version }) => version.split('.')[0] !== local);
    expect(
      mismatched,
      `.nvmrc pins Node ${local} but these workflows disagree: ` +
        mismatched.map((m) => `${m.file}→${m.version}`).join(', '),
    ).toEqual([]);
  });
});
