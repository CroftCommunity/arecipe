// D15 Phase 2 — diet crosswalk. Maps Wikibooks dietary [[Category:…]] names to
// the controlled `exchange.recipe.defs#diet*` refs arecipe reads for its diet
// facets. Data-only table inside the tool (O1: no code crosses the boundary).
//
// Precision-first: a category maps only when it NAMES a diet (ends in
// "recipe"/"recipes"), so ingredient/maintenance categories like
// "Recipes using gluten-free flour" do NOT tag a recipe. The table covers the
// five diet tokens actually present in the corpus (histogram over 3,824 pages:
// Vegetarian 290 / Vegan 196 / Halal 76 / gluten-free 130 / Kosher 44).

const DEFS = 'exchange.recipe.defs#';

/** Each rule: a regex over the NORMALIZED category (lowercased, underscores→
 *  spaces, whitespace collapsed) → the diet token. Anchored to a trailing
 *  "recipe(s)" so only diet-category names match. */
const RULES: { re: RegExp; token: string }[] = [
  { re: /\bvegetarian recipe(s)?$/, token: 'dietVegetarian' },
  { re: /\bvegan recipe(s)?$/, token: 'dietVegan' },
  { re: /\bhalal recipe(s)?$/, token: 'dietHalal' },
  { re: /\bgluten[- ]free recipe(s)?$/, token: 'dietGlutenFree' },
  { re: /\bkosher( for passover)? recipe(s)?$/, token: 'dietKosher' },
];

const normalize = (category: string): string =>
  category.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Full defs refs for the diet categories in `categories`, deduped and sorted
 * (deterministic). Empty when none match.
 */
export const dietRefs = (categories: string[]): string[] => {
  const tokens = new Set<string>();
  for (const category of categories) {
    const norm = normalize(category);
    for (const { re, token } of RULES) {
      if (re.test(norm)) tokens.add(token);
    }
  }
  return [...tokens].sort().map((t) => `${DEFS}${t}`);
};
