// home-batch → exchange.recipe.recipe mapper (NON-PRODUCTION ops tooling).
// Turns a reconstructed handwritten-recipe entry (recipebox/home-batch.json,
// authored via recipebox/correct.html) into a record whose field formats
// follow the same wild convention as catalogue-map.mjs: plain-word
// recipeCuisine/recipeCategory, defs token-refs for diet, ISO-8601 durations,
// and an attribution union. Home recipes use #attributionPerson (family /
// friend), not #attributionWebsite. Pure and unit-tested — no network here.
//
// Optional fields are OMITTED (not emitted empty) to match the lexicon's
// open-world floor. See docs/LEXICONS.md for the field registry.
import { parseTimeToIso, cleanText } from './catalogue-map.mjs';

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/** True when any ingredient/instruction still carries a bracketed "[…]" gap
 *  (missing page, torn card, illegible line) — i.e. not ready to publish. */
export const hasPlaceholders = (entry) => {
  const lines = [...(entry.ingredients ?? []), ...(entry.instructions ?? [])];
  return lines.some((l) => /\[[^\]]*\]/.test(String(l)));
};

/** A home entry is publishable only when it's high-confidence AND carries no
 *  bracketed gaps. Partial/low entries are held back for human follow-up. */
export const isPublishable = (entry) =>
  entry.confidence === 'high' && !hasPlaceholders(entry);

/** entry.attribution {type:'person', name, notes?, url?} → union member. */
const mapAttribution = (a) => {
  if (a === undefined || a === null) return undefined;
  const record = { $type: 'exchange.recipe.defs#attributionPerson', name: a.name };
  if (nonEmpty(a.url)) record.url = a.url.trim();
  if (nonEmpty(a.notes)) record.notes = a.notes.trim();
  return record;
};

/** home-batch entry + timestamp → exchange.recipe.recipe record.
 *  Meta fields (id, image, enhanced, confidence, notes) are dropped. */
export const homeEntryToRecord = (entry, nowIso) => {
  const record = {
    $type: 'exchange.recipe.recipe',
    name: entry.name,
    text: cleanText(entry.text),
    ingredients: (entry.ingredients ?? []).map(cleanText),
    instructions: (entry.instructions ?? []).map(cleanText),
    langs: ['en'],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const attribution = mapAttribution(entry.attribution);
  if (attribution !== undefined) record.attribution = attribution;

  if (nonEmpty(entry.recipeCuisine)) record.recipeCuisine = entry.recipeCuisine.trim();
  if (nonEmpty(entry.recipeCategory)) record.recipeCategory = entry.recipeCategory.trim();
  if (Array.isArray(entry.suitableForDiet) && entry.suitableForDiet.length > 0)
    record.suitableForDiet = entry.suitableForDiet;
  if (Array.isArray(entry.keywords) && entry.keywords.length > 0) record.keywords = entry.keywords;

  const prepTime = parseTimeToIso(entry.prepTime);
  if (prepTime !== null) record.prepTime = prepTime;
  const cookTime = parseTimeToIso(entry.cookTime);
  if (cookTime !== null) record.cookTime = cookTime;
  const totalTime = parseTimeToIso(entry.totalTime);
  if (totalTime !== null) record.totalTime = totalTime;

  if (nonEmpty(entry.recipeYield)) record.recipeYield = entry.recipeYield.trim();

  return record;
};
