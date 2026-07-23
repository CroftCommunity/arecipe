// D15 Phase 5 — nutrition. The Wikibooks infobox `energy` field → nutrition.
// calories, when parseable (kcal directly, or kJ→kcal). Conservative: only
// calories is derivable upstream (no fat/protein/carb), and an ambiguous value
// omits nutrition entirely rather than guessing.

export type Nutrition = { calories?: number; fatContent?: number; proteinContent?: number; carbohydrateContent?: number };

const KJ_PER_KCAL = 4.184;

/**
 * Parse an infobox energy string into `{ calories }`, or undefined when it
 * cannot be read confidently. Recognizes an explicit kcal/Calorie or kJ unit;
 * a bare number with no unit is treated as ambiguous (undefined).
 */
export const nutritionFor = (energy: string | undefined): Nutrition | undefined => {
  if (energy === undefined) return undefined;
  const s = energy.toLowerCase().replace(/,/g, '');
  const m = /(\d+(?:\.\d+)?)\s*(kcal|cal|calorie|calories|kj|kilojoules?|joules?)/.exec(s);
  if (m === null) return undefined;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = m[2] ?? '';
  const calories = unit.startsWith('kj') || unit.startsWith('kilojoule') || unit.startsWith('joule')
    ? Math.round(value / KJ_PER_KCAL)
    : Math.round(value);
  return { calories };
};
