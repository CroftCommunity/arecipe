// Substitution engine (plans/2026-08-12-1-plan-ingredient-normalization-and-
// substitutions.md, Phase 4). PURE — no DOM, no network, no clock.
//
// Two kinds of rule, one lookup:
//  - a COOK rule ("flour → almond flour", typed on the Account page) is stored
//    by canonical KEY (+ optional variety scope), never by raw text, and
//    REWRITES a matching line in place — quantity, unit and prep kept;
//  - a CURATED row (the reference chart's substitutions table) is a
//    SUGGESTION beside a line: "for 1 tablespoon cornstarch use 2 tablespoons
//    flour". It never rewrites, and nobody scales a ratio here.
// Matching is the resolver's: "flour" never claims "bread flour" (its own key),
// a variety-scoped rule ({paprika, smoked}) wins over a bare one and touches
// only that variety, and an unmatched line is left alone. Surfaced, never
// invented.
import { canonicalHead, resolveIngredient, type OverlayLookup, type Resolution, type Vocabulary } from './ingredient-key.js';
import { REFERENCE_SECTIONS } from '../pages/reference-view.js';

/** A cook's stored rule. `from` is what they typed (for display); the match is
 * by `fromKey` (+ `variety` when the typed text carried one). */
export type CookSubstitution = { from: string; fromKey: string; variety?: string; to: string };

/** A curated row: for `forAmount` of the keyed ingredient, use `use`. */
export type CuratedSubstitution = { from: { key: string; variety?: string }; forAmount: string; use: string };

export type LineSubstitution =
  | { kind: 'swap'; original: string; substituted: string; from: string; to: string }
  | { kind: 'suggestion'; original: string; forAmount: string; use: string };

/** Key a cook's typed rule. Null when the vocabulary does not know the
 * from-text (a rule that can never match is not stored) or a side is blank. */
export const keyCookSubstitution = (from: string, to: string, vocab: Vocabulary): CookSubstitution | null => {
  const f = from.trim();
  const t = to.trim();
  if (f === '' || t === '') return null;
  const r = resolveIngredient(f, vocab);
  if (r.method === 'unmatched') return null;
  const variety = r.variety[0];
  return { from: f, fromKey: r.key, ...(variety !== undefined ? { variety } : {}), to: t };
};

type Matched = Resolution & { method: 'exact' | 'alias' | 'overlay' };

const matchesScope = (r: Matched, key: string, variety: string | undefined): boolean =>
  r.key === key && (variety === undefined || r.variety.includes(variety));

/** The rule for a resolution: a variety-scoped rule first, then a bare one. */
const findCookRule = (r: Matched, rules: readonly CookSubstitution[]): CookSubstitution | undefined =>
  rules.find((s) => s.variety !== undefined && matchesScope(r, s.fromKey, s.variety)) ??
  rules.find((s) => s.variety === undefined && matchesScope(r, s.fromKey, undefined));

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A head word as it may appear in the line: singular or a regular plural
 * ("strawberry" → strawberr(?:y|ies), "onion" → onion(?:e?s)?). */
const pluralForms = (w: string): string =>
  /[^aeiou]y$/.test(w) ? `${escapeRegExp(w.slice(0, -1))}(?:y|ies)` : `${escapeRegExp(w)}(?:e?s)?`;

/** Follow the line's plural onto the replacement: raspberry → raspberries. */
const pluralize = (to: string): string => {
  const words = to.split(' ');
  const last = words[words.length - 1] ?? '';
  const plural = /[^aeiou]y$/.test(last) ? `${last.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(last) ? `${last}es` : `${last}s`;
  return [...words.slice(0, -1), plural].join(' ');
};

/** The words of the raw line a swap replaces: the matched head plus, walking
 * back from it, the contiguous peeled words that belong to the swap — a word
 * the key itself carries ("ground" of `ground beef`) or the rule's variety
 * scope ("smoked" for a {paprika, smoked} rule). A variety the rule does NOT
 * scope ("smoked" for a bare paprika rule) stays in the line. */
const spanWords = (raw: string, r: Matched, rule: CookSubstitution, vocab: Vocabulary): string[] => {
  const split = canonicalHead(raw, vocab.descriptors);
  const idx = split?.layers.indexOf(r.head) ?? -1;
  if (split === null || idx < 0) return r.head.split(' ');
  const keyWords = new Set(rule.fromKey.split(' '));
  const before = split.peeled.slice(0, idx);
  const included: string[] = [];
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const w = before[i]!.word;
    if (!keyWords.has(w) && w !== rule.variety) break;
    included.unshift(w);
  }
  return [...included, ...r.head.split(' ')];
};

/** Apply the first matching cook rule to one line. Null when none applies. */
export const substituteLine = (
  raw: string,
  rules: readonly CookSubstitution[],
  vocab: Vocabulary,
  opts: { overlay?: OverlayLookup } = {},
): (LineSubstitution & { kind: 'swap' }) | null => {
  if (rules.length === 0) return null;
  const r = resolveIngredient(raw, vocab, opts);
  if (r.method === 'unmatched') return null;
  const rule = findCookRule(r, rules);
  if (rule === undefined) return null;
  const words = spanWords(raw, r, rule, vocab);
  const pattern = new RegExp(`\\b${words.map((w, i) => (i === words.length - 1 ? pluralForms(w) : escapeRegExp(w))).join('\\s+')}\\b`, 'i');
  const m = pattern.exec(raw);
  let to = rule.to;
  if (m !== null) {
    const spanLast = m[0].split(/\s+/).pop() ?? '';
    const headLast = words[words.length - 1] ?? '';
    if (spanLast.toLowerCase() !== headLast && /s$/i.test(spanLast) && !/s$/i.test(to)) to = pluralize(to);
  }
  // Function replacement so a `to` containing `$` is inserted literally.
  const substituted = m === null ? to : raw.replace(pattern, () => to);
  return { kind: 'swap', original: raw, substituted, from: rule.from, to: rule.to };
};

/** Map raw lines through cook swaps (the shopping list's transform). Identity
 * — the same array — with no rules. */
export const substituteLines = (
  lines: string[],
  rules: readonly CookSubstitution[],
  vocab: Vocabulary,
  opts: { overlay?: OverlayLookup } = {},
): string[] => (rules.length === 0 ? lines : lines.map((raw) => substituteLine(raw, rules, vocab, opts)?.substituted ?? raw));

const curatedCache = new WeakMap<Vocabulary, CuratedSubstitution[]>();

/** The reference chart's substitution rows, keyed through the vocabulary. One
 * source, two surfaces: the Reference page keeps rendering the same rows. A row
 * whose subject the vocabulary does not know is dropped here (and a test says
 * the chart and the vocabulary agree). */
export const curatedSubstitutions = (vocab: Vocabulary): CuratedSubstitution[] => {
  const cached = curatedCache.get(vocab);
  if (cached !== undefined) return cached;
  const out: CuratedSubstitution[] = [];
  const section = REFERENCE_SECTIONS.find((s) => s.id === 'substitutions');
  for (const table of section?.tables ?? []) {
    if (table.kind !== 'pairs') continue;
    for (const [forAmount, use] of table.rows) {
      const r = resolveIngredient(forAmount, vocab);
      if (r.method === 'unmatched') continue;
      const variety = r.variety[0];
      out.push({ from: { key: r.key, ...(variety !== undefined ? { variety } : {}) }, forAmount, use });
    }
  }
  curatedCache.set(vocab, out);
  return out;
};

/** What a recipe page shows for one line: a cook swap when a rule applies,
 * else a curated suggestion when one resolves, else nothing. */
export const lineSubstitution = (
  raw: string,
  opts: { rules: readonly CookSubstitution[]; curated: readonly CuratedSubstitution[]; vocab: Vocabulary; overlay?: OverlayLookup },
): LineSubstitution | null => {
  const swap = substituteLine(raw, opts.rules, opts.vocab, { overlay: opts.overlay });
  if (swap !== null) return swap;
  if (opts.curated.length === 0) return null;
  const r = resolveIngredient(raw, opts.vocab, { overlay: opts.overlay });
  if (r.method === 'unmatched') return null;
  const c =
    opts.curated.find((x) => x.from.variety !== undefined && matchesScope(r, x.from.key, x.from.variety)) ??
    opts.curated.find((x) => x.from.variety === undefined && matchesScope(r, x.from.key, undefined));
  return c === undefined ? null : { kind: 'suggestion', original: raw, forAmount: c.forAmount, use: c.use };
};
