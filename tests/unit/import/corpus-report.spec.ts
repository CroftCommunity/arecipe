// @vitest-environment happy-dom
// EXP-IMPORT-EXTRACTION · the deterministic measurement. Runs every corpus
// fixture through BOTH ladders —
//   OLD (deployed): JSON-LD → text heuristic
//   NEW (Arm 1):    JSON-LD → DOM-structured (microdata/RDFa/h-recipe) → text
// — scores each against hand-keyed gold, and reports the usable-draft rate per
// arm plus the per-format conversion delta. Doubles as a regression guard: the
// Arm 1 ladder must never score BELOW the deployed ladder, and must recover the
// microdata/RDFa/h-recipe rows the deployed ladder misses.
//
// Run `EMIT_REPORT=1 npx vitest run tests/unit/import/corpus-report.spec.ts` to
// (re)write tools/import-experiment/corpus/conversion-report.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractRecipeFromJsonLd, type ImportedRecipe } from '../../../src/import/recipe-jsonld.js';
import { extractRecipeFromDom } from '../../../src/import/recipe-dom.js';
import { parseRecipeText } from '../../../src/import/recipe-text.js';
import {
  aggregate,
  isUsable,
  scoreSource,
  type ScoredRecipe,
  type SourceScore,
} from '../../../src/import/score.js';

type Gold = {
  name?: string;
  ingredients: string[];
  instructions: string[];
  recipeYield?: string;
};
type Entry = {
  id: string;
  category: string;
  format: string;
  file: string;
  gold: Gold | null; // null ⇒ nothing extractable is expected (a true ceiling row)
};

const fx = (name: string): string => readFileSync(`tests/fixtures/import/${name}`, 'utf8');
const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
const useful = (r: ImportedRecipe | null): r is ImportedRecipe =>
  r !== null && (r.ingredients.length > 0 || r.instructions.length > 0);

/** The deployed ladder: JSON-LD, then the visible-text heuristic. */
const oldLadder = (src: string): ImportedRecipe | null => {
  const doc = parse(src);
  const j = extractRecipeFromJsonLd(doc, parse);
  if (useful(j)) return j;
  const t = parseRecipeText(doc.body?.textContent ?? src, parse);
  if (useful(t)) return t;
  return j ?? null;
};

/** The Arm 1 ladder: JSON-LD, then DOM-structured formats, then text. */
const newLadder = (src: string): ImportedRecipe | null => {
  const doc = parse(src);
  const j = extractRecipeFromJsonLd(doc, parse);
  if (useful(j)) return j;
  const d = extractRecipeFromDom(doc, parse);
  if (useful(d)) return d;
  const t = parseRecipeText(doc.body?.textContent ?? src, parse);
  if (useful(t)) return t;
  return j ?? d ?? null;
};

const toScored = (r: ImportedRecipe | null): ScoredRecipe => ({
  name: r?.name ?? '',
  ingredients: r?.ingredients ?? [],
  instructions: r?.instructions ?? [],
  recipeYield: r?.recipeYield ?? '',
  prepTime: '',
  totalTime: '',
  image: '',
  sourceUrl: '',
});

const goldScored = (g: Gold | null): ScoredRecipe => ({
  name: g?.name ?? '',
  ingredients: g?.ingredients ?? [],
  instructions: g?.instructions ?? [],
  recipeYield: g?.recipeYield ?? '',
  prepTime: '',
  totalTime: '',
  image: '',
  sourceUrl: '',
});

// ─── The corpus (format-coverage fixtures; see the findings doc for why live
//     scraping is not possible from an automated environment). ────────────────
const CORPUS: Entry[] = [
  // JSON-LD rows — both ladders parse via the same JSON-LD rung (no delta).
  { id: 'jsonld-plain', category: 'big-site', format: 'json-ld', file: 'plain-recipe.html',
    gold: { name: 'Classic Pancakes', recipeYield: '4 servings',
      ingredients: ['2 cups flour', '2 tablespoons sugar', '1 tablespoon baking powder', '1 1/2 cups milk'],
      instructions: ['Whisk the dry ingredients.', 'Stir in the milk until just combined.', 'Cook on a hot griddle until bubbles form.'] } },
  { id: 'jsonld-graph', category: 'big-site', format: 'json-ld @graph', file: 'graph-recipe.html',
    gold: { name: 'Tomato Soup', ingredients: ['1 can tomatoes', '1 onion', '2 cups stock'],
      instructions: ['Sweat the onion.', 'Add tomatoes and stock.', 'Simmer and blend.'] } },
  { id: 'jsonld-type-array', category: 'big-site', format: 'json-ld @type[]', file: 'type-array.html',
    gold: { name: 'Guacamole', ingredients: ['2 avocados', '1 lime', 'salt'],
      instructions: ['Mash the avocados.', 'Squeeze in the lime and season.'] } },
  { id: 'jsonld-instr-string', category: 'blog', format: 'json-ld (numbered string)', file: 'instructions-string.html',
    gold: { name: 'Iced Tea', ingredients: ['4 tea bags', '1 quart water', 'sugar to taste'],
      instructions: ['Boil the water.', 'Steep the tea bags for five minutes.', 'Chill and serve over ice.'] } },
  { id: 'jsonld-howto-steps', category: 'blog', format: 'json-ld HowToStep[]', file: 'howto-steps.html',
    gold: { name: 'Scrambled Eggs', ingredients: ['3 eggs', '1 tablespoon butter', 'salt'],
      instructions: ['Beat the eggs with a pinch of salt.', 'Melt butter over low heat.', 'Add eggs and stir gently until just set.'] } },
  { id: 'jsonld-howto-sections', category: 'blog', format: 'json-ld HowToSection[]', file: 'howto-sections.html',
    gold: { name: 'Layer Cake', ingredients: ['2 cups flour', '1 cup sugar', '1 cup frosting'],
      instructions: ['— Cake', 'Cream butter and sugar.', 'Fold in the flour and bake.', '— Frosting', 'Whip the frosting until fluffy.', 'Spread between the cooled layers.'] } },
  { id: 'jsonld-legacy-ingr', category: 'blog', format: 'json-ld legacy ingredients', file: 'legacy-ingredients.html',
    gold: { name: 'Lemonade', ingredients: ['1 cup lemon juice', '1 cup sugar', '4 cups water'],
      instructions: ['Stir everything together and chill.'] } },
  { id: 'jsonld-entities', category: 'blog', format: 'json-ld (entities+tags)', file: 'entities-and-tags.html',
    gold: { name: 'Mac & Cheese', ingredients: ['8 oz macaroni', '2 cups sharp cheddar & gruyère', '2 tablespoons butter'],
      instructions: ['Boil the pasta.', 'Make a cheese sauce & combine.'] } },
  { id: 'jsonld-multi-script', category: 'big-site', format: 'json-ld (multi-script)', file: 'multiple-scripts.html',
    gold: { name: 'Banana Bread', ingredients: ['3 ripe bananas', '2 cups flour', '1 cup sugar'],
      instructions: ['Mash the bananas.', 'Mix in the dry ingredients.', 'Bake until a skewer comes out clean.'] } },

  // Structured-but-not-JSON-LD rows — the Arm 1 delta lives here.
  { id: 'microdata', category: 'microdata-era', format: 'microdata', file: 'microdata-recipe.html',
    gold: { name: 'Skillet Cornbread', recipeYield: '8 servings',
      ingredients: ['1 cup cornmeal', '1 cup flour', '1 cup buttermilk'],
      instructions: ['Heat the skillet in the oven.', 'Mix the batter and pour it in.', 'Bake until golden.'] } },
  { id: 'microdata-nested', category: 'microdata-era', format: 'microdata (nested scope)', file: 'microdata-nested-scope.html',
    gold: { name: 'Lemon Bars', ingredients: ['2 lemons', '1 cup sugar'],
      instructions: ['Zest and juice the lemons.', 'Bake the crust, add the filling, chill.'] } },
  { id: 'rdfa', category: 'rdfa-era', format: 'rdfa', file: 'rdfa-recipe.html',
    gold: { name: 'Herb Focaccia', ingredients: ['500 g bread flour', '2 tsp salt', '350 ml water'],
      instructions: ['Mix and rest the dough.', 'Dimple, oil, and bake.'] } },
  { id: 'hrecipe', category: 'hrecipe-era', format: 'h-recipe (v2)', file: 'hrecipe-recipe.html',
    gold: { name: 'Iced Mint Tea', ingredients: ['4 tea bags', '1 handful mint', '1 liter water'],
      instructions: ['Boil the water and steep the tea.', 'Add the mint and chill.'] } },
  { id: 'hrecipe-v1', category: 'hrecipe-era', format: 'hrecipe (v1)', file: 'hrecipe-v1.html',
    gold: { name: 'Quick Salsa', ingredients: ['3 tomatoes', '1 onion', '1 lime'],
      instructions: ['Dice everything and combine.', 'Season and rest ten minutes.'] } },
  { id: 'non-english-microdata', category: 'non-english', format: 'microdata (fr)', file: 'non-english-microdata.html',
    gold: { name: 'Crêpes de froment', recipeYield: '12 crêpes',
      ingredients: ['250 g de farine', '4 œufs', '500 ml de lait', '1 pincée de sel'],
      instructions: ['Mélanger la farine et les œufs.', 'Ajouter le lait peu à peu.', 'Cuire dans une poêle chaude.'] } },

  // Paste rows — no structured data; the text heuristic is the only rung (both same).
  { id: 'paste-cookbook', category: 'paste', format: 'plain text (cookbook)', file: 'cookbook-paste.txt',
    gold: { name: "Grandmother's Buttermilk Biscuits",
      ingredients: ['2 cups all-purpose flour', '1 tablespoon baking powder', '1 teaspoon salt', '6 tablespoons cold butter', '3/4 cup buttermilk'],
      instructions: ['Preheat the oven to 450 degrees.', 'Cut the butter into the flour, baking powder, and salt.', 'Stir in the buttermilk until just combined.', 'Pat out and cut, then bake for 12 minutes.'] } },
  { id: 'paste-message', category: 'paste', format: 'plain text (message)', file: 'message-paste.txt',
    gold: { name: 'white bean & kale soup',
      ingredients: ['2 tbsp olive oil', '1 onion, diced', '3 cloves garlic', '2 cans white beans', '1 bunch kale', '6 cups stock'],
      instructions: ['heat the oil and soften the onion and garlic', 'add the beans and stock and simmer 15 min', 'stir in the kale and cook till wilted'] } },

  // Ceiling rows — NO structured data and NO cleanly-parseable text. Neither arm
  // (deterministic) is expected to produce a usable draft; these are the residual
  // Arm 2 was proposed for, and the CORS/render ceiling in the URL case.
  { id: 'prose-blog', category: 'prose', format: 'prose (no structure)', file: 'prose-blog.html', gold: null },
  { id: 'consent-wall', category: 'ceiling', format: 'consent wall', file: 'consent-wall.html', gold: null },
  { id: 'js-rendered', category: 'ceiling', format: 'JS-rendered (empty HTML)', file: 'js-rendered-empty.html', gold: null },
];

type Row = { entry: Entry; oldScore: SourceScore; newScore: SourceScore; oldUsable: boolean; newUsable: boolean };

const run = (): Row[] =>
  CORPUS.map((entry) => {
    const src = fx(entry.file);
    const gold = goldScored(entry.gold);
    const oldR = toScored(oldLadder(src));
    const newR = toScored(newLadder(src));
    // A ceiling row (gold=null): "usable" means the arm WRONGLY fabricated a draft.
    // We invert — success on a ceiling row is producing nothing usable.
    const oldScore = scoreSource(gold, oldR);
    const newScore = scoreSource(gold, newR);
    return {
      entry,
      oldScore,
      newScore,
      oldUsable: entry.gold === null ? false : isUsable(oldScore),
      newUsable: entry.gold === null ? false : isUsable(newScore),
    };
  });

describe('EXP-IMPORT-EXTRACTION corpus · Arm 1 conversion', () => {
  const rows = run();
  const scorable = rows.filter((r) => r.entry.gold !== null);

  it('Arm 1 never scores BELOW the deployed ladder on any row', () => {
    for (const r of rows) {
      if (r.entry.gold === null) continue;
      // Arm 1 usable ⊇ deployed usable (monotonic improvement).
      if (r.oldUsable) expect(r.newUsable, `${r.entry.id} regressed`).toBe(true);
    }
  });

  it('Arm 1 (DOM extractors) is a precision layer over the hardened text path — never worse, and strictly better where the text fallback leaks a nested scope', () => {
    const structured = rows.filter((r) => /microdata|rdfa|hrecipe|non-english/.test(r.entry.id));
    for (const r of structured) {
      // Structured extraction is always usable and never costs MORE editing than
      // the text fallback (fewer/equal trivial edits = equal-or-higher fidelity).
      expect(r.newUsable, `Arm 1 should be usable on ${r.entry.id}`).toBe(true);
      expect(r.newScore.trivialEdits, `Arm 1 must not be worse than text on ${r.entry.id}`)
        .toBeLessThanOrEqual(r.oldScore.trivialEdits);
    }
    // The nested-scope row is the clean usable-flip: the text fallback leaks the
    // embedded review; the microdata scope-exclusion keeps it out.
    const nested = rows.find((r) => r.entry.id === 'microdata-nested')!;
    expect(nested.oldUsable).toBe(false);
    expect(nested.newUsable).toBe(true);
  });

  it('the hardened text path converts the informal-share residual, and Arm 1 is at least as good overall', () => {
    // The share-accuracy win: informal messy text (a chat paste) now parses.
    const msg = rows.find((r) => r.entry.id === 'paste-message')!;
    expect(msg.newUsable).toBe(true);

    const oldAgg = aggregate(scorable.map((r) => r.oldScore));
    const newAgg = aggregate(scorable.map((r) => r.newScore));
    expect(newAgg.usableDraftRate).toBeGreaterThanOrEqual(oldAgg.usableDraftRate);
    // Higher fidelity overall: Arm 1's total trivial-edit cost is no worse.
    const sumEdits = (rs: Row[], pick: (r: Row) => SourceScore): number =>
      rs.reduce((s, r) => s + Math.min(pick(r).trivialEdits, 99), 0);
    expect(sumEdits(scorable, (r) => r.newScore)).toBeLessThanOrEqual(sumEdits(scorable, (r) => r.oldScore));

    if (process.env.EMIT_REPORT === '1') emitReport(rows, oldAgg, newAgg);
  });
});

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function emitReport(
  rows: Row[],
  oldAgg: ReturnType<typeof aggregate>,
  newAgg: ReturnType<typeof aggregate>,
): void {
  const scorable = rows.filter((r) => r.entry.gold !== null);
  const recovered = rows.filter((r) => !r.oldUsable && r.newUsable);
  const lines: string[] = [];
  lines.push('# Arm 1 conversion report (generated by tests/unit/import/corpus-report.spec.ts)');
  lines.push('');
  lines.push('Do not edit by hand. Regenerate with `EMIT_REPORT=1 npx vitest run tests/unit/import/corpus-report.spec.ts`.');
  lines.push('');
  lines.push(`- Corpus rows: **${rows.length}** (${scorable.length} scorable + ${rows.length - scorable.length} ceiling rows).`);
  lines.push(`- Usable-draft rate — **deployed ladder: ${pct(oldAgg.usableDraftRate)}** → **Arm 1 ladder: ${pct(newAgg.usableDraftRate)}** (scorable rows only).`);
  lines.push(`- Rows Arm 1 converts that the deployed ladder does not: **${recovered.length}** (${recovered.map((r) => r.entry.id).join(', ')}).`);
  lines.push('');
  lines.push('## Per-row outcome');
  lines.push('');
  lines.push('| id | category | format | deployed | Arm 1 | delta |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const o = r.entry.gold === null ? '— (ceiling)' : r.oldUsable ? '✅ usable' : '❌ not usable';
    const n = r.entry.gold === null ? '— (ceiling)' : r.newUsable ? '✅ usable' : '❌ not usable';
    const delta = !r.oldUsable && r.newUsable ? '**＋converted**' : r.oldUsable && !r.newUsable ? '⚠︎ regressed' : '·';
    lines.push(`| ${r.entry.id} | ${r.entry.category} | ${r.entry.format} | ${o} | ${n} | ${delta} |`);
  }
  lines.push('');
  lines.push('## Per-format conversion delta (the follow-up ordering)');
  lines.push('');
  lines.push('| format | rows | converted by Arm 1 |');
  lines.push('| --- | --- | --- |');
  const byFmt = new Map<string, { total: number; conv: number }>();
  for (const r of rows) {
    const key = r.entry.format;
    const b = byFmt.get(key) ?? { total: 0, conv: 0 };
    b.total += 1;
    if (!r.oldUsable && r.newUsable) b.conv += 1;
    byFmt.set(key, b);
  }
  for (const [fmt, b] of byFmt) lines.push(`| ${fmt} | ${b.total} | ${b.conv} |`);
  lines.push('');
  lines.push('## Per-field precision / recall (scorable rows)');
  lines.push('');
  lines.push('| field | deployed P | deployed R | Arm 1 P | Arm 1 R |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const f of ['name', 'ingredients', 'instructions', 'recipeYield'] as const) {
    const o = oldAgg.perField[f];
    const nw = newAgg.perField[f];
    lines.push(`| ${f} | ${pct(o.precision)} | ${pct(o.recall)} | ${pct(nw.precision)} | ${pct(nw.recall)} |`);
  }
  lines.push('');

  mkdirSync('tools/import-experiment/corpus', { recursive: true });
  writeFileSync('tools/import-experiment/corpus/conversion-report.md', lines.join('\n'));
}
