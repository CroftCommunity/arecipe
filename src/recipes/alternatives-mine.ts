// Mining "X or Y" lines (plans/2026-08-12-1, Phase 5b). PURE. An author who
// writes "2 cups vegetable broth or water" has named a substitution they use,
// on a real recipe. Every "or" line in the census whose first part resolves
// yields (first → each later part) pairs, summed by line weight; the build
// tool (scripts/mine-alternatives.mjs) writes the ones over a floor as a
// second curated source of suggestions beside the reference chart.
import { resolveLine, type Vocabulary } from './ingredient-key.js';

export type MinedAlternative = { from: string; use: string; lines: number };

export const mineAlternatives = (
  rows: readonly (readonly [string, number])[],
  opts: { vocab: Vocabulary; minLines: number },
): { pairs: MinedAlternative[]; orLines: number; usable: number } => {
  const counts = new Map<string, number>();
  let orLines = 0;
  let usable = 0;
  for (const [raw, count] of rows) {
    const line = resolveLine(raw, opts.vocab);
    if (line.joiner !== 'or') continue;
    orLines += count;
    const first = line.parts[0];
    if (first === undefined || first.method === 'unmatched') continue;
    let any = false;
    for (const alt of line.parts.slice(1)) {
      if (alt.method === 'unmatched' || alt.key === first.key) continue;
      any = true;
      const k = `${first.key}\u0000${alt.key}`;
      counts.set(k, (counts.get(k) ?? 0) + count);
    }
    if (any) usable += count;
  }
  const pairs = [...counts.entries()]
    .map(([k, lines]) => {
      const [from, use] = k.split('\u0000') as [string, string];
      return { from, use, lines };
    })
    .filter((p) => p.lines >= opts.minLines)
    .sort((a, b) => b.lines - a.lines || a.from.localeCompare(b.from) || a.use.localeCompare(b.use));
  return { pairs, orLines, usable };
};
