// scripts/mock-snaps.mjs writes mocks/snaps/manifest.json (CroftC/.claude/MOCKS.md
// rule 3): one entry per captured file, each with its own baseline and population,
// and a run MERGES — it replaces the files it captured and keeps the rest. Why
// per file and merging: forage's manifest carried one baseline for all files and
// was replaced whole, so one mock's re-capture renamed the baseline another
// mock's pixels were taken at (2026-08-30).
import { describe, expect, it } from 'vitest';
import { mergeManifest, type SnapFile } from '../../scripts/lib/mock-snaps-manifest.mjs';

const file = (name: string, baseline: string, population = 'production'): SnapFile => ({
  file: name, route: 'index', viewport: 'phone', width: 390, height: 844, baseline, population,
});

describe('mergeManifest', () => {
  it('replaces the files a run captured and keeps the others, each with its own baseline', () => {
    const existing = { capturedAt: '2026-08-30', files: [file('index.phone.current.png', 'arecipe@aaa1111'), file('dish.phone.current.png', 'arecipe@aaa1111')] };
    const run = { capturedAt: '2026-08-31', files: [file('dish.phone.current.png', 'arecipe@bbb2222')] };
    const out = mergeManifest(existing, run);
    expect(out.files.map((f) => [f.file, f.baseline])).toEqual([
      ['index.phone.current.png', 'arecipe@aaa1111'],
      ['dish.phone.current.png', 'arecipe@bbb2222'],
    ]);
    expect(out.capturedAt).toBe('2026-08-31');
    expect(existing.files[1]?.baseline).toBe('arecipe@aaa1111'); // not mutated
  });

  it('lists kept files first in their order, then new ones', () => {
    const existing = { capturedAt: '2026-08-30', files: [file('b.png', 'arecipe@1'), file('a.png', 'arecipe@1')] };
    const out = mergeManifest(existing, { capturedAt: '2026-08-31', files: [file('c.png', 'arecipe@2'), file('a.png', 'arecipe@2')] });
    expect(out.files.map((f) => f.file)).toEqual(['b.png', 'a.png', 'c.png']);
  });

  it('with no manifest yet, the run is the manifest', () => {
    const run = { capturedAt: '2026-08-31', files: [file('a.png', 'arecipe@2')] };
    expect(mergeManifest(null, run)).toEqual(run);
  });
});
