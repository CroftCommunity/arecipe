// Ingredient resolver core (plans/2026-08-12-1-plan-ingredient-normalization-
// and-substitutions.md, Phase 2). PURE — no DOM, no network, no clock.
//
// Why this exists (Phase 0, runs/ingredient-normalization/PHASE0-FINDINGS.md):
// `parseIngredient(...).name` is the whole TAIL of a line, not a head noun —
// "cloves garlic, minced", "(240 ml) milk" and "salt to taste" are three
// different names for two ingredients. So before any lookup the resolver owns
// three splits, in order: the HEAD PHRASE (before the first comma, minus
// parentheticals and trailing "to taste"-style phrases), the COUNT UNIT
// ("cloves", "can", "ea.") the parser does not know as a unit, and the leading
// DESCRIPTORS classed by the vocabulary's taxonomy (variety changes identity
// and substitution behavior; prep and quality do not).
//
// Lookup is most-specific-first: the full head is tried as a key or alias
// before any descriptor is peeled, so "black pepper" can be its own key while
// "smoked paprika" resolves to `paprika` + variety `smoked`. No substring
// matching, ever — "flour" never claims "bread flour". Unmatched stays
// unmatched, loudly: surfaced, never invented.
import { normalizeIngredientName, parseIngredient } from './shopping-list.js';

/** Descriptor words by class. Data, not code — shipped in the vocabulary. */
export type DescriptorTaxonomy = {
  readonly variety: readonly string[];
  readonly prep: readonly string[];
  readonly quality: readonly string[];
};

/** The shipped vocabulary: canonical keys with their aliases, plus the taxonomy. */
export type Vocabulary = {
  readonly descriptors: DescriptorTaxonomy;
  readonly keys: Readonly<Record<string, { readonly aliases: readonly string[] }>>;
};

export type DescriptorClass = 'variety' | 'prep' | 'quality';

/** A line reduced to its head, with what came off on the way. `layers` runs
 * most-specific → bare head, one entry per peeled descriptor, so a lookup can
 * stop at the first layer the vocabulary knows. `full` is the identity-bearing
 * form: variety words kept, prep and quality dropped ("freshly-ground black
 * pepper" → "black pepper") — what an unmatched line is reported as. */
export type SplitHead = {
  head: string;
  full: string;
  layers: readonly string[];
  peeled: readonly { word: string; cls: DescriptorClass }[];
  countUnit?: string;
  variety: string[];
  prep: string[];
  quality: string[];
};

export type Resolution =
  | {
      method: 'exact' | 'alias';
      key: string;
      head: string;
      countUnit?: string;
      variety: string[];
      prep: string[];
      quality: string[];
    }
  | { method: 'unmatched'; name: string; head: string };

// --- head phrase -----------------------------------------------------------

const PARENTHETICAL = /\([^)]*\)?|\[[^\]]*\]?/g;
const CLAUSE_BREAK = /\s*[,;]\s*|\s+[-–—]\s+/;
const TRAILING_PHRASE =
  /\s*\b(?:plus\b.*|to taste\b.*|as needed\b.*|as required\b.*|or more\b.*|or to taste\b.*|or as needed\b.*|if desired\b.*|if needed\b.*|optional\b.*|divided\b.*|for (?:garnish|garnishing|serving|frying|deep-frying|dusting|greasing|brushing|topping|drizzling|decoration|decorating|coating|the [a-z-]+)\b.*)$/;
const LEADING_FILLER = /^(?:of|a|an|the|some)\s+/;

/** Reduce a parsed name (the tail of a line) to its head phrase. */
export const headPhrase = (name: string): string => {
  const flat = name.toLowerCase().replace(PARENTHETICAL, ' ').replace(/\s+/g, ' ').trim();
  const clause = flat.split(CLAUSE_BREAK)[0] ?? '';
  let s = clause.replace(TRAILING_PHRASE, '').replace(/[.*:]+$/, '').trim();
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(LEADING_FILLER, '').trim();
  }
  return s.replace(/\s+/g, ' ').trim();
};

// --- count units -----------------------------------------------------------

/** Container / count words the parser does not treat as units, singular form. */
const COUNT_UNITS: Readonly<Record<string, string>> = (() => {
  const singular = [
    'clove', 'can', 'slice', 'stick', 'sprig', 'bunch', 'package', 'pkg', 'packet', 'head', 'piece',
    'dash', 'stalk', 'rib', 'ear', 'jar', 'bottle', 'box', 'bag', 'cube', 'drop', 'handful', 'sheet',
    'strip', 'envelope', 'container', 'scoop', 'knob', 'splash', 'sprinkle', 'loaf', 'wedge', 'chunk',
    'block', 'tin', 'tub', 'carton', 'pod', 'bulb',
  ];
  const map: Record<string, string> = { ea: 'each', each: 'each' };
  for (const w of singular) {
    map[w] = w;
    map[`${w}s`] = w;
  }
  map.boxes = 'box';
  map.bunches = 'bunch';
  map.dashes = 'dash';
  map.loaves = 'loaf';
  map.splashes = 'splash';
  return map;
})();

const countUnitOf = (word: string): string | undefined => COUNT_UNITS[word.replace(/\.$/, '')];

// --- plural fold -----------------------------------------------------------

/** Irregular plurals the parser's last-word fold gets wrong ("leaves" → "leave"). */
const IRREGULAR_FOLD: Readonly<Record<string, string>> = {
  leave: 'leaf', halve: 'half', loave: 'loaf', knive: 'knife', calve: 'calf', shelve: 'shelf', thieve: 'thief',
};

const fold = (phrase: string): string => {
  const n = normalizeIngredientName(phrase);
  const words = n.split(' ');
  const last = words[words.length - 1] ?? '';
  const fixed = IRREGULAR_FOLD[last];
  if (fixed !== undefined) words[words.length - 1] = fixed;
  return words.join(' ');
};

// --- descriptors -----------------------------------------------------------

type TaxonomyIndex = ReadonlyMap<string, DescriptorClass>;
const taxonomyCache = new WeakMap<DescriptorTaxonomy, TaxonomyIndex>();

const taxonomyIndex = (t: DescriptorTaxonomy): TaxonomyIndex => {
  const cached = taxonomyCache.get(t);
  if (cached !== undefined) return cached;
  const m = new Map<string, DescriptorClass>();
  for (const w of t.quality) m.set(w.toLowerCase(), 'quality');
  for (const w of t.prep) m.set(w.toLowerCase(), 'prep');
  for (const w of t.variety) m.set(w.toLowerCase(), 'variety');
  taxonomyCache.set(t, m);
  return m;
};

/** Split one raw line into its canonical head. Null when the parser found no
 * usable name (a bare quantity, punctuation) — surfaced upstream as unmatched. */
export const canonicalHead = (raw: string, taxonomy: DescriptorTaxonomy): SplitHead | null => {
  const parsed = parseIngredient(raw);
  if (parsed.unparsed === true) return null;
  let words = headPhrase(parsed.name).split(' ').filter((w) => w !== '');
  if (words.length === 0) return null;

  let countUnit: string | undefined;
  const leading = countUnitOf(words[0]!);
  if (leading !== undefined && words.length > 1) {
    countUnit = leading;
    words = words.slice(1);
    if (words[0] === 'of' && words.length > 1) words = words.slice(1);
  } else if (words.length > 1) {
    const trailing = countUnitOf(words[words.length - 1]!);
    if (trailing !== undefined) {
      countUnit = trailing;
      words = words.slice(0, -1);
    }
  }

  const index = taxonomyIndex(taxonomy);
  const peeled: { word: string; cls: DescriptorClass }[] = [];
  const layers: string[] = [fold(words.join(' '))];
  while (words.length > 1) {
    const cls = index.get(words[0]!);
    if (cls === undefined) break;
    peeled.push({ word: words[0]!, cls });
    words = words.slice(1);
    layers.push(fold(words.join(' ')));
  }

  const byClass = (cls: DescriptorClass): string[] => peeled.filter((p) => p.cls === cls).map((p) => p.word);
  return {
    head: layers[layers.length - 1]!,
    full: fold([...byClass('variety'), ...words].join(' ')),
    layers,
    peeled,
    ...(countUnit !== undefined ? { countUnit } : {}),
    variety: byClass('variety'),
    prep: byClass('prep'),
    quality: byClass('quality'),
  };
};

// --- lookup ----------------------------------------------------------------

type KeyIndex = ReadonlyMap<string, { key: string; via: 'exact' | 'alias' }>;
const keyCache = new WeakMap<Vocabulary, KeyIndex>();

/** Keys and aliases, normalized the same way heads are, so "green onions"
 * meets alias "green onion". A key always wins over an alias of the same text. */
const keyIndex = (v: Vocabulary): KeyIndex => {
  const cached = keyCache.get(v);
  if (cached !== undefined) return cached;
  const m = new Map<string, { key: string; via: 'exact' | 'alias' }>();
  for (const [key, entry] of Object.entries(v.keys)) {
    for (const alias of entry.aliases) {
      const a = fold(alias);
      if (!m.has(a)) m.set(a, { key, via: 'alias' });
    }
  }
  for (const key of Object.keys(v.keys)) m.set(fold(key), { key, via: 'exact' });
  keyCache.set(v, m);
  return m;
};

/** Resolve one raw ingredient line against the vocabulary. */
export const resolveIngredient = (raw: string, vocab: Vocabulary): Resolution => {
  const split = canonicalHead(raw, vocab.descriptors);
  if (split === null) return { method: 'unmatched', name: raw.trim(), head: '' };
  const index = keyIndex(vocab);
  for (const [i, layer] of split.layers.entries()) {
    const hit = index.get(layer);
    if (hit === undefined) continue;
    const used = split.peeled.slice(0, i);
    const byClass = (cls: DescriptorClass): string[] => used.filter((p) => p.cls === cls).map((p) => p.word);
    return {
      method: hit.via,
      key: hit.key,
      head: layer,
      ...(split.countUnit !== undefined ? { countUnit: split.countUnit } : {}),
      variety: byClass('variety'),
      prep: byClass('prep'),
      quality: byClass('quality'),
    };
  }
  return { method: 'unmatched', name: split.full, head: split.full };
};
