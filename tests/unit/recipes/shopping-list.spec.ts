// Shopping-list core (plans/2026-07-18-1-plan-shopping-list.md).
// Phase 1: the ingredient PARSER is fixture-table-driven — tests/fixtures/
// shopping/ingredient-lines.json is the grammar contract. Every D3 form
// (integers, decimals, ASCII + unicode fractions, mixed, ranges, unit
// synonyms/plurals, name-only, unparseable) has a row; the table is extended
// before the grammar ever is.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyStaples,
  buildShoppingList,
  collectScheduledRefs,
  combinedLineKey,
  combinedLineText,
  expandedWeekCount,
  filterForShopping,
  makeStapleMatcher,
  normalizeIngredientName,
  parseIngredient,
  planDateBounds,
  rawLineKey,
  stapleLineKeys,
  renderAiShopperText,
  renderByRecipeMarkdown,
  renderCombinedMarkdown,
  renderShoppingListDocument,
  resolveShoppingList,
  scaleIngredientLine,
  shoppingListFilename,
  type ParsedIngredient,
  type ScheduledRecipe,
  type ShoppingPlan,
} from '../../../src/recipes/shopping-list.js';

type FixtureQty = null | number | { min: number; max: number };
type FixtureCase = {
  raw: string;
  qty: FixtureQty;
  unit: string | null;
  name: string;
  unparsed?: boolean;
};

const table = JSON.parse(
  readFileSync(new URL('../../fixtures/shopping/ingredient-lines.json', import.meta.url), 'utf8'),
) as { cases: FixtureCase[] };

/** The parser's structured qty flattened to the fixture's comparable shape. */
const qtyToFixture = (parsed: ParsedIngredient): FixtureQty => {
  if (parsed.qty === undefined) return null;
  const { min, max, range } = parsed.qty;
  return range ? { min, max } : min;
};

describe('parseIngredient — fixture table (the grammar contract)', () => {
  for (const c of table.cases) {
    it(`parses ${JSON.stringify(c.raw)}`, () => {
      const parsed = parseIngredient(c.raw);

      // Quantity: null / single number / range, within float tolerance.
      const q = qtyToFixture(parsed);
      if (c.qty === null) {
        expect(q).toBeNull();
      } else if (typeof c.qty === 'number') {
        expect(typeof q).toBe('number');
        expect(q as number).toBeCloseTo(c.qty, 9);
      } else {
        const range = q as { min: number; max: number };
        expect(range).not.toBeNull();
        expect(range.min).toBeCloseTo(c.qty.min, 9);
        expect(range.max).toBeCloseTo(c.qty.max, 9);
      }

      expect(parsed.unit ?? null).toBe(c.unit);
      expect(parsed.name).toBe(c.name);
      expect(parsed.unparsed === true).toBe(c.unparsed === true);
      // The raw is always preserved verbatim.
      expect(parsed.raw).toBe(c.raw);
    });
  }

  it('covers every D3 form (fixture table is non-trivial)', () => {
    expect(table.cases.length).toBeGreaterThanOrEqual(40);
  });
});

// --- Phase 2: aggregation + flags -----------------------------------------

const recipe = (name: string, ingredients: string[] | undefined, count = 1): ScheduledRecipe => ({
  uri: `at://did:plc:x/exchange.recipe.recipe/${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  count,
  ingredients,
});

/** The combined line for a normalized name (or undefined). */
const combinedFor = (list: ReturnType<typeof buildShoppingList>, name: string) =>
  list.combined.lines.find((l) => l.name === name);

describe('buildShoppingList — combined aggregation', () => {
  it('sums the same ingredient across recipes in a compatible unit', () => {
    const list = buildShoppingList([
      recipe('A', ['2 cups flour']),
      recipe('B', ['1 cup flour']),
    ]);
    const flour = combinedFor(list, 'flour');
    expect(flour?.parts).toEqual(['3 cups']);
    expect(combinedLineText(flour!)).toBe('flour — 3 cups');
  });

  it('renders a sum in the smallest unit present so integers stay integers', () => {
    const list = buildShoppingList([recipe('A', ['1 cup butter', '2 tbsp butter'])]);
    // 1 cup (48 tsp) + 2 tbsp (6 tsp) = 54 tsp = 18 tbsp (smallest present).
    expect(combinedFor(list, 'butter')?.parts).toEqual(['18 tbsp']);
  });

  it('multiplies a recipe scheduled ×N', () => {
    const list = buildShoppingList([recipe('A', ['1 cup flour'], 2)]);
    expect(combinedLineText(combinedFor(list, 'flour')!)).toBe('flour — 2 cups');
  });

  it('sums ranges end-to-end and keeps them ranges', () => {
    const list = buildShoppingList([
      recipe('A', ['1-2 cups broth']),
      recipe('B', ['2 cups broth']),
    ]);
    expect(combinedLineText(combinedFor(list, 'broth')!)).toBe('broth — 3–4 cups');
  });

  it('multiplies a range by the schedule count', () => {
    const list = buildShoppingList([recipe('A', ['1-2 cups broth'], 2)]);
    expect(combinedLineText(combinedFor(list, 'broth')!)).toBe('broth — 2–4 cups');
  });

  it('never converts across families — lists them separately under one heading', () => {
    const list = buildShoppingList([recipe('A', ['2 cups flour', '100 g flour'])]);
    const flour = combinedFor(list, 'flour');
    expect(flour?.parts).toEqual(['2 cups', '100 g']);
    expect(combinedLineText(flour!)).toBe('flour — 2 cups + 100 g');
  });

  it('keeps imperial and metric volume as separate families (no fuzzy conversion)', () => {
    const list = buildShoppingList([recipe('A', ['1 cup milk', '200 ml milk'])]);
    const milk = combinedFor(list, 'milk');
    expect(milk?.parts).toEqual(['1 cup', '200 ml']);
  });

  it('aggregates bare unquantified lines as an occurrence count (×N)', () => {
    const list = buildShoppingList([
      recipe('A', ['cucumber']),
      recipe('B', ['cucumber']),
      recipe('C', ['cucumber']),
    ]);
    expect(combinedLineText(combinedFor(list, 'cucumber')!)).toBe('cucumber ×3');
  });

  it('counts a bare line by the schedule count too', () => {
    const list = buildShoppingList([recipe('A', ['cucumber'], 3)]);
    expect(combinedLineText(combinedFor(list, 'cucumber')!)).toBe('cucumber ×3');
  });

  it('sums explicit unit-less counts', () => {
    const list = buildShoppingList([recipe('A', ['2 eggs']), recipe('B', ['3 eggs'])]);
    expect(combinedLineText(combinedFor(list, 'egg')!)).toBe('egg ×5');
  });

  it('renders a measured family and a bare occurrence under one heading', () => {
    const list = buildShoppingList([recipe('A', ['2 cups flour', 'flour'])]);
    expect(combinedLineText(combinedFor(list, 'flour')!)).toBe('flour — 2 cups + ×1');
  });

  it('renders fractional sums with vulgar fractions', () => {
    const list = buildShoppingList([recipe('A', ['½ cup sugar', '¼ cup sugar'])]);
    // 24 tsp + 12 tsp = 36 tsp = 0.75 cup.
    expect(combinedLineText(combinedFor(list, 'sugar')!)).toBe('sugar — ¾ cup');
  });
});

describe('buildShoppingList — unparsed → as listed (attributed)', () => {
  it('routes an unparseable line to "as listed" with recipe attribution', () => {
    const list = buildShoppingList([recipe('Soup', ['2 cups', 'flour'])]);
    expect(list.combined.asListed).toEqual([{ raw: '2 cups', recipes: ['Soup'] }]);
    // The parseable line still aggregates.
    expect(combinedFor(list, 'flour')).toBeDefined();
  });

  it('attributes the same unparseable line to every recipe it came from', () => {
    // "..." is genuinely nameless (no letters survive) → unparsed in both.
    const list = buildShoppingList([recipe('A', ['...']), recipe('B', ['...'])]);
    expect(list.combined.asListed).toEqual([{ raw: '...', recipes: ['A', 'B'] }]);
  });
});

describe('buildShoppingList — per-recipe flags', () => {
  it('flags exactly the lines that did not roll up (unparsed)', () => {
    const list = buildShoppingList([recipe('Soup', ['2 cups', 'flour', 'cucumber'])]);
    const section = list.byRecipe.find((s) => s.name === 'Soup');
    expect(section?.lines).toEqual([
      { raw: '2 cups', flagged: true },
      { raw: 'flour', flagged: false },
      { raw: 'cucumber', flagged: false },
    ]);
  });

  it('shows each recipe once with its ×N count and verbatim lines', () => {
    const list = buildShoppingList([recipe('Chili', ['2 cups beans'], 2)]);
    const section = list.byRecipe.find((s) => s.name === 'Chili');
    expect(section?.count).toBe(2);
    expect(section?.unavailable).toBe(false);
    expect(section?.lines).toEqual([{ raw: '2 cups beans', flagged: false }]);
  });
});

describe('buildShoppingList — unavailable recipes degrade, never drop', () => {
  it('surfaces an unresolvable recipe in BOTH views, flagged', () => {
    const list = buildShoppingList([
      recipe('Ghost', undefined),
      recipe('Real', ['1 cup flour']),
    ]);
    const ghost = list.byRecipe.find((s) => s.name === 'Ghost');
    expect(ghost?.unavailable).toBe(true);
    expect(ghost?.lines).toEqual([]);
    expect(list.combined.unavailable).toContain('Ghost');
    // The rest of the list is intact.
    expect(combinedFor(list, 'flour')).toBeDefined();
  });
});

describe('buildShoppingList — identity modulo normalization', () => {
  it('aggregating one recipe scheduled once reproduces its lines', () => {
    const list = buildShoppingList([
      recipe('Solo', ['2 cups flour', '1 tbsp olive oil', 'cucumber']),
    ]);
    const texts = list.combined.lines.map((l) => combinedLineText(l)).sort();
    expect(texts).toEqual(['cucumber ×1', 'flour — 2 cups', 'olive oil — 1 tbsp'].sort());
    expect(list.combined.asListed).toEqual([]);
  });
});

// --- Phase 3: range + resolution ------------------------------------------

const meal = (uri: string, name: string) => ({ recipe: { uri, cid: `bafy${name}`, name } });
const emptyDay = () => ({ meals: [] as ReturnType<typeof meal>[] });
/** A day with the given meals, padded to a full 7-day week. */
const week = (repeat: number, days: ReturnType<typeof emptyDay>[]) => ({
  repeat,
  days: [...days, ...Array.from({ length: 7 - days.length }, emptyDay)],
});

const LASAGNA = 'at://did:plc:cook/exchange.recipe.recipe/lasagna';
const TACOS = 'at://did:plc:cook/exchange.recipe.recipe/tacos';

describe('collectScheduledRefs — range selection over expanded weeks', () => {
  it('collects every scheduled meal with occurrence counts (all)', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      weeks: [week(1, [{ meals: [meal(LASAGNA, 'Lasagna')] }, { meals: [meal(TACOS, 'Tacos')] }])],
    };
    const refs = collectScheduledRefs(plan, { kind: 'all' });
    expect(refs.map((r) => [r.name, r.count])).toEqual([
      ['Lasagna', 1],
      ['Tacos', 1],
    ]);
  });

  it('honors a week repeat (×N) when counting occurrences', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      weeks: [week(2, [{ meals: [meal(LASAGNA, 'Lasagna')] }])],
    };
    const refs = collectScheduledRefs(plan, { kind: 'all' });
    expect(refs).toEqual([{ uri: LASAGNA, cid: 'bafyLasagna', name: 'Lasagna', count: 2 }]);
  });

  it('filters by expanded-week index for undated plans', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      weeks: [
        week(1, [{ meals: [meal(LASAGNA, 'Lasagna')] }]),
        week(1, [{ meals: [meal(TACOS, 'Tacos')] }]),
      ],
    };
    const refs = collectScheduledRefs(plan, { kind: 'weeks', from: 2, to: 2 });
    expect(refs.map((r) => r.name)).toEqual(['Tacos']);
  });

  it('selects a single occurrence of a repeated week by index', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      weeks: [week(2, [{ meals: [meal(LASAGNA, 'Lasagna')] }])],
    };
    // Two expanded rows; pick just the first → count 1, not 2.
    const refs = collectScheduledRefs(plan, { kind: 'weeks', from: 1, to: 1 });
    expect(refs[0]?.count).toBe(1);
  });

  it('filters by real dates for dated plans', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      startDate: '2026-07-13', // Monday
      weeks: [
        week(1, [{ meals: [meal(LASAGNA, 'Lasagna')] }]), // Jul 13
        week(1, [{ meals: [meal(TACOS, 'Tacos')] }]), // Jul 20
      ],
    };
    const refs = collectScheduledRefs(plan, { kind: 'dates', from: '2026-07-20', to: '2026-07-26' });
    expect(refs.map((r) => r.name)).toEqual(['Tacos']);
  });

  it('reports the expanded week count and dated bounds', () => {
    const plan: ShoppingPlan = {
      name: 'P',
      startDate: '2026-07-13',
      weeks: [week(2, [{ meals: [meal(LASAGNA, 'Lasagna')] }]), week(1, [emptyDay()])],
    };
    expect(expandedWeekCount(plan)).toBe(3); // 2 + 1
    expect(planDateBounds(plan)).toEqual({ from: '2026-07-13', to: '2026-08-02' }); // 3 weeks - 1 day
  });

  it('has no dated bounds for an undated plan', () => {
    const plan: ShoppingPlan = { name: 'P', weeks: [week(1, [emptyDay()])] };
    expect(planDateBounds(plan)).toBeNull();
  });
});

describe('resolveShoppingList — resolution with an injected fetcher', () => {
  const plan: ShoppingPlan = {
    name: 'Dinner',
    weeks: [
      week(1, [
        { meals: [meal(LASAGNA, 'Lasagna')] },
        { meals: [meal(TACOS, 'Tacos')] },
      ]),
    ],
  };

  it('resolves each unique recipe and builds both views', async () => {
    const list = await resolveShoppingList(plan, { kind: 'all' }, async (ref) =>
      ref.uri === LASAGNA ? ['2 cups flour'] : ['1 cup flour'],
    );
    expect(list.byRecipe.map((s) => s.name)).toEqual(['Lasagna', 'Tacos']);
    expect(combinedLineText(list.combined.lines.find((l) => l.name === 'flour')!)).toBe('flour — 3 cups');
  });

  it('degrades an unresolvable recipe (null) to a named, flagged entry', async () => {
    const list = await resolveShoppingList(plan, { kind: 'all' }, async (ref) =>
      ref.uri === LASAGNA ? null : ['1 cup flour'],
    );
    const lasagna = list.byRecipe.find((s) => s.name === 'Lasagna');
    expect(lasagna?.unavailable).toBe(true);
    expect(list.combined.unavailable).toContain('Lasagna');
    // Tacos still resolves — one failure never blanks the rest.
    expect(list.combined.lines.find((l) => l.name === 'flour')).toBeDefined();
  });

  it('degrades a throwing fetch the same way (never rejects)', async () => {
    const list = await resolveShoppingList(plan, { kind: 'all' }, async (ref) => {
      if (ref.uri === LASAGNA) throw new Error('network down');
      return ['1 cup flour'];
    });
    expect(list.byRecipe.find((s) => s.name === 'Lasagna')?.unavailable).toBe(true);
    expect(list.combined.lines.find((l) => l.name === 'flour')).toBeDefined();
  });
});

// --- Phase 4: markdown renderers ------------------------------------------

const sampleList = () =>
  buildShoppingList([
    recipe('Lasagna', ['2 cups flour', 'cucumber', '2 cups'], 2),
    recipe('Salad', ['1 cup flour', 'cucumber'], 1),
    recipe('Ghost', undefined),
  ]);

describe('renderCombinedMarkdown', () => {
  it('lists aggregated lines, an as-listed section, and unavailable recipes', () => {
    const md = renderCombinedMarkdown(sampleList());
    expect(md).toContain('## Combined');
    // Lasagna ×2: 2 cups flour → 4 cups; + Salad 1 cup = 5 cups.
    expect(md).toContain('- flour — 5 cups');
    // cucumber: Lasagna ×2 (2) + Salad (1) = ×3.
    expect(md).toContain('- cucumber ×3');
    expect(md).toContain('### As listed');
    expect(md).toContain('2 cups');
    expect(md).toContain('Lasagna');
    expect(md).toContain('### Unavailable');
    expect(md).toContain('Ghost');
  });
});

describe('renderByRecipeMarkdown', () => {
  it('renders one section per recipe with ×N, verbatim lines, and flags', () => {
    const md = renderByRecipeMarkdown(sampleList());
    expect(md).toContain('## By recipe');
    expect(md).toContain('### Lasagna ×2');
    expect(md).toContain('- 2 cups flour');
    // The unparseable "2 cups" line is flagged with the marker.
    expect(md).toMatch(/- 2 cups ⚑/);
    // A single-occurrence recipe carries no ×N.
    expect(md).toContain('### Salad\n');
    // Unavailable recipe degrades to a note, never dropped.
    expect(md).toContain('### Ghost');
    expect(md).toContain('ingredients unavailable');
  });
});

describe('renderShoppingListDocument', () => {
  it('is one document, Combined before By recipe, headed by name + range', () => {
    const md = renderShoppingListDocument(sampleList(), {
      planName: 'Week of Jul 13',
      rangeLabel: 'Jul 13 – Jul 26',
    });
    expect(md).toContain('# Shopping list — Week of Jul 13');
    expect(md).toContain('Jul 13 – Jul 26');
    expect(md.indexOf('## Combined')).toBeLessThan(md.indexOf('## By recipe'));
  });
});

describe('shoppingListFilename', () => {
  it('slugifies the plan name and range into a .md filename', () => {
    expect(shoppingListFilename('Week of Jul 13', 'Jul 13 – Jul 26')).toBe(
      'shopping-week-of-jul-13-jul-13-jul-26.md',
    );
  });

  it('falls back gracefully for an empty name', () => {
    expect(shoppingListFilename('', 'all')).toBe('shopping-plan-all.md');
  });
});

// --- Detail toggle: per-recipe ×N scaling + combined source attribution ----

describe('scaleIngredientLine — multiply a line by its recipe count', () => {
  it('leaves a line unchanged at count 1', () => {
    expect(scaleIngredientLine('2 cups flour', 1)).toBe('2 cups flour');
  });
  it('multiplies the leading quantity, preserving the rest verbatim', () => {
    expect(scaleIngredientLine('2 cups flour', 2)).toBe('4 cups flour');
    expect(scaleIngredientLine('½ cup sugar', 2)).toBe('1 cup sugar');
    expect(scaleIngredientLine('2 large eggs', 3)).toBe('6 large eggs');
  });
  it('pluralizes the unit with the scaled amount', () => {
    expect(scaleIngredientLine('1 cup flour', 2)).toBe('2 cups flour');
  });
  it('scales a range end-to-end', () => {
    expect(scaleIngredientLine('1-2 cups broth', 2)).toBe('2–4 cups broth');
  });
  it('marks a bare (unquantified) line with an occurrence count', () => {
    expect(scaleIngredientLine('cucumber', 3)).toBe('cucumber ×3');
  });
  it('leaves an unparseable line untouched (can’t scale what we can’t read)', () => {
    expect(scaleIngredientLine('2 cups', 2)).toBe('2 cups');
  });
});

describe('combined source attribution', () => {
  it('records which recipes each combined line came from', () => {
    const list = buildShoppingList([
      recipe('Lasagna', ['2 cups flour']),
      recipe('Salad', ['1 cup flour', 'cucumber']),
    ]);
    const flour = combinedFor(list, 'flour');
    expect(flour?.recipes).toEqual(['Lasagna', 'Salad']);
    expect(combinedFor(list, 'cucumber')?.recipes).toEqual(['Salad']);
  });

  it('combinedLineText appends the sources when asked', () => {
    const list = buildShoppingList([recipe('Lasagna', ['2 cups flour']), recipe('Salad', ['1 cup flour'])]);
    const flour = combinedFor(list, 'flour')!;
    expect(combinedLineText(flour)).toBe('flour — 3 cups');
    expect(combinedLineText(flour, { sources: true })).toBe('flour — 3 cups (from Lasagna, Salad)');
  });

  it('renderCombinedMarkdown attributes each line when sources are on', () => {
    const list = buildShoppingList([recipe('Lasagna', ['2 cups flour']), recipe('Salad', ['1 cup flour'])]);
    expect(renderCombinedMarkdown(list, { sources: true })).toContain('flour — 3 cups (from Lasagna, Salad)');
    expect(renderCombinedMarkdown(list)).not.toContain('(from Lasagna');
  });
});

describe('renderByRecipeMarkdown — multiply mode', () => {
  it('scales each recipe’s lines by its ×N when multiply is on', () => {
    const list = buildShoppingList([recipe('Lasagna', ['2 cups flour', 'cucumber'], 2)]);
    const md = renderByRecipeMarkdown(list, { multiply: true });
    expect(md).toContain('- 4 cups flour');
    expect(md).toContain('- cucumber ×2');
    // Default (per batch) is unchanged.
    expect(renderByRecipeMarkdown(list)).toContain('- 2 cups flour');
  });
});

describe('makeStapleMatcher — assumed-on-hand names', () => {
  it('matches on equality and whole-word containment (not substrings)', () => {
    const isStaple = makeStapleMatcher(['salt', 'olive oil']);
    expect(isStaple('salt')).toBe(true);
    expect(isStaple('Sea Salt')).toBe(true); // whole word, case-insensitive
    expect(isStaple('extra virgin olive oil')).toBe(true);
    expect(isStaple('salted butter')).toBe(false); // "salt" is not a whole word here
    expect(isStaple('flour')).toBe(false);
  });
  it('folds plurals like the parser (pinches → pinch, eggs → egg)', () => {
    expect(makeStapleMatcher(['egg'])('2 eggs'.replace(/^\d+\s*/, ''))).toBe(true);
    expect(normalizeIngredientName('Eggs')).toBe('egg');
  });
  it('an empty staple list matches nothing', () => {
    const none = makeStapleMatcher([]);
    expect(none('salt')).toBe(false);
  });
});

describe('applyStaples — flags without dropping', () => {
  it('flags combined, by-recipe, and as-listed lines whose ingredient is a staple', () => {
    const list = buildShoppingList([recipe('Cake', ['2 cups flour', '2 pinches salt', 'salt to taste'])]);
    const flagged = applyStaples(list, ['salt']);
    expect(combinedFor(flagged, 'flour')?.staple).toBeUndefined();
    // "2 pinches salt" → name "salt"; "salt to taste" → name "salt to taste".
    expect(flagged.combined.lines.filter((l) => l.staple === true).map((l) => l.name).sort()).toEqual([
      'salt',
      'salt to taste',
    ]);
    const cake = flagged.byRecipe.find((s) => s.name === 'Cake')!;
    expect(cake.lines.find((l) => l.raw === '2 pinches salt')?.staple).toBe(true);
    expect(cake.lines.find((l) => l.raw === '2 cups flour')?.staple).toBeUndefined();
  });
});

describe('stapleLineKeys — the "double check" seed', () => {
  it('returns every staple line key (combined, as-listed, by-recipe), de-duped', () => {
    const list = applyStaples(
      buildShoppingList([recipe('Cake', ['2 cups flour', '2 pinches salt']), recipe('Soup', ['1 cup flour', '1 pinch salt'])]),
      ['salt'],
    );
    // salt collapses to one shared key across both recipes + the combined line.
    expect(stapleLineKeys(list)).toEqual([rawLineKey('2 pinches salt')]);
    expect(stapleLineKeys(applyStaples(buildShoppingList([recipe('Cake', ['flour'])]), []))).toEqual([]);
  });
});

describe('filterForShopping — the honest payload', () => {
  it('drops checked-off lines; staples ride in via the seeded check set', () => {
    const raw = buildShoppingList([
      recipe('Cake', ['2 cups flour', '2 pinches salt']),
      recipe('Soup', ['1 cup flour', 'cucumber']),
    ]);
    const withStaples = applyStaples(raw, ['salt']);
    // The panel seeds staples as checked; the cook also checks off cucumber.
    const checked = new Set([...stapleLineKeys(withStaples), rawLineKey('cucumber')]);
    const out = filterForShopping(withStaples, (k) => checked.has(k));
    const names = out.combined.lines.map((l) => l.name).sort();
    expect(names).toEqual(['flour']); // salt (seeded) + cucumber (checked) gone
    const cake = out.byRecipe.find((s) => s.name === 'Cake')!;
    expect(cake.lines.map((l) => l.raw)).toEqual(['2 cups flour']);
    const soup = out.byRecipe.find((s) => s.name === 'Soup')!;
    expect(soup.lines.map((l) => l.raw)).toEqual(['1 cup flour']);
  });
  it('an UN-checked staple stays in the payload (double-checked → actually needed)', () => {
    const withStaples = applyStaples(buildShoppingList([recipe('Cake', ['2 pinches salt', '2 cups flour'])]), ['salt']);
    // Nothing checked → salt is still shoppable (the cook un-ticked it).
    const out = filterForShopping(withStaples, () => false);
    expect(out.combined.lines.map((l) => l.name).sort()).toEqual(['flour', 'salt']);
  });
  it('a combined key checked in one view removes it from the other', () => {
    const list = buildShoppingList([recipe('Cake', ['2 cups flour'])]);
    const flour = combinedFor(list, 'flour')!;
    // The combined key and the by-recipe raw key agree by normalized name.
    expect(combinedLineKey(flour)).toBe(rawLineKey('2 cups flour'));
  });
});

describe('renderAiShopperText — terse cart instructions', () => {
  it('lists items with the custom instructions folded in, no recipe framing', () => {
    const list = buildShoppingList([recipe('Cake', ['2 cups flour', 'cucumber'])]);
    const text = renderAiShopperText(list, { instructions: 'prefer versions we have bought before' });
    expect(text).toContain('Add these grocery items to my shopping cart:');
    expect(text).toContain('prefer versions we have bought before');
    expect(text).toContain('- flour — 2 cups');
    expect(text).toContain('- cucumber ×1');
    expect(text).not.toContain('arecipe');
    expect(text).not.toContain('recipe)'); // no "(from …recipe)" attribution
  });
  it('omits the instructions block when none is set, and notes an empty cart', () => {
    const empty = renderAiShopperText(buildShoppingList([]), {});
    expect(empty).toContain('(nothing left to buy)');
    const list = buildShoppingList([recipe('Cake', ['2 cups flour'])]);
    expect(renderAiShopperText(list)).not.toContain('\n\n\n');
  });
});
