// The shipped canonical ingredient vocabulary (plans/2026-08-12-1 Phase 1),
// typed once here so every consumer resolves against the same object (the
// resolver memoizes its index per vocabulary object).
import { type Vocabulary } from './ingredient-key.js';
import generated from './ingredientkeys.json' with { type: 'json' };

export const INGREDIENT_VOCABULARY: Vocabulary = generated;

/** Build-time facts about the shipped vocabulary, for tests and the review page. */
export const INGREDIENT_VOCABULARY_META: { readonly keys: number; readonly coverage: number; readonly reviewed: boolean } =
  generated._meta;
