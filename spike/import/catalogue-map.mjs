// Catalogue → exchange.recipe.recipe mapper (NON-PRODUCTION, ops tooling).
// Turns a flagship entry from assets/recipe_catalogue.md into a record whose
// field formats follow the observed wild convention (see spike/seed-greek-
// salad.mjs): plain-word recipeCuisine/recipeCategory, token-ref diet, and an
// attributionWebsite crediting the source. Descriptions are the catalogue's
// own prose; ingredients/method are facts, credited via attribution. Pure and
// unit-tested — see catalogue-map.test.mjs. No network, no secrets here.

/** Catalogue category → defs plain-word cuisine. "Classics" is not a cuisine. */
const CUISINE = {
  American: 'american',
  Greek: 'greek',
  Mexican: 'mexican',
  Italian: 'italian',
  Indian: 'indian',
  French: 'french',
  Thai: 'thai',
};

export const cuisineToken = (category) => CUISINE[category];

/** Meal/dish-type labels that populate recipeCategory (defs#recipeCategory). */
const MEAL_LABELS = new Set([
  'appetizer', 'beverage', 'breakfast', 'brunch', 'cocktail', 'dessert',
  'dinner', 'entree', 'garnish', 'lunch', 'salad', 'side', 'snack', 'soup',
]);

/** Dietary labels → defs#diet token refs (only enum members map). */
const DIET_TOKEN = {
  vegetarian: 'exchange.recipe.defs#dietVegetarian',
  vegan: 'exchange.recipe.defs#dietVegan',
  'gluten-free': 'exchange.recipe.defs#dietGlutenFree',
  keto: 'exchange.recipe.defs#dietKeto',
  paleo: 'exchange.recipe.defs#dietPaleo',
  kosher: 'exchange.recipe.defs#dietKosher',
  halal: 'exchange.recipe.defs#dietHalal',
  diabetic: 'exchange.recipe.defs#dietDiabetic',
  'low-carb': 'exchange.recipe.defs#dietLowCarb',
  'low-fat': 'exchange.recipe.defs#dietLowFat',
  'low-calorie': 'exchange.recipe.defs#dietLowCalorie',
};

/** source-URL hostname → publisher display name. */
const SITE = {
  'recipetineats.com': 'RecipeTin Eats',
  'seriouseats.com': 'Serious Eats',
  'themediterraneandish.com': 'The Mediterranean Dish',
  'hot-thai-kitchen.com': 'Hot Thai Kitchen',
  'isabeleats.com': 'Isabel Eats',
  'simplyrecipes.com': 'Simply Recipes',
  'kingarthurbaking.com': 'King Arthur Baking',
};

/** "1 hr 10 min", "3 hr", "15 min (plus soaking)" → ISO-8601; else null. */
export const parseTimeToIso = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const base = raw.replace(/\([^)]*\)/g, '');
  const hrs = /(\d+)\s*hr/.exec(base);
  const mins = /(\d+)\s*min/.exec(base);
  const h = hrs === null ? 0 : Number(hrs[1]);
  const m = mins === null ? 0 : Number(mins[1]);
  if (h === 0 && m === 0) return null;
  return `PT${h > 0 ? `${h}H` : ''}${m > 0 ? `${m}M` : ''}`;
};

/** The "(plus …)" nuance a strict duration can't carry, e.g. "plus marinating". */
const parentheticalNote = (raw) => {
  if (typeof raw !== 'string') return null;
  const m = /\(([^)]+)\)/.exec(raw);
  return m === null ? null : m[1].trim();
};

/** Split catalogue labels into { category, diet[], keywords[] }. The first
 * meal-type label becomes recipeCategory; further meal labels and any label
 * without a diet token fall through to keywords. */
export const classifyLabels = (labels) => {
  const list = Array.isArray(labels) ? labels : [];
  let category;
  const diet = [];
  const keywords = [];
  for (const label of list) {
    if (MEAL_LABELS.has(label)) {
      if (category === undefined) category = label;
      else keywords.push(label);
      continue;
    }
    const token = DIET_TOKEN[label];
    if (token !== undefined) diet.push(token);
    else keywords.push(label);
  }
  return { category, diet, keywords };
};

export const siteName = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return SITE[host] ?? host;
};

/** Flagship catalogue entry + timestamp → exchange.recipe.recipe record.
 * Optional fields are omitted (not emitted as empty) to match the lexicon's
 * open-world floor and keep the record clean. */
export const mapEntry = (entry, nowIso) => {
  const { category, diet, keywords } = classifyLabels(entry.labels);
  const notes = [entry.prep_time, entry.cook_time, entry.total_time]
    .map(parentheticalNote)
    .filter((n) => n !== null);
  const allKeywords = [
    ...keywords,
    ...notes,
    ...(entry.category === 'Classics' ? ['classic'] : []),
  ];

  const record = {
    $type: 'exchange.recipe.recipe',
    name: entry.name,
    text: entry.description,
    ingredients: entry.ingredients,
    instructions: entry.instructions,
    langs: ['en'],
    attribution: {
      $type: 'exchange.recipe.defs#attributionWebsite',
      name: siteName(entry.source_url),
      url: entry.source_url,
      notes: 'Ingredients and method adapted from the source; description rewritten.',
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const cuisine = cuisineToken(entry.category);
  if (cuisine !== undefined) record.recipeCuisine = cuisine;
  if (category !== undefined) record.recipeCategory = category;
  if (diet.length > 0) record.suitableForDiet = diet;
  if (allKeywords.length > 0) record.keywords = allKeywords;

  const prepTime = parseTimeToIso(entry.prep_time);
  if (prepTime !== null) record.prepTime = prepTime;
  const cookTime = parseTimeToIso(entry.cook_time);
  if (cookTime !== null) record.cookTime = cookTime;
  const totalTime = parseTimeToIso(entry.total_time);
  if (totalTime !== null) record.totalTime = totalTime;

  const recipeYield = typeof entry.servings === 'string' ? entry.servings.trim() : '';
  if (recipeYield !== '') record.recipeYield = recipeYield;

  return record;
};
