// e2e write-space guard. tests/e2e/meta-strip.spec.ts used to write its
// screenshots into runs/recipe-meta-strip/shots/ — a TRACKED directory — so
// every e2e run re-rendered 18 PNGs and left the shared checkout dirty
// (workspace-audit FLAG, COORDINATION Rule 1; observed 2026-09-08 with a
// month-old set of uncommitted re-renders nobody meant to commit).
//
// The invariant under test: an e2e spec that reaches OUTSIDE tests/ (a
// `new URL('../../…', import.meta.url)` — i.e. a repo-root-relative path) may
// only touch gitignored space. Reads of dist/ and .env qualify; a write target
// under runs/ does not. Fixtures live under tests/ and are reached with a
// single `..`, so they are not in scope.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });

type Reach = { file: string; target: string };

/** Every repo-root-relative URL an e2e file constructs, resolved to a repo path. */
const outOfTreeReaches = (): Reach[] =>
  walk(`${root}tests/e2e`).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/new URL\(\s*['"`]((?:\.\.\/){2,}[^'"`]*)['"`]\s*,\s*import\.meta\.url/g)].map((m) => ({
      file: relative(root, file),
      target: relative(root, resolve(dirname(file), m[1]!)),
    }));
  });

const isIgnored = (path: string): boolean => {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe('e2e write-space guard', () => {
  it('finds at least one out-of-tree reach (the guard is not grading an empty set)', () => {
    expect(outOfTreeReaches().length).toBeGreaterThan(0);
  });

  it('every out-of-tree path an e2e spec reaches is gitignored', () => {
    const tracked = outOfTreeReaches().filter(({ target }) => !isIgnored(target));
    expect(
      tracked,
      'e2e specs may only reach into gitignored space outside tests/; these reach tracked paths: ' +
        tracked.map((r) => `${r.file} → ${r.target}`).join(', '),
    ).toEqual([]);
  });
});
