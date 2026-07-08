// schema.org/Recipe JSON-LD extractor (NON-PRODUCTION, ops tooling).
// Fetches a recipe page and pulls the FACTUAL fields — ingredients, method
// steps, times, yield — from its embedded Recipe JSON-LD. It deliberately
// does NOT take the source's `description` prose (that is the site's
// expressive text): descriptions are authored fresh downstream. Pure parsing
// is unit-tested (extract-jsonld.test.mjs); only fetchRecipe touches network.

/** Walk any JSON-LD value and return the first node whose @type is Recipe. */
export const findRecipeNode = (data) => {
  let found = null;
  const walk = (node) => {
    if (found !== null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const type = node['@type'];
    const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
    if (isRecipe) {
      found = node;
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(data);
  return found;
};

/** recipeInstructions → flat list of step strings, across the shape zoo. */
export const stepTexts = (instructions) => {
  const out = [];
  const push = (text) => {
    if (typeof text === 'string') {
      const trimmed = text.trim();
      if (trimmed !== '') out.push(trimmed);
    }
  };
  const walk = (node) => {
    if (typeof node === 'string') return push(node);
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node.itemListElement)) return walk(node.itemListElement);
    push(node.text ?? node.name);
  };
  walk(instructions);
  return out;
};

/** recipeYield may be a string, number, or array — return one clean string. */
export const firstYield = (value) => {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]).trim() : '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
};

const JSONLD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Parse every JSON-LD block in the HTML and return the first Recipe's facts. */
export const extractRecipeFromHtml = (html) => {
  let recipe = null;
  for (const match of html.matchAll(JSONLD_RE)) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue; // a malformed block never sinks the others
    }
    recipe = findRecipeNode(parsed);
    if (recipe !== null) break;
  }
  if (recipe === null) return null;
  return {
    name: typeof recipe.name === 'string' ? recipe.name.trim() : '',
    ingredients: Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map((i) => String(i).trim()).filter((i) => i !== '')
      : [],
    instructions: stepTexts(recipe.recipeInstructions),
    prepTime: typeof recipe.prepTime === 'string' ? recipe.prepTime : null,
    cookTime: typeof recipe.cookTime === 'string' ? recipe.cookTime : null,
    totalTime: typeof recipe.totalTime === 'string' ? recipe.totalTime : null,
    recipeYield: firstYield(recipe.recipeYield),
  };
};

/** Fetch a page (browser UA) and extract its Recipe facts; null on any miss. */
export const fetchRecipe = async (url) => {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return extractRecipeFromHtml(await res.text());
};
