// Recipe export (Browse "export" button). Pure serialization of the
// currently-shown recipes to CSV / TXT / JSON, with an opt-in "full details"
// mode that carries ingredients + instructions. The Browse page maps its
// CachedRecipe entries to ExportRecipe, calls serializeRecipes, and hands the
// string to a download link — no DOM or I/O here, so it's fully unit-testable.

/** The flat, export-shaped view of a recipe the serializers consume. */
export type ExportRecipe = {
  name: string;
  cuisine: string;
  category: string;
  /** A shareable web link to the recipe (recipe.html?u=<uri>). */
  link: string;
  ingredients: string[];
  instructions: string[];
};

export type ExportFormat = 'csv' | 'txt' | 'json';

export type ExportOptions = {
  format: ExportFormat;
  /** When true, include the ingredients + instructions (the full recipe). */
  details: boolean;
};

const BASE_COLUMNS = ['name', 'cuisine', 'category', 'link'] as const;

/** RFC-4180 CSV field: quote when it holds a comma, quote, CR, or LF, doubling
 *  embedded quotes. */
const csvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const toCsv = (recipes: ExportRecipe[], details: boolean): string => {
  const columns = details ? [...BASE_COLUMNS, 'ingredients', 'instructions'] : [...BASE_COLUMNS];
  const rows = recipes.map((r) => {
    const cells = [r.name, r.cuisine, r.category, r.link];
    if (details) cells.push(r.ingredients.join(' | '), r.instructions.join(' | '));
    return cells.map(csvField).join(',');
  });
  return [columns.join(','), ...rows].join('\n');
};

const toTxt = (recipes: ExportRecipe[], details: boolean): string =>
  recipes
    .map((r) => {
      const lines = [r.name, `Cuisine: ${r.cuisine}`, `Category: ${r.category}`, `Link: ${r.link}`];
      if (details) {
        lines.push('', 'Ingredients:', ...r.ingredients.map((i) => `  - ${i}`));
        lines.push('', 'Instructions:', ...r.instructions.map((s, i) => `  ${i + 1}. ${s}`));
      }
      return lines.join('\n');
    })
    .join('\n\n———\n\n');

const toJson = (recipes: ExportRecipe[], details: boolean): string =>
  JSON.stringify(
    recipes.map((r) => ({
      name: r.name,
      cuisine: r.cuisine,
      category: r.category,
      link: r.link,
      ...(details ? { ingredients: r.ingredients, instructions: r.instructions } : {}),
    })),
    null,
    2,
  );

/** Serialize recipes to the chosen format. Pure. */
export const serializeRecipes = (recipes: ExportRecipe[], opts: ExportOptions): string => {
  switch (opts.format) {
    case 'csv':
      return toCsv(recipes, opts.details);
    case 'txt':
      return toTxt(recipes, opts.details);
    case 'json':
      return toJson(recipes, opts.details);
  }
};

/** The MIME type to stamp on the download blob for a format. */
export const mimeFor = (format: ExportFormat): string => {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
  }
};

/** The file extension for a format (no leading dot). */
export const extensionFor = (format: ExportFormat): string => format;
