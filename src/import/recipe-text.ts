// Pasted / shared visible-text heuristic (import Phase 2, D4; share-accuracy
// hardened). The ladder's second rung — and, for a DIRECT SHARE, the ONLY rung
// that matters: a share delivers visible text, not the page's JSON-LD/microdata,
// so this is where share extraction accuracy is won. PURE.
//
// Conservative core (unchanged contract): ingredients need a run of ≥3
// quantity/bullet-led lines, and it never fabricates a recipe out of prose — an
// empty bucket stays empty (flagged downstream). Hardening added for real shared
// text: strip site chrome ("Jump to Recipe", "Print", star ratings), read prose
// metadata ("Prep Time: 15 minutes", "Serves 4"), keep ingredient sub-headings
// ("For the sauce:"), accept informal unlabeled steps AFTER a valid ingredient
// block, and trim trailing junk (Nutrition, Comments). The informal-step path is
// GATED on a real ingredient block existing, so pure prose still yields nothing.

import { clean, LEXICON_MAX, type HtmlParse, domHtmlParse } from './sanitize.js';
import type { ImportedRecipe } from './recipe-jsonld.js';

const INSTRUCTION_HEADINGS = ['instructions', 'method', 'directions', 'steps', 'preparation'];
const ALL_HEADINGS = ['ingredients', ...INSTRUCTION_HEADINGS];

const headingKey = (line: string): string => line.trim().replace(/:$/, '').toLowerCase();
const isHeading = (line: string): boolean => ALL_HEADINGS.includes(headingKey(line));
const isIngredientsHeading = (line: string): boolean => headingKey(line) === 'ingredients';
const isInstructionHeading = (line: string): boolean =>
  INSTRUCTION_HEADINGS.includes(headingKey(line));

const NUMBERED = /^\s*\d{1,3}[.)]\s+(\S.*)$/;
const isNumbered = (line: string): boolean => NUMBERED.test(line);

const BULLET = /^[-*•·‣–]\s+/;
const QUANTITY = /^(?:[-*•·‣–]\s+|\d|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;
const looksLikeIngredient = (line: string): boolean =>
  line.trim() !== '' && !isNumbered(line) && QUANTITY.test(line.trim());

// ─── Boilerplate / chrome the share text carries around the recipe ───────────
/** Whole-line site chrome to drop (case-insensitive, trimmed). Curated and
 *  conservative — every entry is UI text, never recipe content. */
const CHROME_EXACT = new Set(
  [
    'jump to recipe', 'jump to video', 'print', 'print recipe', 'print pin',
    'save', 'save recipe', 'saved', 'pin', 'pin recipe', 'share', 'share recipe',
    'rate', 'rate recipe', 'rate this recipe', 'leave a review', 'email',
    'advertisement', 'advertisements', 'ad', 'watch', 'shop this recipe',
    // NB: recipe-structure headings ("Ingredients"/"Instructions") are NOT chrome
    // — they are load-bearing for section detection and stripped elsewhere.
  ].map((s) => s),
);
const CHROME_PATTERNS: RegExp[] = [
  /^\d+(?:\.\d+)?\s+from\s+\d+\s+(?:votes?|reviews?|ratings?)$/i, // "5 from 328 votes"
  /^★+\s*$/,
  /^\d+\s+(?:comments?|reviews?|ratings?)$/i,
  /^(?:course|cuisine|keyword|diet|category|method|calories)\s*:/i, // meta chips
  /^(?:by|author)\s*:?\s+\S+/i,
];
const isChrome = (line: string): boolean => {
  const t = line.trim();
  if (t === '') return false;
  if (CHROME_EXACT.has(t.toLowerCase().replace(/:$/, ''))) return true;
  return CHROME_PATTERNS.some((re) => re.test(t));
};

/** Trailing sections that are never part of the recipe — everything from the
 *  first such heading to the end is dropped. */
const TRAILING_JUNK = [
  'nutrition', 'nutrition facts', 'notes', 'recipe notes', 'comments',
  'leave a comment', 'reader interactions', 'you might also like',
  'related recipes', 'more recipes', 'did you make this recipe', 'did you make this',
];
const isTrailingJunk = (line: string): boolean => TRAILING_JUNK.includes(headingKey(line));

// ─── Prose metadata (yield + durations) ──────────────────────────────────────
/** "1 hour 30 minutes" / "20 mins" / "1 hr" → ISO-8601 duration, or undefined. */
const proseDuration = (raw: string): string | undefined => {
  const hours = /(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(raw);
  const mins = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/i.exec(raw);
  if (hours === null && mins === null) return undefined;
  let iso = 'PT';
  if (hours !== null) iso += `${hours[1]}H`;
  if (mins !== null) iso += `${mins[1]}M`;
  return iso === 'PT' ? undefined : iso;
};

type Meta = { recipeYield?: string; prepTime?: string; totalTime?: string };
const YIELD_RE = /^(?:serves|servings|yield|makes)\b[:\s]+(.+)$/i;
const PREP_RE = /^prep(?:\s*time)?\b[:\s]+(.+)$/i;
const TOTAL_RE = /^total(?:\s*time)?\b[:\s]+(.+)$/i;

/** Pull yield/prep/total from prose lines; returns the meta AND the set of line
 *  indices consumed (so they don't pollute ingredient/step parsing). */
const extractMeta = (lines: string[]): { meta: Meta; consumed: Set<number> } => {
  const meta: Meta = {};
  const consumed = new Set<number>();
  lines.forEach((line, i) => {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if ((m = YIELD_RE.exec(t)) !== null && meta.recipeYield === undefined) {
      meta.recipeYield = (m[1] ?? '').trim();
      consumed.add(i);
    } else if ((m = PREP_RE.exec(t)) !== null && meta.prepTime === undefined) {
      const d = proseDuration(m[1] ?? '');
      if (d !== undefined) meta.prepTime = d;
      consumed.add(i);
    } else if ((m = TOTAL_RE.exec(t)) !== null && meta.totalTime === undefined) {
      const d = proseDuration(m[1] ?? '');
      if (d !== undefined) meta.totalTime = d;
      consumed.add(i);
    }
  });
  return { meta, consumed };
};

// ─── Ingredients (section-aware, sub-heading tolerant) ───────────────────────
const SUBHEADING = /^(?:for the\b.*|.{1,40}?):$/i;
const isSubheading = (line: string): boolean => {
  const t = line.trim();
  return SUBHEADING.test(t) && !isHeading(t) && !looksLikeIngredient(t);
};
const subLabel = (line: string): string => `— ${line.trim().replace(/:$/, '').trim()}`;

/** Collect ingredients + the index just past the last ingredient line. When an
 *  "Ingredients" heading exists, read that section (keeping sub-headings); else
 *  fall back to the longest quantity run (sub-headings don't break it). Requires
 *  ≥3 real quantity lines (confidence gate). */
const collectIngredients = (lines: string[]): { items: string[]; endIdx: number } => {
  const headingIdx = lines.findIndex(isIngredientsHeading);
  if (headingIdx !== -1) {
    const items: string[] = [];
    let quantities = 0;
    let i = headingIdx + 1;
    for (; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (line.trim() === '') continue;
      if (isInstructionHeading(line) || isTrailingJunk(line)) break;
      if (isSubheading(line)) {
        items.push(subLabel(line));
        continue;
      }
      if (looksLikeIngredient(line)) {
        items.push(line.trim().replace(BULLET, ''));
        quantities += 1;
        continue;
      }
      break; // a non-ingredient prose line ends the section
    }
    if (quantities >= 3) return { items, endIdx: i };
  }

  // No heading (or too few under it) — longest run, sub-heading tolerant.
  let best: string[] = [];
  let bestEnd = -1;
  let run: string[] = [];
  let runQ = 0;
  let runStart = -1;
  const flush = (endExclusive: number): void => {
    if (runQ >= 3 && run.length > best.length) {
      best = run;
      bestEnd = endExclusive;
    }
    run = [];
    runQ = 0;
    runStart = -1;
  };
  lines.forEach((line, i) => {
    if (looksLikeIngredient(line)) {
      if (runStart === -1) runStart = i;
      run.push(line.trim().replace(BULLET, ''));
      runQ += 1;
    } else if (isSubheading(line) && runStart !== -1) {
      run.push(subLabel(line)); // a sub-heading inside a run doesn't break it
    } else {
      flush(i);
    }
  });
  flush(lines.length);
  return { items: best, endIdx: bestEnd };
};

// ─── Instructions ────────────────────────────────────────────────────────────
/** Steps: numbered lines first; else lines after an instruction heading; else
 *  (informal share) the lines after the ingredient block — GATED on a real
 *  ingredient block having been found, so prose never becomes steps. */
const collectInstructions = (lines: string[], ingredientEnd: number, haveIngredients: boolean): string[] => {
  const numbered = lines
    .map((l) => NUMBERED.exec(l)?.[1])
    .filter((s): s is string => s !== undefined);
  if (numbered.length > 0) return numbered;

  const start = lines.findIndex(isInstructionHeading);
  if (start !== -1) {
    const steps: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (line.trim() === '') continue;
      if (isTrailingJunk(line)) break;
      if (isHeading(line)) break;
      if (looksLikeIngredient(line)) continue;
      steps.push(line.trim());
    }
    if (steps.length > 0) return steps;
  }

  // Informal: unlabeled step lines following the ingredient block.
  if (haveIngredients && ingredientEnd !== -1) {
    const steps: string[] = [];
    for (let i = ingredientEnd; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (line.trim() === '') continue;
      if (isTrailingJunk(line)) break;
      if (isHeading(line) || isSubheading(line)) continue;
      if (looksLikeIngredient(line)) continue; // a trailing stray ingredient
      steps.push(line.trim());
    }
    return steps;
  }
  return [];
};

// ─── Name ────────────────────────────────────────────────────────────────────
/** The recipe name: the first content-y line that is not chrome, an ingredient,
 *  a numbered step, a heading, a sub-heading, or metadata. */
const findName = (lines: string[]): string | undefined => {
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    if (isChrome(t) || isSubheading(t)) continue;
    if (looksLikeIngredient(t) || isNumbered(t) || isHeading(t)) return undefined;
    if (YIELD_RE.test(t) || PREP_RE.test(t) || TOTAL_RE.test(t)) continue;
    return t.length <= 120 ? t : undefined;
  }
  return undefined;
};

export const parseRecipeText = (text: string, parse: HtmlParse = domHtmlParse): ImportedRecipe => {
  const clamp1 = (s: string, max: number): string => clean(s, max, parse);

  // 1. Split; 2. read prose metadata; 3. drop chrome + consumed-meta; 4. trim
  //    trailing junk; then parse the cleaned body.
  const rawLines = text.split('\n');
  const { meta, consumed } = extractMeta(rawLines);
  let lines = rawLines.filter((l, i) => !isChrome(l) && !consumed.has(i));
  const junkAt = lines.findIndex(isTrailingJunk);
  if (junkAt !== -1) lines = lines.slice(0, junkAt);

  const { items, endIdx } = collectIngredients(lines);
  const ingredients = items.map((s) => clamp1(s, LEXICON_MAX.ingredient)).filter((s) => s !== '');
  const haveIngredients = ingredients.filter((s) => !s.startsWith('— ')).length >= 3;
  const instructions = collectInstructions(lines, endIdx, haveIngredients)
    .map((s) => clamp1(s, LEXICON_MAX.instruction))
    .filter((s) => s !== '');

  const result: ImportedRecipe = { ingredients, instructions };
  const nameRaw = findName(lines);
  if (nameRaw !== undefined) {
    const name = clamp1(nameRaw, LEXICON_MAX.name);
    if (name !== '') result.name = name;
  }
  if (meta.recipeYield !== undefined && meta.recipeYield !== '') {
    result.recipeYield = clamp1(meta.recipeYield, LEXICON_MAX.name);
  }
  if (meta.prepTime !== undefined) result.prepTime = meta.prepTime;
  if (meta.totalTime !== undefined) result.totalTime = meta.totalTime;
  return result;
};
