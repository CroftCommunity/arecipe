// D15 Phase 4 — keywords. Turns leftover [[Category:…]] names into discovery
// keywords: the "<X> recipes" base word, minus diet categories (already in
// suitableForDiet), minus the consumed category/cuisine tokens, minus Wikibooks
// maintenance/boilerplate. Each ≤64 chars, deduped, capped, first-seen order.
import type { RecipeIR } from '../ir.ts';

const CAP = 12;

const normalize = (s: string): string => s.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** Strip a trailing "recipe"/"recipes" so "Ethiopian recipes" → "ethiopian". */
const baseWord = (norm: string): string => norm.replace(/\s+recipe(s)?$/, '').trim();

// Diet categories are surfaced via suitableForDiet, not keywords.
const DIET = /\b(vegetarian|vegan|halal|kosher|gluten[- ]free)\b/;

// Wikibooks maintenance / boilerplate / ingredient-index categories — noise as keywords.
const MAINTENANCE = [
  /^recipes (using|with|for|of)\b/,
  /\bfeatured\b/, /\bincomplete\b/, /\bmetric\b/, /\bimperial\b/,
  /\bcookbook\b/, /\bwikibooks\b/, /^pages\b/, /^articles\b/,
  /\buncategor/, /\bcleanup\b/, /\bstub/, /\bmaintenance\b/, /\btemplate/,
];

/**
 * Discovery keywords for a record. `consumed` are tokens already published as
 * recipeCategory/recipeCuisine (excluded to avoid redundancy).
 */
export const keywordsFor = (ir: RecipeIR, consumed: string[]): string[] => {
  const skip = new Set(consumed.map(normalize));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const category of ir.categories) {
    const norm = normalize(category);
    if (DIET.test(norm)) continue;
    if (MAINTENANCE.some((re) => re.test(norm))) continue;
    const kw = baseWord(norm);
    if (kw === '' || kw.length > 64 || skip.has(kw) || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
    if (out.length >= CAP) break;
  }
  return out;
};
