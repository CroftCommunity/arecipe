// Vocabulary proposal (plans/2026-08-12-1 Phase 1). PURE. The build tool
// (scripts/build-ingredientkeys.mjs) feeds it the census and writes what it
// returns; a human reviews before it is committed. It groups lines with the
// SAME canonicalHead the runtime resolver uses, so a proposal can never drift
// from how the app will read a line. Everything is counted by line weight.
import { canonicalHead, resolveIngredient, type DescriptorTaxonomy, type Vocabulary } from './ingredient-key.js';

export type ProposalKey = {
  lines: number;
  aliases: string[];
  /** Descriptor-bearing forms that folded into this key ("brown sugar" under
   * `sugar`), for the reviewer to promote to their own key or keep as variety. */
  variants: { full: string; lines: number }[];
};

export type Proposal = {
  vocabulary: Vocabulary;
  keys: Record<string, ProposalKey>;
  /** Heads under the line floor — not keys; the "is this X?" backlog. */
  tail: { head: string; lines: number }[];
  coverage: { lines: number; matched: number; share: number };
};

export type ProposeOptions = {
  taxonomy: DescriptorTaxonomy;
  /** A head needs at least this many lines to become a key. */
  minLines: number;
  /** Hand-curated synonyms: key → alias PHRASES ("scallion" ← "green onion").
   * An alias claims exactly its phrase, most-specific-first, the way the
   * runtime does — it never claims the phrase's descriptor-stripped head. */
  seedAliases?: Readonly<Record<string, readonly string[]>>;
  /** Descriptor-bearing forms that are their own ingredient, not a variety
   * ("sweet potato" is not a potato variety): claimed whole, before peeling. */
  seedKeys?: readonly string[];
};

type Group = { lines: number; aliases: string[]; variants: Map<string, number> };

const mergeInto = (target: Group, source: Group, asAlias: string): void => {
  target.lines += source.lines;
  target.aliases.push(asAlias, ...source.aliases);
  for (const [full, n] of source.variants) target.variants.set(full, (target.variants.get(full) ?? 0) + n);
};

/** Spellings that differ only by a hyphen at one word boundary. */
const hyphenAlternates = (head: string): string[] => {
  const out: string[] = [];
  const words = head.split(' ');
  for (let i = 0; i < words.length - 1; i += 1) {
    out.push([...words.slice(0, i), `${words[i]}-${words[i + 1]}`, ...words.slice(i + 2)].join(' '));
  }
  if (head.includes('-')) out.push(head.replace(/-/g, ' '));
  return out;
};

export const proposeVocabulary = (rows: readonly (readonly [string, number])[], opts: ProposeOptions): Proposal => {
  const groups = new Map<string, Group>();
  const group = (head: string): Group => {
    const g = groups.get(head) ?? { lines: 0, aliases: [], variants: new Map() };
    groups.set(head, g);
    return g;
  };

  // The seed is itself a (small) vocabulary: seeded keys and aliases claim
  // lines through the SAME resolver the app runs, so "sweet pepper" claims its
  // phrase and nothing else, and "sweet potato" is claimed whole before
  // "sweet" could peel off. Lines the seed does not claim group by head.
  const seedKeys: Record<string, { aliases: string[] }> = {};
  for (const key of opts.seedKeys ?? []) seedKeys[key] = { aliases: [] };
  for (const [key, aliases] of Object.entries(opts.seedAliases ?? {})) {
    seedKeys[key] = { aliases: [...(seedKeys[key]?.aliases ?? []), ...aliases] };
  }
  const seedVocab: Vocabulary = { descriptors: opts.taxonomy, keys: seedKeys };
  for (const [key, entry] of Object.entries(seedKeys)) group(key).aliases.push(...entry.aliases);

  for (const [raw, count] of rows) {
    const split = canonicalHead(raw, opts.taxonomy);
    if (split === null) continue;
    const seeded = resolveIngredient(raw, seedVocab);
    const g = group(seeded.method === 'unmatched' ? split.head : seeded.key);
    g.lines += count;
    const full = seeded.method === 'unmatched' ? split.full : [...seeded.variety, seeded.head].join(' ');
    const own = seeded.method === 'unmatched' ? split.head : seeded.key;
    if (full !== own) g.variants.set(full, (g.variants.get(full) ?? 0) + count);
  }

  // Hyphen/space near-misses: the rarer spelling becomes an alias of the commoner.
  const byLinesAsc = [...groups.entries()].sort((a, b) => a[1].lines - b[1].lines);
  for (const [head, g] of byLinesAsc) {
    if (!groups.has(head)) continue;
    for (const alt of hyphenAlternates(head)) {
      const altHead = canonicalHead(alt, opts.taxonomy)?.head;
      if (altHead === undefined || altHead === head) continue;
      const target = groups.get(altHead);
      if (target === undefined || target.lines < g.lines) continue;
      groups.delete(head);
      mergeInto(target, g, head);
      break;
    }
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]));
  const keys: Record<string, ProposalKey> = {};
  const vocabKeys: Record<string, { aliases: string[] }> = {};
  const tail: { head: string; lines: number }[] = [];
  for (const [head, g] of sorted) {
    if (g.lines < opts.minLines) {
      tail.push({ head, lines: g.lines });
      continue;
    }
    const variants = [...g.variants.entries()]
      .map(([full, lines]) => ({ full, lines }))
      .sort((a, b) => b.lines - a.lines || a.full.localeCompare(b.full));
    keys[head] = { lines: g.lines, aliases: [...g.aliases], variants };
    vocabKeys[head] = { aliases: [...g.aliases] };
  }

  const vocabulary: Vocabulary = { descriptors: opts.taxonomy, keys: vocabKeys };
  let lines = 0;
  let matched = 0;
  for (const [raw, count] of rows) {
    lines += count;
    if (resolveIngredient(raw, vocabulary).method !== 'unmatched') matched += count;
  }
  return { vocabulary, keys, tail, coverage: { lines, matched, share: lines === 0 ? 0 : matched / lines } };
};
