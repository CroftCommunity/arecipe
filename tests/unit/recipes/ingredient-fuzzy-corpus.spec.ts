// The fuzzy tier battle-tested on the real corpus (the arecipe account's 4,041
// recipes, every distinct ingredient line with its count — the census fixture).
// Two legs:
//  1. PRECISION, semantic: a judged sample of real unmatched names by score
//     band (tests/fixtures/ingredients/fuzzy-judged.json). The shipped
//     threshold must sit where precision is high, and the band just below it
//     must be markedly worse — the cut has to earn its keep against the data.
//  2. RECALL, realistic: lines the vocabulary already knows, perturbed the way
//     cooks actually type them (a typo, a plural, a stray unit, trailing prep,
//     word order), must still come back to the same key — through the
//     deterministic paths or the fuzzy one, whichever catches them.
// Numbers print so a regression is visible; floors sit below the measured
// values, not at a wished-for level.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FUZZY_THRESHOLD, fuzzyMatch } from '../../../src/recipes/ingredient-fuzzy.js';
import { resolveIngredient } from '../../../src/recipes/ingredient-key.js';
import { INGREDIENT_VOCABULARY as vocab } from '../../../src/recipes/ingredient-vocabulary.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../fixtures/ingredients/${name}`, import.meta.url), 'utf8'));
const judged = fixture('fuzzy-judged.json') as { rows: { name: string; pick: string; score: number; band: number; verdict: 'right' | 'wrong' }[] };
const census = fixture('census-lines.json') as { rows: [string, number][] };

const precision = (rows: { verdict: 'right' | 'wrong' }[]): number => rows.filter((r) => r.verdict === 'right').length / rows.length;

describe('precision by score band (judged sample)', () => {
  // Re-score with the CURRENT matcher: a row counts at the band the matcher
  // puts it in today, with the verdict it was judged with (a pick that changed
  // is re-checked against the judged pick — a different key is a miss).
  const rescored = judged.rows.map((r) => {
    const m = fuzzyMatch(r.name, vocab, { threshold: 0.5 });
    const same = m !== null && m.key === r.pick;
    return { ...r, now: m, verdict: (same ? r.verdict : m === null ? 'none' : 'wrong') as 'right' | 'wrong' | 'none' };
  });
  const above = rescored.filter((r) => r.now !== null && r.now.score >= FUZZY_THRESHOLD && r.verdict !== 'none') as { verdict: 'right' | 'wrong' }[];
  const belowBand = rescored.filter((r) => r.now !== null && r.now.score < FUZZY_THRESHOLD && r.now.score >= FUZZY_THRESHOLD - 0.1 && r.verdict !== 'none') as { verdict: 'right' | 'wrong' }[];

  it('at or above the shipped threshold, at least 80% of picks name the same ingredient', () => {
    console.log(`[fuzzy-eval] precision ≥${FUZZY_THRESHOLD}: ${(precision(above) * 100).toFixed(0)}% of ${above.length}`);
    expect(above.length).toBeGreaterThan(40);
    expect(precision(above)).toBeGreaterThanOrEqual(0.8);
  });

  it('the band just below the threshold is at least 15 points worse — the cut earns its keep', () => {
    console.log(`[fuzzy-eval] precision ${(FUZZY_THRESHOLD - 0.1).toFixed(2)}–${FUZZY_THRESHOLD}: ${(precision(belowBand) * 100).toFixed(0)}% of ${belowBand.length}`);
    expect(belowBand.length).toBeGreaterThan(20);
    expect(precision(above) - precision(belowBand)).toBeGreaterThanOrEqual(0.15);
  });

  it('a negation prefix is a different ingredient: "iodised salt" is not non-iodised, "refined sugar" is not unrefined', () => {
    for (const [name, notKey] of [['iodised salt', 'non-iodised salt'], ['refined sugar', 'unrefined sugar'], ['salted butter', 'unsalted butter']]) {
      const m = fuzzyMatch(name!, vocab);
      expect(m?.key, name).not.toBe(notKey);
    }
  });
});

describe('recall over realistic perturbations of lines the vocabulary knows', () => {
  // Deterministic sample: the 300 most-used names that resolve exactly, by
  // line weight, so the perturbations hit the ingredients cooks write most.
  const known = (() => {
    const byKey = new Map<string, { raw: string; key: string; lines: number }>();
    for (const [raw, lines] of census.rows) {
      const r = resolveIngredient(raw, vocab);
      if (r.method !== 'exact' || r.head.includes(' ') === false && r.head.length < 5) continue;
      const cur = byKey.get(r.key);
      if (cur === undefined || cur.lines < lines) byKey.set(r.key, { raw, key: r.key, lines });
    }
    return [...byKey.values()].sort((a, b) => b.lines - a.lines).slice(0, 300);
  })();

  const perturb: Record<string, (raw: string) => string> = {
    'typo (swap two letters in the longest word)': (raw) => {
      const words = raw.split(' ');
      const i = words.reduce((best, w, idx) => (w.length > words[best]!.length && /^[a-z]+$/i.test(w) ? idx : best), 0);
      const w = words[i]!;
      if (w.length < 6) return raw;
      const p = Math.floor(w.length / 2);
      words[i] = w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2);
      return words.join(' ');
    },
    'stray unit with no quantity': (raw) => `tbsp ${raw.replace(/^[\d½¼¾⅓⅔⅛][^\s]*\s+(?:cups?|tsp|tbsp|g|oz|lb|ml)\s+/i, '')}`,
    'trailing prep, no comma': (raw) => `${raw} chopped`,
    'dropped last letter of the head': (raw) => raw.replace(/([a-z]{5,})([,\s]|$)/i, (_m, w: string, tail: string) => `${w.slice(0, -1)}${tail}`),
  };

  for (const [label, fn] of Object.entries(perturb)) {
    it(`recovers the key after: ${label}`, () => {
      let tried = 0;
      let hit = 0;
      let viaFuzzy = 0;
      for (const k of known) {
        const p = fn(k.raw);
        if (p === k.raw) continue;
        tried += 1;
        const r = resolveIngredient(p, vocab, { fuzzy: true });
        if (r.method !== 'unmatched' && r.key === k.key) {
          hit += 1;
          if (r.method === 'fuzzy') viaFuzzy += 1;
        }
      }
      console.log(`[fuzzy-eval] ${label}: ${hit}/${tried} recovered (${viaFuzzy} via fuzzy)`);
      expect(tried).toBeGreaterThan(100);
      expect(hit / tried).toBeGreaterThanOrEqual(0.8);
    }, 30_000);
  }
});
