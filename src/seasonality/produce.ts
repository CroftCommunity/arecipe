// Feature B (seasonality) — static, versioned-in-repo produce data (B-D1).
// Produce-keyed with per-region month sets, because one item has different
// seasons in different places. A TS module (not JSON) to match repo convention
// for curated static tables (taste-preference.ts, shopping-list.ts) — typed,
// tree-shaken, no fetch.
//
// Region is EXPLICIT and never inferred (B-D2): no geolocation, no locale
// guess. It is a settings value with a labelled default. The Southern-temperate
// sets are the Northern sets shifted by six months (the standard temperate
// approximation); the stored shape is still an explicit per-region month set.

export type RegionId = 'northern-temperate' | 'southern-temperate';

export interface Region {
  readonly id: RegionId;
  readonly label: string;
}

export const REGIONS: readonly Region[] = [
  { id: 'northern-temperate', label: 'Northern Hemisphere (temperate)' },
  { id: 'southern-temperate', label: 'Southern Hemisphere (temperate)' },
];

// Provisional default (flagged in the run summary): the owner had not decided
// by Phase 0. Northern-temperate is the largest slice of the likely early
// audience; it is explicit, visibly labelled in settings, and one tap to change.
export const DEFAULT_REGION: RegionId = 'northern-temperate';

export interface Produce {
  readonly id: string; // stable slug
  readonly display: string;
  readonly aliases: readonly string[]; // explicit, curated (B-D3)
  readonly seasons: Readonly<Record<RegionId, readonly number[]>>; // months 1-12
}

/** Northern set + 6 months (wrapping) → the Southern set. Author-time helper;
 *  the resulting arrays are stored explicitly per region. */
const shift6 = (months: readonly number[]): number[] =>
  [...months].map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);

const p = (
  id: string,
  display: string,
  aliases: readonly string[],
  north: readonly number[],
): Produce => ({
  id,
  display,
  aliases,
  seasons: { 'northern-temperate': [...north], 'southern-temperate': shift6(north) },
});

export const PRODUCE: readonly Produce[] = [
  p('asparagus', 'Asparagus', ['asparagus'], [3, 4, 5, 6]),
  p('rhubarb', 'Rhubarb', ['rhubarb'], [3, 4, 5]),
  p('pea', 'Peas', ['pea', 'garden pea', 'petit pois'], [5, 6, 7]),
  p('strawberry', 'Strawberries', ['strawberry'], [5, 6, 7]),
  p('spinach', 'Spinach', ['spinach', 'baby spinach'], [4, 5, 6, 9, 10]),
  p('cherry', 'Cherries', ['cherry'], [6, 7]),
  p('tomato', 'Tomatoes', ['tomato', 'cherry tomato', 'plum tomato', 'vine tomato'], [6, 7, 8, 9]),
  p('cucumber', 'Cucumber', ['cucumber'], [6, 7, 8, 9]),
  p('zucchini', 'Courgette / Zucchini', ['zucchini', 'courgette'], [6, 7, 8, 9]),
  p('green-bean', 'Green beans', ['green bean', 'french bean', 'runner bean'], [6, 7, 8, 9]),
  p('bell-pepper', 'Bell pepper', ['bell pepper', 'pepper', 'capsicum'], [7, 8, 9, 10]),
  p('corn', 'Sweetcorn', ['corn', 'sweetcorn', 'sweet corn'], [7, 8, 9]),
  p('carrot', 'Carrots', ['carrot'], [6, 7, 8, 9, 10]),
  p('beetroot', 'Beetroot', ['beetroot', 'beet'], [6, 7, 8, 9, 10]),
  p('blackberry', 'Blackberries', ['blackberry'], [8, 9]),
  p('plum', 'Plums', ['plum'], [8, 9]),
  p('fig', 'Figs', ['fig'], [8, 9]),
  p('grape', 'Grapes', ['grape'], [9, 10]),
  p('apple', 'Apples', ['apple'], [9, 10, 11]),
  p('pear', 'Pears', ['pear'], [8, 9, 10, 11]),
  p('pumpkin', 'Pumpkin', ['pumpkin'], [9, 10, 11]),
  p('squash', 'Winter squash', ['squash', 'butternut squash', 'butternut'], [9, 10, 11, 12]),
  p('cauliflower', 'Cauliflower', ['cauliflower'], [9, 10, 11, 12]),
  p('mushroom', 'Mushrooms', ['mushroom', 'wild mushroom'], [9, 10, 11]),
  p('cabbage', 'Cabbage', ['cabbage'], [10, 11, 12, 1, 2]),
  p('kale', 'Kale', ['kale', 'cavolo nero'], [10, 11, 12, 1, 2]),
  p('leek', 'Leeks', ['leek'], [10, 11, 12, 1, 2, 3]),
  p('parsnip', 'Parsnips', ['parsnip'], [10, 11, 12, 1, 2]),
  p('brussels-sprout', 'Brussels sprouts', ['brussels sprout', 'sprout'], [10, 11, 12, 1]),
  p('lemon', 'Lemons', ['lemon'], [12, 1, 2, 3]),
  p('orange', 'Oranges', ['orange'], [12, 1, 2, 3]),
];
