// SPIKE (Phase 0 / D3): promoted scaffold, not yet under TDD.
// Phase 1 wraps this in real tests before it ships.

/** Title line for the app shell. Pure — unit-tested by the D3 harness probe. */
export const shellTitle = (recipeCount: number): string =>
  recipeCount === 0 ? 'arecipe — no recipes yet' : `arecipe — ${recipeCount} recipes`;
