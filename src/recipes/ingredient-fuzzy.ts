// The closed-set fuzzy tier (plans/2026-08-12-1-plan-ingredient-normalization-
// and-substitutions.md, M4 — Phases 7–8 as built). PURE.
//
// Character-trigram cosine similarity between an unmatched name and every key
// and alias the vocabulary ships. Closed-set by construction: it can only PICK
// an existing key, never invent one; it answers only above FUZZY_THRESHOLD;
// and the resolver runs it only after every deterministic path (overlay,
// exact, alias, coordination) came up empty. Its answer is labeled `fuzzy`
// with its score so the UI can say "closest match" and ask the cook to
// confirm — confirmations flow into the Phase 6 overlay and shrink this tier.
//
// Why lexical, not the plan's MiniLM: the security posture (docs/SECURITY.md)
// forbids `wasm-unsafe-eval`, which an ONNX runtime needs, and the model is a
// 23 MB download. Measured on the census tail (2026-09-14): trigrams alone take
// coverage from 85.9% to 90.5% at 0.7 and 87.5% at 0.8 — the plan's own 90%
// aspiration — with no dependency, no CSP change, and ~2 KB of code. Semantic
// synonyms ("swede" ↔ "rutabaga") are what aliases, the "?" and Phase 9 are for.
import type { Vocabulary } from './ingredient-key.js';

/** Accept a closest match at or above this cosine. Between the two measured
 * points (0.7 → 90.5% coverage with some wrong picks; 0.8 → 87.5%, tight). */
export const FUZZY_THRESHOLD = 0.75;

export type FuzzyMatch = { key: string; score: number; via: string };

type Grams = ReadonlyMap<string, number>;

const grams = (s: string): Grams => {
  const t = ` ${s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const g = new Map<string, number>();
  for (let i = 0; i + 3 <= t.length; i += 1) {
    const k = t.slice(i, i + 3);
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  return g;
};

const norm = (g: Grams): number => Math.sqrt([...g.values()].reduce((a, v) => a + v * v, 0));

/** Optimal-string-alignment edit distance (insert, delete, substitute, and
 * one adjacent transposition), for the single-word typo path. */
const editDistance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array.from({ length: b.length }, () => 0)]);
  for (let j = 1; j <= b.length; j += 1) d[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
};

/** A single word against a single-word entry: trigrams under-score a one-letter
 * typo in a short word ("tumeric" vs "turmeric" is 0.67), so one or two edits
 * in a word of five letters or more count as a match at 1 − edits/length. Only
 * word-to-word: on phrases a small edit distance can hide a different head
 * ("medium-size lemon" vs "medium-size onion" is three edits apart). */
const wordTypo = (a: string, b: string): number | null => {
  if (a === b) return 1;
  if (a.length < 5 || b.length < 5) return null;
  const edits = editDistance(a, b);
  const allowed = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return edits <= allowed ? 1 - edits / Math.max(a.length, b.length) : null;
};

/** Typos, word by word: the same number of words, every pair equal or within
 * one edit (two for long words). A phrase whose words align this way is the
 * same phrase mistyped; one whose words do not align is a different phrase
 * ("chocolate milk" vs "milk chocolate", "medium-size lemon" vs "…onion"). */
const typoScore = (name: string, entry: string): number => {
  const a = name.split(' ');
  const b = entry.split(' ');
  if (a.length !== b.length) return 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const s = wordTypo(a[i]!, b[i]!);
    if (s === null) return 0;
    total += s;
  }
  return total / a.length;
};

/** "iodised" is not "non-iodised", "refined" is not "unrefined": a negation
 * prefix on one side whose stem stands bare on the other is a different thing. */
const NEGATION = /^(?:non-?|un|no-)([a-z-]{4,})$/;
const negationConflict = (name: string, entry: string): boolean => {
  const conflict = (x: string, y: string): boolean =>
    x.split(' ').some((w) => {
      const m = NEGATION.exec(w);
      return m !== null && y.split(' ').includes(m[1]!);
    });
  return conflict(name, entry) || conflict(entry, name);
};

type Entry = { key: string; via: string; g: Grams; n: number };
const indexCache = new WeakMap<Vocabulary, Entry[]>();

const index = (v: Vocabulary): Entry[] => {
  const cached = indexCache.get(v);
  if (cached !== undefined) return cached;
  const out: Entry[] = [];
  for (const [key, entry] of Object.entries(v.keys)) {
    for (const text of [key, ...entry.aliases]) {
      const g = grams(text);
      out.push({ key, via: text, g, n: norm(g) });
    }
  }
  indexCache.set(v, out);
  return out;
};

/** The closest key by trigram cosine, or null below the threshold. */
export const fuzzyMatch = (name: string, vocab: Vocabulary, opts: { threshold?: number } = {}): FuzzyMatch | null => {
  const threshold = opts.threshold ?? FUZZY_THRESHOLD;
  const g = grams(name);
  const n = norm(g);
  if (n === 0) return null;
  const clean = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let best: FuzzyMatch | null = null;
  for (const e of index(vocab)) {
    let dot = 0;
    for (const [k, v] of g) {
      const w = e.g.get(k);
      if (w !== undefined) dot += v * w;
    }
    const via = e.via.toLowerCase();
    if (negationConflict(clean, via)) continue;
    const score = Math.max(dot / (n * e.n), typoScore(clean, via));
    if (score >= threshold && (best === null || score > best.score)) best = { key: e.key, score, via: e.via };
  }
  return best;
};
