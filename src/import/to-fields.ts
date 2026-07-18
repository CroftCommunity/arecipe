// Map an ImportedRecipe into the editor's EditorFields (import Phase 4, D3).
// This is the handoff shape: the importer saves these fields as a local draft
// and the editor opens on it for the cook's normal review/publish flow. Empty
// buckets map to empty strings — the draft is left blank there (flagged in the
// panel), never fabricated.

import type { ImportedRecipe } from './recipe-jsonld.js';
import { isoDurationToMinutes, type EditorFields } from '../recipes/write.js';

export const mapImportedToFields = (recipe: ImportedRecipe, sourceUrl: string): EditorFields => {
  const fields: EditorFields = {
    name: recipe.name ?? '',
    text: recipe.text ?? '',
    ingredients: recipe.ingredients.join('\n'),
    instructions: recipe.instructions.join('\n'),
    prepMinutes: isoDurationToMinutes(recipe.prepTime),
    totalMinutes: isoDurationToMinutes(recipe.totalTime),
    recipeYield: recipe.recipeYield ?? '',
  };
  const trimmedUrl = sourceUrl.trim();
  if (trimmedUrl !== '') fields.sourceUrl = trimmedUrl; // provenance
  return fields;
};
