/** Title line for the app shell. */
export const shellTitle = (recipeCount: number): string =>
  recipeCount === 0 ? 'arecipe — no recipes yet' : `arecipe — ${recipeCount} recipes`;
