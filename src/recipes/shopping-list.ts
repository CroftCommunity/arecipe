// Shopping-list core: a small, DETERMINISTIC ingredient parser + aggregator +
// markdown renderer for turning a range of scheduled meals into a shopping list.
// PURE — no DOM, no network, no clock. Conservative by design: being honest
// about what it can't confidently parse (the flag / "as listed" valves) beats
// being confident and wrong. See plans/2026-07-18-1-plan-shopping-list.md.
//
// Phase 1 (this section): parseIngredient — one free-text ingredient line to
// { qty?, unit?, name, raw, unparsed? }. The grammar is pinned by the fixture
// table tests/fixtures/shopping/ingredient-lines.json; extend the table before
// the grammar.

import { dateForSlot } from './meal-plan-dates.js';
import { expandCalendar } from './meal-plan.js';

/** A quantity: a single value (min===max, range=false) or a kept range. */
export type QuantityValue = { min: number; max: number; range: boolean };

/** One parsed ingredient line. `name` is normalized (lowercased, collapsed,
 * plural-folded); `raw` is preserved verbatim for the By-recipe view. A line
 * with no usable name (empty after stripping a leading qty/unit, or no letters)
 * is `unparsed` and carries only its raw text. */
export type ParsedIngredient = {
  raw: string;
  name: string;
  qty?: QuantityValue;
  unit?: CanonicalUnit;
  unparsed?: boolean;
};

// --- units -----------------------------------------------------------------

/** Canonical unit keys the parser recognizes. An unrecognized middle token is
 * part of the NAME, never coerced to a unit. */
export type CanonicalUnit = 'tsp' | 'tbsp' | 'cup' | 'oz' | 'lb' | 'g' | 'kg' | 'ml' | 'l' | 'pinch';

/** Synonym + plural forms → canonical key. Only unambiguous forms (no bare
 * single letters like `t`/`c` that collide across units). */
const UNIT_SYNONYMS: Record<string, CanonicalUnit> = {
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbsps: 'tbsp', tbl: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  oz: 'oz', ozs: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  pinch: 'pinch', pinches: 'pinch',
};

/** A unit's aggregation family + its ratio to the family's base unit. Metric and
 * imperial stay SEPARATE families on purpose: two "volume" lines in different
 * measurement systems are an honest separate listing, never a fuzzy imperial↔
 * metric conversion (conservative > confidently wrong). Ratios inside a family
 * are exact integers, so same-unit sums stay exact. */
export type UnitFamily = 'vol-imp' | 'vol-met' | 'wt-imp' | 'wt-met' | 'pinch';

export const UNIT_FAMILY: Record<CanonicalUnit, { family: UnitFamily; ratio: number }> = {
  tsp: { family: 'vol-imp', ratio: 1 },
  tbsp: { family: 'vol-imp', ratio: 3 },
  cup: { family: 'vol-imp', ratio: 48 },
  ml: { family: 'vol-met', ratio: 1 },
  l: { family: 'vol-met', ratio: 1000 },
  oz: { family: 'wt-imp', ratio: 1 },
  lb: { family: 'wt-imp', ratio: 16 },
  g: { family: 'wt-met', ratio: 1 },
  kg: { family: 'wt-met', ratio: 1000 },
  pinch: { family: 'pinch', ratio: 1 },
};

// --- quantity grammar ------------------------------------------------------

/** Unicode vulgar fractions → value. */
const VULGAR: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
  '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 1 / 10,
};

const VULGAR_CLASS = Object.keys(VULGAR).join('');
// One number token. Ordered longest/most-specific first so e.g. "1.5" is read
// as a decimal, not "1" then ".5". Covers: mixed ASCII (1 1/2), ASCII fraction
// (1/2), decimal (1.5), integer+unicode (1 ½ / 1½), unicode alone (½), integer.
const NUM = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+\\.\\d+|\\d+\\s*[${VULGAR_CLASS}]|[${VULGAR_CLASS}]|\\d+)`;
const RANGE_SEP = `\\s*[-–—]\\s*`;
const LEADING_QTY = new RegExp(`^(${NUM})(?:${RANGE_SEP}(${NUM}))?`);

/** Value of a single number token (no ranges). Null if it isn't one. */
const numberFromToken = (tokRaw: string): number | null => {
  const tok = tokRaw.trim();
  let m: RegExpExecArray | null;
  // Mixed ASCII: "1 1/2"
  if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(tok)) !== null) {
    return Number(m[1]) + Number(m[2]) / Number(m[3]);
  }
  // Mixed unicode: "1 ½" / "1½"
  if ((m = new RegExp(`^(\\d+)\\s*([${VULGAR_CLASS}])$`).exec(tok)) !== null) {
    return Number(m[1]) + (VULGAR[m[2]!] ?? 0);
  }
  // ASCII fraction: "1/2"
  if ((m = /^(\d+)\/(\d+)$/.exec(tok)) !== null) {
    const d = Number(m[2]);
    return d === 0 ? null : Number(m[1]) / d;
  }
  // Unicode alone: "½"
  if (VULGAR[tok] !== undefined) return VULGAR[tok]!;
  // Decimal / integer.
  if (/^\d+(?:\.\d+)?$/.test(tok)) return Number(tok);
  return null;
};

// --- name normalization ----------------------------------------------------

/** Words that must never plural-fold (fold would corrupt them). */
const NEVER_FOLD = new Set([
  'greens', 'oats', 'grits', 'molasses', 'hummus', 'asparagus', 'couscous',
  'watercress', 'series', 'species',
]);

/** Fold a single word's trailing plural to singular, conservatively. */
const foldWord = (w: string): string => {
  if (w.length < 3 || NEVER_FOLD.has(w)) return w;
  if (/[^aeiou]ies$/.test(w)) return `${w.slice(0, -3)}y`; // berries → berry
  if (/(ss|us|is)$/.test(w)) return w; // glass, hummus, basis — no fold
  if (/(ch|sh|x|z|s|o)es$/.test(w)) return w.slice(0, -2); // tomatoes → tomato, boxes → box
  if (/s$/.test(w) && w.length >= 4) return w.slice(0, -1); // eggs → egg
  return w;
};

/** Normalize an ingredient name: lowercase, collapse whitespace, trim, and
 * plural-fold the LAST word only (the pluralized head of "chicken breasts"). No
 * descriptor stripping (v1) — "ground cinnamon" stays distinct from "cinnamon". */
const normalizeName = (raw: string): string => {
  const collapsed = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (collapsed === '') return '';
  const words = collapsed.split(' ');
  words[words.length - 1] = foldWord(words[words.length - 1]!);
  return words.join(' ');
};

/** Public alias for the internal name normalizer, so staple matching and line
 * keys fold names the same way the parser does. */
export const normalizeIngredientName = (raw: string): string => normalizeName(raw);

// --- parse -----------------------------------------------------------------

const unparsed = (raw: string, qty?: QuantityValue, unit?: CanonicalUnit): ParsedIngredient => ({
  raw,
  name: '',
  unparsed: true,
  ...(qty !== undefined ? { qty } : {}),
  ...(unit !== undefined ? { unit } : {}),
});

/** Parse one free-text ingredient line. Pure; the fixture table is the contract. */
export const parseIngredient = (raw: string): ParsedIngredient => {
  const trimmed = raw.trim();
  if (trimmed === '') return unparsed(raw);

  let rest = trimmed;
  let qty: QuantityValue | undefined;

  const qtyMatch = LEADING_QTY.exec(trimmed);
  if (qtyMatch !== null) {
    const lo = numberFromToken(qtyMatch[1]!);
    const hi = qtyMatch[2] !== undefined ? numberFromToken(qtyMatch[2]) : undefined;
    if (lo !== null) {
      qty =
        hi !== undefined && hi !== null
          ? { min: lo, max: hi, range: true }
          : { min: lo, max: lo, range: false };
      rest = trimmed.slice(qtyMatch[0].length).trim();
    }
  }

  // Unit: the first token after the quantity, if it's a recognized synonym
  // (trailing punctuation like "tbsp." / "cups," stripped before matching).
  let unit: CanonicalUnit | undefined;
  if (qty !== undefined && rest !== '') {
    const [firstTok, ...tail] = rest.split(/\s+/);
    const cleaned = firstTok!.replace(/[.,;:]+$/, '').toLowerCase();
    const canonical = UNIT_SYNONYMS[cleaned];
    if (canonical !== undefined) {
      unit = canonical;
      rest = tail.join(' ');
    }
  }

  const name = normalizeName(rest);
  // Usable name = at least one letter survived. Otherwise it's an unparseable
  // line (a bare quantity, punctuation, etc.) — surfaced, never invented.
  if (!/[a-z]/.test(name)) return unparsed(raw, qty, unit);

  return {
    raw,
    name,
    ...(qty !== undefined ? { qty } : {}),
    ...(unit !== undefined ? { unit } : {}),
  };
};

// --- Phase 2: aggregation + flags -----------------------------------------

/** A recipe scheduled in the chosen range: its display name, how many times it
 * occurs (×N), and its ingredient lines — `undefined` when the record could not
 * be resolved (degrade to a named, flagged entry; never drop). */
export type ScheduledRecipe = {
  uri: string;
  name: string;
  count: number;
  ingredients?: string[];
};

/** One verbatim line in the By-recipe view; `flagged` when it did NOT roll up
 * into a combined aggregate (an unparseable line). `staple` when the cook has
 * marked its ingredient as always-on-hand (annotated, excluded from payloads). */
export type ByRecipeLine = { raw: string; flagged: boolean; staple?: boolean };

/** One recipe's section in the By-recipe view (shown once, ×count). */
export type ByRecipeSection = {
  name: string;
  count: number;
  unavailable: boolean;
  lines: ByRecipeLine[];
};

/** One aggregated line in the Combined view: a normalized name, one quantity
 * "part" per family (cross-family parts are listed, never converted), and the
 * recipes it was drawn from (for the optional source-attribution mode).
 * `staple` when its ingredient is marked always-on-hand. */
export type CombinedLine = { name: string; parts: string[]; recipes: string[]; staple?: boolean };

/** An unparseable line preserved verbatim, attributed to its source recipes.
 * `staple` when its ingredient is marked always-on-hand. */
export type AsListedLine = { raw: string; recipes: string[]; staple?: boolean };

export type CombinedView = {
  lines: CombinedLine[];
  asListed: AsListedLine[];
  /** Names of recipes whose ingredients could not be resolved. */
  unavailable: string[];
};

export type ShoppingList = {
  byRecipe: ByRecipeSection[];
  combined: CombinedView;
};

/** Display order for a name's family parts — measured families first, the bare
 * occurrence count last, so "flour — 2 cups + ×1" reads naturally. */
const FAMILY_ORDER: (UnitFamily | 'count')[] = [
  'vol-imp', 'vol-met', 'wt-imp', 'wt-met', 'pinch', 'count',
];

/** Nearest-vulgar-fraction table for rendering (value → glyph). */
const RENDER_FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 6, '⅙'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'],
  [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [5 / 6, '⅚'], [7 / 8, '⅞'],
];

/** Format a number for display: whole numbers as integers, common fractional
 * remainders as vulgar fractions ("1 ½", "¾"), everything else as a trimmed
 * 2-decimal. */
const formatNumber = (n: number): string => {
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-6) return String(rounded);
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [value, glyph] of RENDER_FRACTIONS) {
    if (Math.abs(frac - value) < 0.02) return whole === 0 ? glyph : `${whole} ${glyph}`;
  }
  return String(Math.round(n * 100) / 100);
};

/** Format a quantity (single or range) as text. */
const formatQty = (min: number, max: number): string =>
  Math.abs(max - min) < 1e-9 ? formatNumber(min) : `${formatNumber(min)}–${formatNumber(max)}`;

/** The plural-aware label for a display unit at a given amount. */
const unitLabel = (unit: CanonicalUnit, amount: number): string => {
  // English: only amounts strictly greater than one pluralize ("¾ cup", "1 cup",
  // "2 cups"). Fractions ≤ 1 stay singular.
  const plural = amount > 1 + 1e-9;
  if (unit === 'cup') return plural ? 'cups' : 'cup';
  if (unit === 'pinch') return plural ? 'pinches' : 'pinch';
  return unit; // abbreviations (tsp/tbsp/oz/lb/g/kg/ml/l) are invariant
};

/** A measured family's running total: base-unit min/max and the units seen (to
 * pick the smallest for display). */
type FamilyTotal = { baseMin: number; baseMax: number; units: Set<CanonicalUnit> };

/** Render one measured/pinch family total as a quantity part ("18 tbsp"). */
const renderMeasured = (total: FamilyTotal): string => {
  // Smallest unit present = smallest ratio → keeps whole sums whole.
  let display: CanonicalUnit | undefined;
  let smallest = Infinity;
  for (const u of total.units) {
    const ratio = UNIT_FAMILY[u].ratio;
    if (ratio < smallest) {
      smallest = ratio;
      display = u;
    }
  }
  if (display === undefined) return ''; // unreachable — a family always has a unit
  const min = total.baseMin / smallest;
  const max = total.baseMax / smallest;
  return `${formatQty(min, max)} ${unitLabel(display, max)}`;
};

/** The full one-line text for a combined line: "name ×N" when the only part is a
 * bare occurrence count, else "name — a + b". With `sources`, appends the
 * recipes the line was drawn from ("… (from A, B)"). */
export const combinedLineText = (line: CombinedLine, opts: { sources?: boolean } = {}): string => {
  const base =
    line.parts.length === 1 && line.parts[0]!.startsWith('×')
      ? `${line.name} ${line.parts[0]}`
      : `${line.name} — ${line.parts.join(' + ')}`;
  return opts.sources === true && line.recipes.length > 0
    ? `${base} (from ${line.recipes.join(', ')})`
    : base;
};

// --- staples + check-off (assumed on hand) ---------------------------------

/** True when `hay` (a normalized, single-spaced name) contains `needle` (also
 * normalized) as a whole-word phrase — the space-padding trick makes "salt"
 * match "sea salt" but not "salted butter". */
const wholeWordIncludes = (hay: string, needle: string): boolean =>
  ` ${hay} `.includes(` ${needle} `);

/** A predicate: does an ingredient name count as a staple (assumed on hand)?
 * Both sides are name-normalized; a staple matches when it equals the name or
 * appears within it as a whole-word phrase ("salt" ⊇ "sea salt", "olive oil" ⊇
 * "extra virgin olive oil"). An empty staple list matches nothing. Pure. */
export const makeStapleMatcher = (staples: string[]): ((name: string) => boolean) => {
  const norm = [...new Set(staples.map(normalizeName))].filter((s) => s !== '');
  if (norm.length === 0) return () => false;
  return (rawName: string): boolean => {
    const name = normalizeName(rawName);
    if (name === '') return false;
    return norm.some((s) => name === s || wholeWordIncludes(name, s));
  };
};

/** The staple-matching name for a raw ingredient line: the parsed name when the
 * line parses, else the whole line normalized (so a bare "salt to taste" still
 * matches the "salt" staple). */
const stapleNameOf = (raw: string): string => {
  const parsed = parseIngredient(raw);
  return parsed.unparsed === true || parsed.name === '' ? normalizeName(raw) : parsed.name;
};

/** Flag every combined line, as-listed line, and by-recipe line whose ingredient
 * is a staple. Non-mutating — returns a new list; the panel uses the flags to
 * annotate ("assumed on hand") and to drop staples from copy/download/AI. */
export const applyStaples = (list: ShoppingList, staples: string[]): ShoppingList => {
  const isStaple = makeStapleMatcher(staples);
  const setFlag = <T extends { staple?: boolean }>(item: T, on: boolean): T =>
    on ? { ...item, staple: true } : item;
  return {
    byRecipe: list.byRecipe.map((s) => ({
      ...s,
      lines: s.lines.map((l) => setFlag(l, isStaple(stapleNameOf(l.raw)))),
    })),
    combined: {
      ...list.combined,
      lines: list.combined.lines.map((l) => setFlag(l, isStaple(l.name))),
      asListed: list.combined.asListed.map((l) => setFlag(l, isStaple(normalizeName(l.raw)))),
    },
  };
};

/** A stable check-off key for a combined line — by normalized name, so it lines
 * up with the same ingredient in the By-recipe view. */
export const combinedLineKey = (line: CombinedLine): string => `n:${normalizeName(line.name)}`;

/** A stable check-off key for a raw (by-recipe / as-listed) line: the normalized
 * name when it parses (shared with the combined key), else the raw text (so
 * unparseable stragglers still toggle independently). */
export const rawLineKey = (raw: string): string => {
  const parsed = parseIngredient(raw);
  return parsed.unparsed === true || parsed.name === ''
    ? `r:${raw.trim().toLowerCase()}`
    : `n:${parsed.name}`;
};

/** Produce a NEW list carrying only what still needs shopping: staples and any
 * caller-excluded keys (lines the cook checked off as "already have") are
 * dropped from combined lines, as-listed, and every by-recipe section. The
 * existing markdown/document renderers then render the honest shopping payload.
 * Unavailable recipes are kept (their absence is itself worth copying). Pure. */
export const filterForShopping = (
  list: ShoppingList,
  isExcluded: (key: string) => boolean = () => false,
): ShoppingList => {
  const keepCombined = (l: CombinedLine): boolean => l.staple !== true && !isExcluded(combinedLineKey(l));
  const keepRaw = (l: { raw: string; staple?: boolean }): boolean =>
    l.staple !== true && !isExcluded(rawLineKey(l.raw));
  return {
    byRecipe: list.byRecipe.map((s) => ({ ...s, lines: s.lines.filter(keepRaw) })),
    combined: {
      ...list.combined,
      lines: list.combined.lines.filter(keepCombined),
      asListed: list.combined.asListed.filter(keepRaw),
    },
  };
};

/** The "AI shopper" payload: terse cart instructions for a shopping agent, built
 * from an ALREADY-filtered list (staples + checked-off lines removed upstream).
 * Deliberately free of any arecipe / recipe framing — agents carry their own
 * notion of a "recipe"; this just names items to add to a cart. `instructions`
 * (the cook's standing preference, e.g. "prefer versions we've bought before")
 * is folded in verbatim. Pure. */
export const renderAiShopperText = (
  list: ShoppingList,
  opts: { instructions?: string } = {},
): string => {
  const items: string[] = [
    ...list.combined.lines.map((line) => combinedLineText(line)),
    ...list.combined.asListed.map((item) => item.raw),
  ];
  const out: string[] = ['Add these grocery items to my shopping cart:'];
  const instr = (opts.instructions ?? '').trim();
  if (instr !== '') out.push('', instr);
  out.push('');
  if (items.length === 0) out.push('(nothing left to buy)');
  else for (const item of items) out.push(`- ${item}`);
  return out.join('\n');
};

/** Multiply one ingredient line by a recipe's occurrence count for the
 * By-recipe "×N amounts" mode: scale the leading quantity in place (keeping the
 * rest verbatim), mark a bare line with an occurrence count, and leave an
 * unparseable line untouched (we won't invent a number we couldn't read). */
export const scaleIngredientLine = (raw: string, count: number): string => {
  if (count <= 1) return raw;
  const parsed = parseIngredient(raw);
  if (parsed.unparsed === true) return raw;
  if (parsed.qty === undefined) return `${raw} ×${count}`;
  const trimmed = raw.trim();
  const m = LEADING_QTY.exec(trimmed);
  if (m === null) return raw;
  const scaledMax = parsed.qty.max * count;
  const scaled = formatQty(parsed.qty.min * count, scaledMax);
  if (parsed.unit === undefined) {
    // No unit: swap only the leading number, keep the rest verbatim.
    return `${scaled}${trimmed.slice(m[0].length)}`;
  }
  // With a unit, re-render "<qty> <unit> <name>" so the unit pluralizes with the
  // scaled amount ("1 cup" → "2 cups"); the name keeps the recipe's own wording.
  const nameRaw = trimmed.slice(m[0].length).trim().split(/\s+/).slice(1).join(' ');
  return `${scaled} ${unitLabel(parsed.unit, scaledMax)}${nameRaw !== '' ? ` ${nameRaw}` : ''}`;
};

/** Turn a range of scheduled recipes into the two-view shopping list. Pure and
 * deterministic — combined lines/as-listed/unavailable are name-sorted. */
export const buildShoppingList = (recipes: ScheduledRecipe[]): ShoppingList => {
  const byRecipe: ByRecipeSection[] = [];
  const unavailable: string[] = [];

  // key(name) → family → accumulator. Measured families share FamilyTotal;
  // 'count' accumulates min/max occurrence counts.
  const measured = new Map<string, Map<UnitFamily, FamilyTotal>>();
  const counts = new Map<string, { min: number; max: number }>();
  const asListedByRaw = new Map<string, Set<string>>();
  // name → ordered-unique recipe names it was drawn from (source attribution).
  const sourcesByName = new Map<string, string[]>();
  const noteSource = (name: string, recipeName: string): void => {
    const cur = sourcesByName.get(name) ?? [];
    if (!cur.includes(recipeName)) cur.push(recipeName);
    sourcesByName.set(name, cur);
  };

  const bumpMeasured = (name: string, family: UnitFamily, unit: CanonicalUnit, min: number, max: number): void => {
    let byFamily = measured.get(name);
    if (byFamily === undefined) {
      byFamily = new Map();
      measured.set(name, byFamily);
    }
    const cur = byFamily.get(family) ?? { baseMin: 0, baseMax: 0, units: new Set<CanonicalUnit>() };
    cur.baseMin += min;
    cur.baseMax += max;
    cur.units.add(unit);
    byFamily.set(family, cur);
  };

  const bumpCount = (name: string, min: number, max: number): void => {
    const cur = counts.get(name) ?? { min: 0, max: 0 };
    cur.min += min;
    cur.max += max;
    counts.set(name, cur);
  };

  for (const r of recipes) {
    if (r.ingredients === undefined) {
      unavailable.push(r.name);
      byRecipe.push({ name: r.name, count: r.count, unavailable: true, lines: [] });
      continue;
    }
    const lines: ByRecipeLine[] = [];
    for (const raw of r.ingredients) {
      const parsed = parseIngredient(raw);
      if (parsed.unparsed === true) {
        lines.push({ raw, flagged: true });
        const set = asListedByRaw.get(raw) ?? new Set<string>();
        set.add(r.name);
        asListedByRaw.set(raw, set);
        continue;
      }
      lines.push({ raw, flagged: false });
      noteSource(parsed.name, r.name);

      // ×N: a recipe scheduled `count` times multiplies its quantities.
      const n = r.count;
      if (parsed.unit !== undefined) {
        const { family, ratio } = UNIT_FAMILY[parsed.unit];
        const min = (parsed.qty?.min ?? 1) * ratio * n;
        const max = (parsed.qty?.max ?? 1) * ratio * n;
        bumpMeasured(parsed.name, family, parsed.unit, min, max);
      } else {
        // Unit-less: the count family. Bare (no qty) is one occurrence.
        const min = (parsed.qty?.min ?? 1) * n;
        const max = (parsed.qty?.max ?? 1) * n;
        bumpCount(parsed.name, min, max);
      }
    }
    byRecipe.push({ name: r.name, count: r.count, unavailable: false, lines });
  }

  // Assemble combined lines: one per name, family parts in FAMILY_ORDER.
  const names = new Set<string>([...measured.keys(), ...counts.keys()]);
  const lines: CombinedLine[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const parts: string[] = [];
    const byFamily = measured.get(name);
    for (const family of FAMILY_ORDER) {
      if (family === 'count') {
        const c = counts.get(name);
        if (c !== undefined) parts.push(`×${formatQty(c.min, c.max)}`);
      } else if (byFamily?.has(family) === true) {
        parts.push(renderMeasured(byFamily.get(family)!));
      }
    }
    lines.push({ name, parts, recipes: sourcesByName.get(name) ?? [] });
  }

  const asListed: AsListedLine[] = [...asListedByRaw.entries()]
    .map(([raw, set]) => ({ raw, recipes: [...set] }))
    .sort((a, b) => a.raw.localeCompare(b.raw));

  return {
    byRecipe,
    combined: { lines, asListed, unavailable: unavailable.sort((a, b) => a.localeCompare(b)) },
  };
};

// --- Phase 3: range + resolution ------------------------------------------

/** The minimal plan shape the list builder reads — structurally satisfied by
 * `LocalPlan` (the buffer the planner holds) and the record the public view
 * loads. Meals carry the denormalized recipe ref; ingredients are resolved. */
export type ShoppingMealRef = { uri: string; cid: string; name: string };
export type ShoppingPlan = {
  name: string;
  startDate?: string;
  weeks: { repeat: number; days: { meals: { recipe: ShoppingMealRef }[] }[] }[];
};

/** The chosen range of scheduled meals. `all` is the default in both modes;
 * dated plans use `dates` (inclusive ISO YYYY-MM-DD), undated plans use `weeks`
 * (1-based indices over the EXPANDED calendar, honoring repeats). */
export type ShoppingRange =
  | { kind: 'all' }
  | { kind: 'dates'; from: string; to: string }
  | { kind: 'weeks'; from: number; to: number };

/** A unique recipe scheduled in range, with its occurrence count. */
export type ScheduledRef = ShoppingMealRef & { count: number };

/** Total number of expanded calendar rows (weeks × repeats). */
export const expandedWeekCount = (plan: ShoppingPlan): number => expandCalendar(plan.weeks).length;

/** The first/last real date a dated plan spans, or null when undated. */
export const planDateBounds = (plan: ShoppingPlan): { from: string; to: string } | null => {
  if (plan.startDate === undefined) return null;
  const rows = expandedWeekCount(plan);
  const from = dateForSlot(plan.startDate, 0, 0);
  const to = dateForSlot(plan.startDate, rows - 1, 6);
  return from !== null && to !== null ? { from, to } : null;
};

/** Collect the unique recipe refs scheduled in `range`, counting occurrences
 * (a repeated week or a recipe placed twice both increment the count). Pure;
 * expansion reuses `expandCalendar` so repeats are honored identically to the
 * calendar. First-appearance order is preserved. */
export const collectScheduledRefs = (plan: ShoppingPlan, range: ShoppingRange): ScheduledRef[] => {
  const inRange = (rowIndex: number, dayIndex: number): boolean => {
    if (range.kind === 'all') return true;
    if (range.kind === 'weeks') {
      const wk = rowIndex + 1;
      return wk >= range.from && wk <= range.to;
    }
    // Dated: map the cell to its real date; an undated plan can't date-filter,
    // so include it rather than silently drop everything.
    if (plan.startDate === undefined) return true;
    const date = dateForSlot(plan.startDate, rowIndex, dayIndex);
    if (date === null) return true;
    return date >= range.from && date <= range.to;
  };

  const order: string[] = [];
  const byUri = new Map<string, ScheduledRef>();
  let rowIndex = 0;
  for (const cw of expandCalendar(plan.weeks)) {
    const src = plan.weeks[cw.week - 1];
    if (src === undefined) {
      rowIndex += 1;
      continue;
    }
    src.days.forEach((slot, dayIndex) => {
      if (!inRange(rowIndex, dayIndex)) return;
      for (const m of slot.meals) {
        const ref = m.recipe;
        const existing = byUri.get(ref.uri);
        if (existing !== undefined) {
          existing.count += 1;
        } else {
          byUri.set(ref.uri, { uri: ref.uri, cid: ref.cid, name: ref.name, count: 1 });
          order.push(ref.uri);
        }
      }
    });
    rowIndex += 1;
  }
  return order.map((uri) => byUri.get(uri)!);
};

/** Resolve a recipe's ingredient lines by its ref, or null when unavailable.
 * Injectable so the pure core stays testable; the page wraps the cache-first
 * single-recipe read. A rejection is treated as unavailable (never blanks). */
export type IngredientFetcher = (ref: { uri: string; cid: string }) => Promise<string[] | null>;

/** Collect the in-range recipes, resolve each one's ingredients (in parallel,
 * order-stable), and build the two-view shopping list. A recipe that fails to
 * resolve degrades to a named, flagged entry — never dropped, never blanking. */
export const resolveShoppingList = async (
  plan: ShoppingPlan,
  range: ShoppingRange,
  fetchIngredients: IngredientFetcher,
): Promise<ShoppingList> => {
  const refs = collectScheduledRefs(plan, range);
  const scheduled = await Promise.all(
    refs.map(async (ref): Promise<ScheduledRecipe> => {
      let ingredients: string[] | undefined;
      try {
        ingredients = (await fetchIngredients({ uri: ref.uri, cid: ref.cid })) ?? undefined;
      } catch {
        ingredients = undefined;
      }
      return { uri: ref.uri, name: ref.name, count: ref.count, ingredients };
    }),
  );
  return buildShoppingList(scheduled);
};

// --- Phase 4: markdown renderers -------------------------------------------

/** The By-recipe flag glyph: this line could not be combined — eyeball it. */
const FLAG = '⚑';

/** "Lasagna ×2" / "Salad" — the recipe's heading text. */
const sectionHeading = (section: ByRecipeSection): string =>
  section.count > 1 ? `${section.name} ×${section.count}` : section.name;

/** The Combined view as markdown (aggregated lines, "as listed", unavailable).
 * Copyable on its own (the "Combined" tab's Copy payload). With `sources`, each
 * line carries the recipes it came from. */
export const renderCombinedMarkdown = (list: ShoppingList, opts: { sources?: boolean } = {}): string => {
  const out: string[] = ['## Combined', ''];
  if (list.combined.lines.length === 0) {
    out.push('_Nothing to combine._');
  } else {
    for (const line of list.combined.lines) out.push(`- ${combinedLineText(line, opts)}`);
  }
  if (list.combined.asListed.length > 0) {
    out.push('', '### As listed', '');
    for (const item of list.combined.asListed) {
      out.push(`- ${item.raw} _(from ${item.recipes.join(', ')})_`);
    }
  }
  if (list.combined.unavailable.length > 0) {
    out.push('', '### Unavailable', '');
    for (const name of list.combined.unavailable) out.push(`- ${name} — ingredients unavailable`);
  }
  return out.join('\n');
};

/** The By-recipe view as markdown (one section per recipe, verbatim lines,
 * flagged stragglers). Copyable on its own (the "By recipe" tab's Copy payload).
 * With `multiply`, each line's amount is scaled by the recipe's ×N. */
export const renderByRecipeMarkdown = (list: ShoppingList, opts: { multiply?: boolean } = {}): string => {
  const out: string[] = ['## By recipe'];
  const anyFlagged = list.byRecipe.some((s) => s.unavailable || s.lines.some((l) => l.flagged));
  if (anyFlagged) out.push('', `> ${FLAG} couldn’t be combined — check this line yourself.`);
  for (const section of list.byRecipe) {
    out.push('', `### ${sectionHeading(section)}`, '');
    if (section.unavailable) {
      out.push('- _ingredients unavailable_');
      continue;
    }
    if (section.lines.length === 0) {
      out.push('_No ingredients listed._');
      continue;
    }
    for (const line of section.lines) {
      const text = opts.multiply === true ? scaleIngredientLine(line.raw, section.count) : line.raw;
      out.push(`- ${text}${line.flagged ? ` ${FLAG}` : ''}`);
    }
  }
  return out.join('\n');
};

/** The full downloadable document: title + range, Combined then By recipe. With
 * `detail`, Combined lines carry their source recipes and By-recipe amounts are
 * scaled by ×N (matching the panel's detail toggle). */
export const renderShoppingListDocument = (
  list: ShoppingList,
  opts: { planName: string; rangeLabel: string; detail?: boolean },
): string =>
  [
    `# Shopping list — ${opts.planName}`,
    '',
    opts.rangeLabel,
    '',
    renderCombinedMarkdown(list, { sources: opts.detail }),
    '',
    renderByRecipeMarkdown(list, { multiply: opts.detail }),
    '',
  ].join('\n');

/** lowercase, non-alphanumerics → single dash, trimmed. */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The download filename: shopping-<plan-slug>-<range-slug>.md. */
export const shoppingListFilename = (planName: string, rangeLabel: string): string => {
  const name = slugify(planName) || 'plan';
  const range = slugify(rangeLabel) || 'all';
  return `shopping-${name}-${range}.md`;
};
