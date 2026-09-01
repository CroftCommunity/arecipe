// D15 Phase 3 — category crosswalk. Wikibooks infobox `category` + dish-type
// [[Category:…]] names → one controlled `category*` token, stored bare-lowercase
// (as arecipe writes it, e.g. "dessert"). Data-only table inside the tool.
//
// Precision-first: match only recognizable meal/dish types. Ingredient/cuisine
// categories ("Chicken recipes", "Ethiopian recipes") return undefined and fall
// through to keyword spillover (Phase 4) — publishing them as a category token
// would mis-facet.
import type { RecipeIR } from '../ir.ts';

// Keyword → bare category token (defs `category*` minus prefix, lowercased).
// Ordered by priority; first match wins. Keys are matched as whole words in the
// normalized text.
const KEYWORDS: [RegExp, string][] = [
  [/\bappetizer|\bstarter|\bhors d'?oeuvre|\bcanape/, 'appetizer'],
  [/\bcocktail/, 'cocktail'],
  [/\bbeverage|\bdrink|\bsmoothie|\bjuice(s)?\b|\btea\b|\bcoffee\b/, 'beverage'],
  [/\bbreakfast/, 'breakfast'],
  [/\bbrunch/, 'brunch'],
  [/\bdessert|\bcake(s)?\b|\bcookie(s)?\b|\bpie(s)?\b|\bpudding|\bice cream|\bconfection/, 'dessert'],
  [/\bsalad(s)?\b/, 'salad'],
  [/\bsoup(s)?\b|\bchowder|\bbisque|\bstew(s)?\b/, 'soup'],
  [/\bsnack(s)?\b/, 'snack'],
  [/\bside dish|\bside(s)?\b|\bcondiment|\bsauce(s)?\b/, 'side'],
  [/\bgarnish/, 'garnish'],
  [/\bmain course|\bmain dish|\bentr[ée]e|\bentree/, 'entree'],
  [/\bdinner|\bsupper/, 'dinner'],
  [/\blunch/, 'lunch'],
];

const normalize = (s: string): string => s.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** The candidate strings to inspect: infobox category first (highest signal),
 *  then dish-type category links. */
const candidates = (ir: RecipeIR): string[] => {
  const out: string[] = [];
  if (ir.summary.category !== undefined) out.push(ir.summary.category);
  out.push(...ir.categories);
  return out;
};

/** One bare category token, or undefined when nothing maps confidently. */
export const categoryToken = (ir: RecipeIR): string | undefined => {
  for (const cand of candidates(ir)) {
    const norm = normalize(cand);
    for (const [re, token] of KEYWORDS) {
      if (re.test(norm)) return token;
    }
  }
  return undefined;
};
