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
//
// Phase 5, compound lines: a DERIVED form names an ingredient ("juice of 1
// lemon" is lemon juice); a COORDINATED line without a quantity is several
// ingredients ("salt and pepper"); an ALTERNATIVE line is one ingredient with
// fallbacks the author named ("vegetable broth or water" — the first is what
// they use). The whole head is always tried first, so a known compound
// ("sweet and sour sauce") is never split, and a line none of whose parts
// resolve stays unmatched as a whole rather than becoming two guesses.
import { fuzzyMatch } from './ingredient-fuzzy.js';
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
  /** Leading descriptors in order (one layer each). */
  peeled: readonly { word: string; cls: DescriptorClass }[];
  /** Prep/quality peeled from the END ("red onion sliced"); never variety. */
  trailing: readonly { word: string; cls: DescriptorClass }[];
  countUnit?: string;
  variety: string[];
  prep: string[];
  quality: string[];
};

/** Phase 6: the device-local overlay — what a cook confirmed an unmatched
 * name IS. Consulted first, by the identity-bearing name (`full`). */
export type OverlayLookup = (name: string) => string | undefined;

/** How a line was resolved: the deterministic paths, the device-local
 * overlay, or — only when asked, only last — the closed-set fuzzy tier, which
 * carries its cosine `score` so the UI can label it a closest match. */
export type Resolution =
  | {
      method: 'exact' | 'alias' | 'overlay' | 'fuzzy';
      key: string;
      head: string;
      countUnit?: string;
      variety: string[];
      prep: string[];
      quality: string[];
      score?: number;
    }
  | { method: 'unmatched'; name: string; head: string };

/** Resolver options: the Phase 6 overlay, and whether the M4 fuzzy tier may
 * answer after every deterministic path failed (off by default — the build
 * tool and the coverage metric stay deterministic). */
export type ResolveOptions = { overlay?: OverlayLookup; fuzzy?: boolean };

// --- head phrase -----------------------------------------------------------

const PARENTHETICAL = /\([^)]*\)?|\[[^\]]*\]?/g;
const CLAUSE_BREAK = /\s*[,;]\s*|\s+[-–—]\s+/;
const TRAILING_PHRASE =
  /\s*\b(?:plus\b.*|to taste\b.*|as needed\b.*|as required\b.*|or more\b.*|or to taste\b.*|or as needed\b.*|if desired\b.*|if needed\b.*|optional\b.*|divided\b.*|for (?:garnish|garnishing|serving|frying|deep-frying|dusting|greasing|brushing|topping|drizzling|decoration|decorating|coating|the [a-z-]+)\b.*)$/;
const LEADING_FILLER = /^(?:of|a|an|the|some|few|several|couple|couple of|handful of)\s+/;
const MARKUP = /<[^>]*>/g;
// HTML entities that leak from sources: numeric (&#189; is ½), named fractions
// (&frac12;, with or without the ampersand), and any other &name; — all read
// as nothing (a quantity the parser already lost, never an ingredient).
const ENTITY = /&#\d+;?|&?frac\d\d;?|&[a-z]+;/g;
const STRAY_PAREN = /[()]/g;
const SLASH_ALTERNATIVE = /([a-z])\/([a-z])/g;
const LEADING_JUNK = /^[^a-z0-9(]+/;

/** "juice of 1 lemon" → "lemon juice", "grated zest of 1 orange" → "orange
 * zest": the derived form is the ingredient. Anything else passes through. */
const DERIVED_FORM =
  /^(?:(?:freshly[- ]squeezed|fresh|finely[- ]grated|grated|strained)\s+)?(juice|zest)\s+of\s+(?:(?:[\d½¼¾⅓⅔⅛][\d/½¼¾⅓⅔⅛.]*|half|one|two|three|a|an|the)\s+)*(?:(?:large|small|medium|big|whole|fresh)\s+)?([a-z-]+?)(?:e?s)?$/;
export const derivedForm = (head: string): string => {
  const m = DERIVED_FORM.exec(head);
  return m === null ? head : `${m[2]} ${m[1]}`;
};

/** Reduce a parsed name (the tail of a line) to its head phrase. */
export const headPhrase = (name: string): string => {
  // "prawns/shrimp", "broiler/fryer": a slash between words is an alternative.
  const flat = name
    .toLowerCase()
    .replace(MARKUP, ' ')
    .replace(ENTITY, ' ')
    .replace(PARENTHETICAL, ' ')
    .replace(STRAY_PAREN, ' ')
    .replace(SLASH_ALTERNATIVE, '$1 or $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_JUNK, '');
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
    'block', 'tin', 'tub', 'carton', 'pod', 'bulb', 'square', 'bar', 'link', 'round', 'strand', 'thread', 'floret', 'ball', 'slab',
    'half',
  ];
  const map: Record<string, string> = { ea: 'each', each: 'each' };
  for (const w of singular) {
    map[w] = w;
    map[`${w}s`] = w;
  }
  map.halves = 'half';
  // The parser plural-folds a line's LAST word before we see it: "halves" arrives
  // as "halve", "loaves" as "loave".
  map.halve = 'half';
  map.loave = 'loaf';
  map.boxes = 'box';
  map.bunches = 'bunch';
  map.dashes = 'dash';
  map.loaves = 'loaf';
  map.splashes = 'splash';
  return map;
})();

const countUnitOf = (word: string): string | undefined => COUNT_UNITS[word.replace(/\.$/, '')];

/** Measure words that can lead a head when the quantity got lost ("tbsp tomato
 * paste", "dl sour cream", "quarts warm water") — plus a bare number. Stripped
 * at the FRONT only; the parser handles the normal "2 tbsp" case before us. */
const LEADING_MEASURE = new Set([
  'cup', 'cups', 'tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons', 'tsp', 'tsps', 'teaspoon', 'teaspoons',
  'oz', 'ozs', 'ounce', 'ounces', 'fl', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'gr', 'kg', 'kilogram', 'kilograms',
  'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'l', 'liter', 'liters', 'litre', 'litres', 'dl', 'cl',
  'quart', 'quarts', 'qt', 'qts', 'pint', 'pints', 'pt', 'pts', 'gallon', 'gallons', 'gal', 'cm', 'mm', 'inch', 'inches', 'in',
  'leaf', 'leaves', 'sprig', 'sprigs', 'pinch', 'pinches', 'dash', 'dashes', 'spoon', 'spoons', 'spoonful', 'spoonfuls',
]);
const NUMBERISH = /^[\d½¼¾⅓⅔⅛][\d/½¼¾⅓⅔⅛.,-]*$/;

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
  return splitHeadPhrase(derivedForm(headPhrase(parsed.name)), taxonomy);
};

/** The canonical head of one already-reduced head phrase (a whole line's, or
 * one part of a coordinated line's). */
const splitHeadPhrase = (phrase: string, taxonomy: DescriptorTaxonomy): SplitHead | null => {
  let words = phrase.split(' ').filter((w) => w !== '');
  if (words.length === 0) return null;

  const index = taxonomyIndex(taxonomy);
  const peeled: { word: string; cls: DescriptorClass }[] = [];
  const trailing: { word: string; cls: DescriptorClass }[] = [];
  let countUnit: string | undefined;

  // Front hygiene, interleaved with the leading-descriptor peel: a stray
  // number, a measure word the parser could not pair with a quantity, a count
  // word — then an "of" — and a descriptor may sit in ANY order ("1 large clove
  // garlic", "1 heaping teaspoon salt", "thumb-sized piece of ginger"), so
  // strip and peel in a loop until the front is the head. Never down to nothing.
  const stripFront = (): boolean => {
    let changed = false;
    while (words.length > 1 && (NUMBERISH.test(words[0]!) || LEADING_MEASURE.has(words[0]!.replace(/\.$/, '')))) {
      words = words.slice(1);
      if (words[0] === 'of' && words.length > 1) words = words.slice(1);
      changed = true;
    }
    const leading = words.length > 1 ? countUnitOf(words[0]!) : undefined;
    if (leading !== undefined) {
      countUnit = countUnit ?? leading;
      words = words.slice(1);
      if (words[0] === 'of' && words.length > 1) words = words.slice(1);
      changed = true;
    }
    return changed;
  };
  stripFront();
  // A trailing count word regardless of a leading one: "1 head cauliflower
  // florets" carries both; the head is cauliflower either way.
  if (words.length > 1) {
    const trailingUnit = countUnitOf(words[words.length - 1]!);
    if (trailingUnit !== undefined) {
      countUnit = countUnit ?? trailingUnit;
      words = words.slice(0, -1);
    }
  }
  // Trailing prep/quality without a comma ("red onion sliced"): peel from the
  // end first — these never change identity, and a layer with them attached
  // would only ever miss.
  while (words.length > 1) {
    const cls = index.get(words[words.length - 1]!);
    if (cls === undefined || cls === 'variety') break;
    trailing.unshift({ word: words[words.length - 1]!, cls });
    words = words.slice(0, -1);
  }
  const layers: string[] = [fold(words.join(' '))];
  while (words.length > 1) {
    const cls = index.get(words[0]!);
    if (cls === undefined) break;
    peeled.push({ word: words[0]!, cls });
    words = words.slice(1);
    if (stripFront()) layers.length = 0; // the front changed under us: earlier layers were not heads
    layers.push(fold(words.join(' ')));
  }

  const byClass = (cls: DescriptorClass): string[] => [...peeled, ...trailing].filter((p) => p.cls === cls).map((p) => p.word);
  return {
    head: layers[layers.length - 1]!,
    full: fold([...byClass('variety'), ...words].join(' ')),
    layers,
    peeled,
    trailing,
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

/** Resolve one canonical head: overlay > shipped baseline > unmatched. */
const resolveSplit = (split: SplitHead, vocab: Vocabulary, opts: ResolveOptions): Resolution => {
  const confirmed = opts.overlay?.(split.full);
  if (confirmed !== undefined) {
    return {
      method: 'overlay',
      key: confirmed,
      head: split.full,
      ...(split.countUnit !== undefined ? { countUnit: split.countUnit } : {}),
      variety: [],
      prep: split.prep,
      quality: split.quality,
    };
  }
  const index = keyIndex(vocab);
  for (const [i, layer] of split.layers.entries()) {
    const hit = index.get(layer);
    if (hit === undefined) continue;
    // A descriptor the key itself carries ("ground" in `ground beef`, reached
    // via alias "hamburger") is part of the identity, not a variety of it.
    const keyWords = new Set(hit.key.split(' '));
    const used = [...split.peeled.slice(0, i), ...split.trailing].filter((p) => !keyWords.has(p.word));
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

/** The fuzzy tier, last: only for an unmatched resolution, only when asked. */
const fuzzyFallback = (r: Resolution, split: SplitHead | null, vocab: Vocabulary, opts: ResolveOptions): Resolution => {
  if (r.method !== 'unmatched' || opts.fuzzy !== true || split === null) return r;
  const m = fuzzyMatch(split.full, vocab);
  if (m === null) return r;
  return {
    method: 'fuzzy',
    key: m.key,
    head: split.full,
    ...(split.countUnit !== undefined ? { countUnit: split.countUnit } : {}),
    variety: [],
    prep: split.prep,
    quality: split.quality,
    score: m.score,
  };
};

/** The head phrases a line is made of, BEFORE any vocabulary is consulted:
 * one, or several when a coordinator splits it ("and" only without a
 * quantity, "or" always). What the build tool groups by, so a coordinated
 * head can never become a key — its parts do. A real compound ingredient
 * ("sweet and sour sauce") is seeded as a key instead. */
export const lineHeads = (raw: string, taxonomy: DescriptorTaxonomy): { heads: SplitHead[]; joiner?: 'and' | 'or' } => {
  const parsed = parseIngredient(raw);
  if (parsed.unparsed === true) return { heads: [] };
  const head = derivedForm(headPhrase(parsed.name));
  const whole = splitHeadPhrase(head, taxonomy);
  if (whole === null) return { heads: [] };
  const m = COORDINATOR.exec(head);
  if (m === null) return { heads: [whole] };
  const joiner = m[1] as 'and' | 'or';
  if (joiner === 'and' && parsed.qty !== undefined) return { heads: [whole] };
  if (head.includes(joiner === 'and' ? ' or ' : ' and ')) return { heads: [whole] };
  const pieces = head.split(joiner === 'and' ? /\s+and\s+/ : /\s+or\s+/).map((p) => p.trim()).filter((p) => p !== '');
  const heads = pieces.map((piece) => splitHeadPhrase(derivedForm(piece), taxonomy)).filter((h): h is SplitHead => h !== null);
  return heads.length < 2 ? { heads: [whole] } : { heads, joiner };
};

/** A whole line resolved: its parts (one, or several for a coordinated or
 * alternative line) and how they were joined. `parts[0]` is the primary — what
 * the author uses; for "or" the rest are their named alternatives. */
export type LineResolution = { parts: Resolution[]; joiner?: 'and' | 'or' };

const COORDINATOR = /\s+(and|or)\s+/;

export const resolveLine = (raw: string, vocab: Vocabulary, opts: ResolveOptions = {}): LineResolution => {
  const parsed = parseIngredient(raw);
  if (parsed.unparsed === true) return { parts: [{ method: 'unmatched', name: raw.trim(), head: '' }] };
  const head = derivedForm(headPhrase(parsed.name));
  const whole = splitHeadPhrase(head, vocab.descriptors);
  if (whole === null) return { parts: [{ method: 'unmatched', name: raw.trim(), head: '' }] };
  const wholeResolution = resolveSplit(whole, vocab, opts);
  if (wholeResolution.method !== 'unmatched') return { parts: [wholeResolution] };

  // Unknown as a whole: is it several things? "and" only without a quantity
  // (a quantity binds to ONE ingredient); "or" with or without. One joiner kind.
  // The fuzzy tier waits until coordination has had its chance, so
  // "vegetable broth or water" is two parts, never one fuzzy hit on the whole.
  const wholeOrFuzzy = (): LineResolution => ({ parts: [fuzzyFallback(wholeResolution, whole, vocab, opts)] });
  const m = COORDINATOR.exec(head);
  if (m === null) return wholeOrFuzzy();
  const joiner = m[1] as 'and' | 'or';
  if (joiner === 'and' && parsed.qty !== undefined) return wholeOrFuzzy();
  const pieces = head.split(joiner === 'and' ? /\s+and\s+/ : /\s+or\s+/).map((p) => p.trim()).filter((p) => p !== '');
  if (pieces.length < 2 || head.includes(joiner === 'and' ? ' or ' : ' and ')) return wholeOrFuzzy();
  const resolvePiece = (piece: string): Resolution => {
    const split = splitHeadPhrase(derivedForm(piece), vocab.descriptors);
    if (split === null) return { method: 'unmatched', name: piece, head: piece };
    return fuzzyFallback(resolveSplit(split, vocab, opts), split, vocab, opts);
  };
  const parts = pieces.map(resolvePiece);
  // A shared noun: "chicken or vegetable broth" is chicken broth or vegetable
  // broth. When a one-word first piece + the tail of a multi-word second piece
  // names something the vocabulary knows, that is what the author meant;
  // "butter or olive oil" borrows nothing because "butter oil" is not a thing.
  const first = pieces[0]!;
  const second = pieces[1];
  if (joiner === 'or' && second !== undefined && !first.includes(' ') && second.includes(' ')) {
    const borrowed = resolvePiece(`${first} ${second.split(' ').slice(1).join(' ')}`);
    if (borrowed.method !== 'unmatched') parts[0] = borrowed;
  }
  if (parts.every((p) => p.method === 'unmatched')) return wholeOrFuzzy();
  // The primary is the first RESOLVED part: "broiler or fryer chicken" is a
  // chicken even when its first piece names nothing on its own.
  const firstResolved = parts.findIndex((p) => p.method !== 'unmatched');
  if (firstResolved > 0) parts.unshift(...parts.splice(firstResolved, 1));
  return { parts, joiner };
};

/** Resolve one raw ingredient line to its primary ingredient. */
export const resolveIngredient = (raw: string, vocab: Vocabulary, opts: ResolveOptions = {}): Resolution =>
  resolveLine(raw, vocab, opts).parts[0]!;
