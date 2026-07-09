// Phase 1b: canonical dishKey normalization (recipe-model-extensions plan).
// Pure functions that propose a stable `dishKey` slug per recipe so alternative
// versions of one dish group together across all 6 import files AND the live
// records. The raw `dish`/`altOf` fields in the corpus are inconsistent and
// unusable (see the plan); this derives keys from the NAME instead.
//
// Auto-propose, then human review: build-dishkeys.mjs writes the mapping +
// a review report, and the user confirms/edits the groups. This is ops tooling
// (run: node --test spike/import/dishkeys.test.mjs).

/** Fold diacritics to ASCII so "Crème Brûlée" and a plain-ASCII spelling converge. */
export const foldAccents = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

// Decorative qualifiers that don't change WHICH dish it is. Stripped from the
// front, repeatedly (e.g. "Classic Moist Banana Bread" → "Banana Bread").
const QUALIFIER =
  /^(Classic|Crispy|Baked|Easy|Simple|Homemade|Authentic|Truly|Fluffy|Fudgy|Seriously|Southern|Frugal|Old-Fashioned|No-Bake|No-Knead|No-Yeast|Golden|Rich|Tangy|Soft|Chewy|Quick|Stovetop|Skillet|Sheet Pan|Bakery-Style|Double-Crust|Flaky|Savory|3-Ingredient|Two-Ingredient|Depression-Era|My Favorite|Perfect|Best|Ultimate|Moist|Overripe|Real)\s+/i;

// Cross-name synonyms: normalized slug → canonical dishKey. The review step
// grows this table; keep each entry obvious and defensible.
export const ALIASES = {
  'boeuf-bourguignon': 'beef-bourguignon',
};

const slugify = (s) =>
  foldAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Propose a canonical dishKey for a recipe name. */
export const normalizeDishKey = (name) => {
  let s = foldAccents(name);
  let prev;
  do {
    prev = s;
    s = s.replace(QUALIFIER, '');
  } while (s !== prev);
  // Drop a trailing "with ..." add-on clause so an accompaniment variant merges
  // to its base dish (e.g. "Caesar Salad with Grilled Chicken" → caesar-salad).
  s = s.replace(/\s+with\s+.*$/i, '');
  const slug = slugify(s);
  return ALIASES[slug] ?? slug;
};

/** Group records ({ name, ref, ... }) by proposed dishKey.
 *  Returns { byRef: {ref → key}, groups: {key → records[]} }. Deterministic. */
export const proposeGroups = (records) => {
  const byRef = {};
  const groups = {};
  for (const rec of records) {
    const key = normalizeDishKey(rec.name);
    byRef[rec.ref] = key;
    (groups[key] ??= []).push(rec);
  }
  return { byRef, groups };
};
