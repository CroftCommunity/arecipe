// @vitest-environment happy-dom
// Recipe views (5d split): the list renders LINK CARDS to recipe.html (real
// pages, no in-place expansion); the detail renders the full recipe.
// Trust surface stays: silent when good, loud when bad, on both surfaces.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderDishCompare,
  renderFacetDropdown,
  renderFocusView,
  renderFunFacts,
  renderMetaStrip,
  renderRecipeDetail,
  renderRecipeDetailsList,
  renderRecipeList,
  renderVersionBar,
} from '../../../src/recipes/view.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';
import type { RecipeMeta } from '../../../src/recipes/meta.js';

// cwd-relative: happy-dom's URL global is not a node file: URL.
const fixture = JSON.parse(
  readFileSync('tests/fixtures/atproto/getRecord-exchange.recipe.recipe.json', 'utf8'),
) as { uri: string; cid: string; value: Record<string, unknown> };

const entry = (overrides: Partial<CachedRecipe> = {}): CachedRecipe => ({
  uri: fixture.uri,
  cid: fixture.cid,
  value: fixture.value,
  verified: true,
  cachedAt: '2026-07-07T12:00:00Z',
  ...overrides,
});

describe('renderRecipeList (link cards)', () => {
  it('renders each recipe as a link to its own page, carrying uri + author', () => {
    const el = renderRecipeList([entry()], { author: 'rdur.dev' });
    const card = el.querySelector<HTMLAnchorElement>('a[data-testid=recipe-item]');
    expect(card?.textContent).toContain('White Chocolate Strawberry Sourdough Sweet Bread');
    expect(card?.getAttribute('href')).toBe(
      `./recipe.html?u=${encodeURIComponent(fixture.uri)}&by=rdur.dev`,
    );
  });

  it('a failing photo swaps to the placeholder instead of a broken image', () => {
    const el = renderRecipeList([entry()]);
    const photo = el.querySelector<HTMLImageElement>('img.card-photo');
    photo?.dispatchEvent(new Event('error'));
    expect(el.querySelector('img.card-photo')).toBeNull();
    expect(el.querySelector('.card-photo--empty img')).not.toBeNull();
  });

  it('photo-less recipes get the themed no-meal standin (theme pair), not an emoji', () => {
    const bare = { ...fixture.value };
    delete bare['embed'];
    const el = renderRecipeList([entry({ value: bare })]);
    const marks = el.querySelectorAll<HTMLImageElement>('.card-photo--empty img');
    const srcs = [...marks].map((m) => m.getAttribute('src'));
    // A light/dark pair (CSS shows the right one), pointing at the no-meal
    // standin — not the wordmark logo, and never an emoji.
    expect(srcs).toContain('./assets/no-meal-light.png');
    expect(srcs).toContain('./assets/no-meal-dark.png');
    expect(marks[0]?.getAttribute('alt')).toBe('');
  });

  it('mixed-author grids resolve by= per card from authorsByDid (5e)', () => {
    const other = entry({ uri: 'at://did:plc:other123/exchange.recipe.recipe/abc' });
    const el = renderRecipeList([entry(), other], {
      authorsByDid: {
        'did:plc:26tsx5juuss4yealylyfbj4h': 'rdur.dev',
        'did:plc:other123': 'daffl.xyz',
      },
    });
    const hrefs = Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid=recipe-item]')).map(
      (a) => a.getAttribute('href'),
    );
    expect(hrefs[0]).toContain('by=rdur.dev');
    expect(hrefs[1]).toContain('by=daffl.xyz');
  });

  it('an intact card is clean; a tampered card is stamped and warned', () => {
    const el = renderRecipeList([entry(), entry({ uri: 'at://x/y/z', verified: false })]);
    const cards = Array.from(el.querySelectorAll('[data-testid=recipe-item]'));
    expect(cards[0]?.querySelector('.altered-stamp')).toBeNull();
    expect(cards[1]?.querySelector('.altered-stamp')?.textContent).toBe('ALTERED?');
    expect(cards[1]?.querySelector('[data-testid=altered-warning]')).not.toBeNull();
  });
});

describe('renderRecipeDetailsList (Details view rows)', () => {
  it('renders one linked row per recipe with name, description, and correct href', () => {
    const withText = entry({ value: { ...fixture.value, text: 'A short blurb.' } });
    const el = renderRecipeDetailsList([withText], { author: 'rdur.dev' });
    const rows = el.querySelectorAll<HTMLAnchorElement>('a.recipe-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('href')).toBe(
      `./recipe.html?u=${encodeURIComponent(fixture.uri)}&by=rdur.dev`,
    );
    expect(rows[0]?.textContent).toContain('White Chocolate Strawberry Sourdough Sweet Bread');
    expect(rows[0]?.textContent).toContain('A short blurb.');
  });

  it('an image-less recipe falls back to the brand placeholder', () => {
    const bare = { ...fixture.value };
    delete bare['embed'];
    const el = renderRecipeDetailsList([entry({ value: bare })]);
    expect(el.querySelector('.card-photo--empty img')).not.toBeNull();
  });

  it('renders label chips from the recipe facets (cuisine, category, diet)', () => {
    const value = {
      ...fixture.value,
      recipeCuisine: 'greek',
      recipeCategory: 'dinner',
      suitableForDiet: ['exchange.recipe.defs#dietVegetarian'],
    };
    const el = renderRecipeDetailsList([entry({ value })]);
    const chipText = Array.from(el.querySelectorAll('.recipe-row .chip')).map((c) => c.textContent);
    expect(chipText).toContain('greek');
    expect(chipText).toContain('dinner');
    expect(chipText).toContain('Vegetarian');
  });

  it('does not nest anchors inside the row link (the row itself is the link)', () => {
    const el = renderRecipeDetailsList([entry()]);
    const row = el.querySelector('a.recipe-row');
    expect(row?.querySelector('a')).toBeNull();
  });

  it('a tampered row is stamped ALTERED like a card', () => {
    const el = renderRecipeDetailsList([entry({ uri: 'at://x/y/z', verified: false })]);
    expect(el.querySelector('.recipe-row .altered-stamp')?.textContent).toBe('ALTERED?');
  });

  it('renders a row per entry for multiple entries', () => {
    const el = renderRecipeDetailsList([
      entry(),
      entry({ uri: 'at://did:plc:o/exchange.recipe.recipe/2' }),
    ]);
    expect(el.querySelectorAll('a.recipe-row')).toHaveLength(2);
  });
});

describe('renderFocusView', () => {
  const base = { name: 'No Pic', ingredients: ['x'], instructions: ['y'] };
  const withImage = { ...base, embed: { images: [{ image: { ref: { $link: 'bafypic' } } }] } };

  it('marks the photo area empty (small placeholder) when the recipe has no image', () => {
    const view = renderFocusView(entry({ value: base }), { onExit: () => undefined });
    expect(view.querySelector('.focus-photo-empty')).not.toBeNull();
  });

  it('does not mark it empty when there is an image (full banner)', () => {
    const view = renderFocusView(entry({ value: withImage }), { onExit: () => undefined });
    expect(view.querySelector('.focus-photo-empty')).toBeNull();
  });
});

describe('renderFacetDropdown', () => {
  it('renders one checkbox option per available value, in a details with the dimension label', () => {
    const dd = renderFacetDropdown({
      dimension: 'category',
      label: 'Meal',
      available: ['breakfast', 'dinner', 'lunch'],
      selected: [],
    });
    expect(dd?.tagName.toLowerCase()).toBe('details');
    expect(dd?.querySelector('summary')?.textContent).toContain('Meal');
    const boxes = dd?.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes).toHaveLength(3);
    const values = Array.from(boxes ?? []).map((b) => b.dataset['value']);
    expect(values).toEqual(['breakfast', 'dinner', 'lunch']);
  });

  it('marks selected values as checked and carries data-dimension/data-value', () => {
    const dd = renderFacetDropdown({
      dimension: 'cuisine',
      label: 'Cuisine',
      available: ['greek', 'italian'],
      selected: ['greek'],
    });
    const greek = dd?.querySelector<HTMLInputElement>('input[data-value=greek]');
    const italian = dd?.querySelector<HTMLInputElement>('input[data-value=italian]');
    expect(greek?.checked).toBe(true);
    expect(italian?.checked).toBe(false);
    expect(greek?.dataset['dimension']).toBe('cuisine');
  });

  it('shares name="browse-facet" so only one dropdown opens at a time (exclusive accordion)', () => {
    const dd = renderFacetDropdown({
      dimension: 'category',
      label: 'Meal',
      available: ['dinner'],
      selected: [],
    });
    expect(dd?.getAttribute('name')).toBe('browse-facet');
  });

  it('omits the dropdown entirely when there are no available values', () => {
    const dd = renderFacetDropdown({ dimension: 'cuisine', label: 'Cuisine', available: [], selected: [] });
    expect(dd).toBeNull();
  });

  it('shows a count badge on the summary when selections are active', () => {
    const dd = renderFacetDropdown({
      dimension: 'cuisine',
      label: 'Cuisine',
      available: ['greek', 'italian', 'thai'],
      selected: ['greek', 'thai'],
    });
    const badge = dd?.querySelector('.facet-count');
    expect(badge?.textContent).toBe('2');
  });

  it('shows no badge when nothing is selected (or nothing selected is available)', () => {
    const none = renderFacetDropdown({
      dimension: 'cuisine',
      label: 'Cuisine',
      available: ['greek'],
      selected: [],
    });
    expect(none?.querySelector('.facet-count')).toBeNull();
    // A stale selection not present in `available` is inert → no badge.
    const stale = renderFacetDropdown({
      dimension: 'cuisine',
      label: 'Cuisine',
      available: ['greek'],
      selected: ['thai'],
    });
    expect(stale?.querySelector('.facet-count')).toBeNull();
  });
});

describe('renderRecipeDetail', () => {
  it('renders title, ingredients-first columns, and numbered instructions', () => {
    const el = renderRecipeDetail(entry(), { author: 'rdur.dev' });
    expect(el.querySelector('h2')?.textContent).toBe(
      'White Chocolate Strawberry Sourdough Sweet Bread',
    );
    const ingredients = el.querySelectorAll('[data-testid=recipe-ingredients] li');
    const instructions = el.querySelectorAll('[data-testid=recipe-instructions] li');
    expect(ingredients.length).toBeGreaterThan(0);
    expect(instructions.length).toBeGreaterThan(0);
    expect(Array.from(ingredients).map((li) => li.textContent)).toContain(
      (fixture.value['ingredients'] as string[])[0],
    );
  });

  it('an intact detail ends with the human provenance line', () => {
    const el = renderRecipeDetail(entry(), { author: 'rdur.dev' });
    const provenance = el.querySelector('[data-testid=provenance]');
    expect(provenance?.textContent).toContain('as published by rdur.dev');
    expect(provenance?.textContent).toContain('fingerprint matches');
  });

  it('offers an icon-only quick-copy control by Ingredients and Instructions carrying each section text', () => {
    const el = renderRecipeDetail(entry(), { author: 'rdur.dev' });
    const ingCopy = el.querySelector('[data-testid=copy-ingredients]');
    const insCopy = el.querySelector('[data-testid=copy-instructions]');
    expect(ingCopy).not.toBeNull();
    expect(insCopy).not.toBeNull();
    // Icon-only (the ⧉ copy glyph, not the words), with an accessible name.
    expect(ingCopy?.textContent).not.toContain('quick copy');
    expect(ingCopy?.getAttribute('aria-label')).toBe('Copy to clipboard');
    expect(ingCopy?.getAttribute('data-copy')).toBe(
      (fixture.value['ingredients'] as string[]).join('\n'),
    );
    expect(insCopy?.getAttribute('data-copy')).toBe(
      (fixture.value['instructions'] as string[]).join('\n'),
    );
  });

  it('gathers the provenance line and a control slot into a bottom footer', () => {
    const el = renderRecipeDetail(entry(), { author: 'rdur.dev' });
    const footer = el.querySelector('.detail-footer');
    expect(footer).not.toBeNull();
    // Provenance moved into the footer (left); the Hide control slot sits at the
    // right of the same row (the recipe page injects the control into it).
    expect(footer?.querySelector('[data-testid=provenance]')).not.toBeNull();
    expect(footer?.querySelector('.detail-footer-control-slot')).not.toBeNull();
  });

  it('always renders the footer control slot, even when unverified (Hide still needs a home)', () => {
    const el = renderRecipeDetail(entry({ verified: false }), { author: 'rdur.dev' });
    const footer = el.querySelector('.detail-footer');
    expect(footer?.querySelector('.detail-footer-control-slot')).not.toBeNull();
    expect(footer?.querySelector('[data-testid=provenance]')).toBeNull();
  });

  it('renders off-network credit when the recipe is attributed (website)', () => {
    const attributed = entry({
      value: {
        ...fixture.value,
        attribution: {
          $type: 'exchange.recipe.defs#attributionWebsite',
          name: 'Erin Lives Whole (Erin Antoniak)',
          url: 'https://www.erinliveswhole.com/greek-cucumber-tomato-feta-salad/',
          notes: 'Ingredients and method adapted from the source; description rewritten.',
        },
      },
    });
    const el = renderRecipeDetail(attributed, { author: 'arecipe.bsky.social' });
    const credit = el.querySelector<HTMLElement>('[data-testid=attribution]');
    expect(credit?.textContent).toContain('Erin Lives Whole (Erin Antoniak)');
    expect(credit?.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.erinliveswhole.com/greek-cucumber-tomato-feta-salad/',
    );
  });

  it('renders name-only credit for non-URL attribution (person)', () => {
    const attributed = entry({
      value: {
        ...fixture.value,
        attribution: { $type: 'exchange.recipe.defs#attributionPerson', name: 'Grandma Ruth' },
      },
    });
    const el = renderRecipeDetail(attributed);
    const credit = el.querySelector<HTMLElement>('[data-testid=attribution]');
    expect(credit?.textContent).toContain('Grandma Ruth');
    expect(credit?.querySelector('a')).toBeNull();
  });

  it('shows no credit line when the recipe is unattributed or original', () => {
    // The wild fixture itself carries an attribution — strip it for this case.
    const bare = { ...fixture.value };
    delete bare['attribution'];
    expect(
      renderRecipeDetail(entry({ value: bare })).querySelector('[data-testid=attribution]'),
    ).toBeNull();
    const original = entry({
      value: { ...bare, attribution: { $type: 'exchange.recipe.defs#attributionOriginal' } },
    });
    expect(renderRecipeDetail(original).querySelector('[data-testid=attribution]')).toBeNull();
  });

  it('a tampered detail is stamped and warned instead', () => {
    const el = renderRecipeDetail(entry({ verified: false }), { author: 'rdur.dev' });
    expect(el.querySelector('[data-testid=provenance]')).toBeNull();
    expect(el.querySelector('.altered-stamp')?.textContent).toBe('ALTERED?');
    expect(el.querySelector('[data-testid=altered-warning]')).not.toBeNull();
  });

  it('surfaces the fun-fact cycler when the record carries funFacts', () => {
    const withFacts = entry({
      value: { ...fixture.value, funFacts: [{ text: 'Sourdough predates leavened bread.' }, { text: 'Two.' }] },
    });
    const el = renderRecipeDetail(withFacts, { author: 'rdur.dev' });
    const facts = el.querySelector('[data-testid=fun-facts]');
    expect(facts).not.toBeNull();
    expect(facts?.querySelector('[data-testid=fun-fact-text]')?.textContent).toBe(
      'Sourdough predates leavened bread.',
    );
    expect(facts?.querySelector('[data-testid=fun-fact-next]')).not.toBeNull();
  });

  it('omits the fun-fact section when the record has no facts', () => {
    const bare = { ...fixture.value };
    delete bare['funFacts'];
    delete bare['funFact'];
    expect(renderRecipeDetail(entry({ value: bare })).querySelector('[data-testid=fun-facts]')).toBeNull();
  });

  it('hides the fun-fact section when showFunFacts is false (Settings opt-out)', () => {
    const withFacts = entry({ value: { ...fixture.value, funFacts: [{ text: 'A fact.' }] } });
    expect(renderRecipeDetail(withFacts, { showFunFacts: true }).querySelector('[data-testid=fun-facts]')).not.toBeNull();
    expect(renderRecipeDetail(withFacts, { showFunFacts: false }).querySelector('[data-testid=fun-facts]')).toBeNull();
  });

  it('renders a ⛶ Focus button only when onFocus is given, and click invokes it', () => {
    expect(renderRecipeDetail(entry()).querySelector('[data-testid=focus-btn]')).toBeNull();
    let opened = 0;
    const el = renderRecipeDetail(entry(), { onFocus: () => (opened += 1) });
    el.querySelector<HTMLButtonElement>('[data-testid=focus-btn]')?.click();
    expect(opened).toBe(1);
  });

  it('rides the Reference quick link beside Focus in the actions row', () => {
    const el = renderRecipeDetail(entry(), { onFocus: () => undefined });
    const link = el.querySelector('.detail-actions [data-testid=reference-link]');
    expect(link?.getAttribute('href')).toBe('./reference.html');
    // No Focus (list contexts) → no actions row, so no reference link either.
    expect(renderRecipeDetail(entry()).querySelector('[data-testid=reference-link]')).toBeNull();
  });
});

describe('renderFocusView (cook mode)', () => {
  it('renders title, ingredients, instructions, and an exit that calls onExit', () => {
    let exited = 0;
    const el = renderFocusView(entry(), { onExit: () => (exited += 1) });
    expect(el.getAttribute('data-testid')).toBe('focus-view');
    expect(el.querySelector('[data-testid=focus-ingredients] li')).not.toBeNull();
    expect(el.querySelector('[data-testid=focus-instructions] li')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid=focus-exit]')?.click();
    expect(exited).toBe(1);
  });
});

describe('image credit (Commons attribution)', () => {
  const withCredit = () =>
    entry({
      value: {
        ...fixture.value,
        embed: {
          images: [
            {
              image: { $type: 'blob', ref: { $link: 'bafkcredit' }, mimeType: 'image/jpeg' },
              alt: 'Pico de Gallo',
              credit: {
                artist: 'jeffreyw',
                license: 'CC BY 2.0',
                source: 'https://commons.wikimedia.org/wiki/File:Pico.jpg',
              },
            },
          ],
        },
      },
    });

  it('a card overlays the image credit (text-only) at the bottom of the photo', () => {
    const el = renderRecipeList([withCredit()]);
    const credit = el.querySelector<HTMLElement>('.photo-wrap [data-testid=card-credit]');
    expect(credit?.textContent).toContain('CC BY 2.0');
    expect(credit?.textContent).toContain('jeffreyw');
    // the card is itself an anchor — the credit must not nest another link
    expect(credit?.querySelector('a')).toBeNull();
  });

  it('a card without an embedded image has no credit line', () => {
    const bare = { ...fixture.value };
    delete bare['embed'];
    expect(renderRecipeList([entry({ value: bare })]).querySelector('[data-testid=card-credit]')).toBeNull();
  });

  it('the detail banner overlays an image credit linking to the Commons source', () => {
    const el = renderRecipeDetail(withCredit(), { author: 'arecipe.bsky.social' });
    const credit = el.querySelector<HTMLElement>('[data-testid=photo-credit]');
    expect(credit?.textContent).toContain('CC BY 2.0');
    expect(credit?.textContent).toContain('jeffreyw');
    expect(credit?.querySelector('a')?.getAttribute('href')).toBe(
      'https://commons.wikimedia.org/wiki/File:Pico.jpg',
    );
  });
});

describe('renderVersionBar (inline flip control)', () => {
  it('shows "index of total" and a View All link, and calls onNav on prev/next', () => {
    const calls: number[] = [];
    const bar = renderVersionBar({ index: 0, total: 3, viewAllHref: './dish.html?key=banana-bread', onNav: (d) => calls.push(d) });
    expect(bar.querySelector('[data-testid=version-count]')?.textContent).toBe('1 of 3');
    expect(bar.querySelector<HTMLAnchorElement>('[data-testid=view-all]')?.getAttribute('href')).toBe(
      './dish.html?key=banana-bread',
    );
    bar.querySelector<HTMLButtonElement>('[data-testid=version-next]')?.click();
    bar.querySelector<HTMLButtonElement>('[data-testid=version-prev]')?.click();
    expect(calls).toEqual([1, -1]);
  });
});

describe('renderDishCompare (View All grid)', () => {
  const ver = (rkey: string, name: string, extra: Record<string, unknown> = {}): CachedRecipe =>
    entry({ uri: `at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/${rkey}`, value: { ...fixture.value, name, ...extra } });

  it('renders a header with the dish name and version count, and one card per version', () => {
    const el = renderDishCompare(
      [ver('1', 'My Favorite Banana Bread', { versionLabel: 'My Favorite' }), ver('2', 'Classic Banana Bread', { versionLabel: 'Classic' })],
      { dishName: 'Banana Bread', author: 'arecipe.bsky.social' },
    );
    expect(el.querySelector('[data-testid=dish-title]')?.textContent).toBe('Banana Bread');
    expect(el.querySelector('[data-testid=dish-count]')?.textContent).toContain('2');
    const cards = el.querySelectorAll('[data-testid=version-card]');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute('href')).toContain('recipe.html?u=');
    expect(cards[0]?.textContent).toContain('My Favorite');
  });

  it('pools fun facts across versions, deduped', () => {
    const el = renderDishCompare(
      [ver('1', 'A', { funFacts: [{ text: 'shared' }, { text: 'from A' }] }), ver('2', 'B', { funFacts: [{ text: 'shared' }, { text: 'from B' }] })],
      { dishName: 'Dish' },
    );
    const facts = el.querySelector('[data-testid=fun-facts]');
    expect(facts).not.toBeNull();
    // 3 unique facts (shared deduped) → the cycler shows a count of 3
    expect(el.querySelector('[data-testid=fun-fact-count]')?.textContent).toBe('1 / 3');
  });
});

describe('renderFunFacts (Did you know? cycler)', () => {
  it('returns null when there are no facts (omitted, not an empty box)', () => {
    expect(renderFunFacts([])).toBeNull();
  });

  it('renders a single fact with no next control', () => {
    const el = renderFunFacts([{ text: 'Banana bread boomed in the 1930s.' }]);
    expect(el?.querySelector('[data-testid=fun-fact-text]')?.textContent).toBe(
      'Banana bread boomed in the 1930s.',
    );
    expect(el?.querySelector('[data-testid=fun-fact-next]')).toBeNull();
  });

  it('shows a source when present and omits it when absent', () => {
    const withSrc = renderFunFacts([{ text: 'A fact.', source: 'Larousse' }]);
    expect(withSrc?.querySelector('[data-testid=fun-fact-source]')?.textContent).toContain('Larousse');
    const noSrc = renderFunFacts([{ text: 'A fact.' }]);
    expect(noSrc?.querySelector('[data-testid=fun-fact-source]')).toBeNull();
  });

  it('cycles through multiple facts on next, wrapping past the last', () => {
    const el = renderFunFacts([{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
    const textOf = () => el?.querySelector('[data-testid=fun-fact-text]')?.textContent;
    const countOf = () => el?.querySelector('[data-testid=fun-fact-count]')?.textContent;
    const next = el?.querySelector<HTMLButtonElement>('[data-testid=fun-fact-next]');
    expect(textOf()).toBe('one');
    expect(countOf()).toBe('1 / 3');
    next?.click();
    expect(textOf()).toBe('two');
    expect(countOf()).toBe('2 / 3');
    next?.click();
    expect(textOf()).toBe('three');
    next?.click(); // wrap
    expect(textOf()).toBe('one');
    expect(countOf()).toBe('1 / 3');
  });
});

// RUN-RECIPE-META-STRIP D2 — the three-row meta strip under the recipe image.
describe('renderMetaStrip', () => {
  const SERVES: RecipeMeta = { serves: { display: '4', hint: { min: 4 } } };
  const TIME: RecipeMeta = { time: { display: '30 minutes', hintMinutes: 30 } };
  const DIFF: RecipeMeta = { difficulty: { value: 3, label: 'Average' } };
  const ALL: RecipeMeta = { ...SERVES, ...TIME, ...DIFF };

  const rowLabels = (el: HTMLElement | null): string[] =>
    [...(el?.querySelectorAll('.meta-row dt') ?? [])].map((dt) => dt.textContent ?? '');

  it('returns null when all three fields are absent (no empty container)', () => {
    expect(renderMetaStrip({})).toBeNull();
  });

  // The 8th combination (all absent) is the null case above; the other 7 render.
  const present = [
    { name: 'serves only', meta: SERVES, rows: ['Serves'] },
    { name: 'time only', meta: TIME, rows: ['Time'] },
    { name: 'difficulty only', meta: DIFF, rows: ['Difficulty'] },
    { name: 'serves + time', meta: { ...SERVES, ...TIME }, rows: ['Serves', 'Time'] },
    { name: 'serves + difficulty', meta: { ...SERVES, ...DIFF }, rows: ['Serves', 'Difficulty'] },
    { name: 'time + difficulty', meta: { ...TIME, ...DIFF }, rows: ['Time', 'Difficulty'] },
    { name: 'all three', meta: ALL, rows: ['Serves', 'Time', 'Difficulty'] },
  ] as const;

  for (const { name, meta, rows } of present) {
    it(`renders the right rows for ${name}, in stable order`, () => {
      const el = renderMetaStrip(meta);
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe('DL');
      expect(el?.classList.contains('meta-strip')).toBe(true);
      // Order is always serves → time → difficulty regardless of which subset.
      expect(rowLabels(el)).toEqual(rows);
    });
  }

  it('emits a <dl> of .meta-row > <dt>/<dd>; values carry the display text', () => {
    const el = renderMetaStrip(ALL)!;
    const dds = [...el.querySelectorAll('.meta-row dd')].map((dd) => dd.textContent);
    expect(dds[0]).toBe('4');
    expect(dds[1]).toBe('30 minutes');
    expect(dds[2]).toBe('Average'); // dots are empty spans → dd text is the label alone
  });

  it('difficulty dots are decoration (aria-hidden); the label is the accessible value', () => {
    const el = renderMetaStrip(DIFF)!;
    const dots = el.querySelector('.dots');
    expect(dots?.getAttribute('aria-hidden')).toBe('true');
    // Value 3 → 3 filled + 2 empty = 5 dots total, on-count matches the value.
    expect(dots?.querySelectorAll('.dot').length).toBe(5);
    expect(dots?.querySelectorAll('.dot--on').length).toBe(3);
    expect(dots?.querySelectorAll('.dot--off').length).toBe(2);
    // The accessible name of the difficulty row is the label text, not the dots.
    const dd = el.querySelector('.meta-row dd');
    expect(dd?.textContent).toBe('Average');
    expect(dd?.querySelector('.difficulty-label')?.textContent).toBe('Average');
  });

  it('O2 — the focus flag suppresses difficulty (keeps serves + time)', () => {
    expect(rowLabels(renderMetaStrip(ALL, { focus: true }))).toEqual(['Serves', 'Time']);
    // …and without the flag difficulty stays (the flag is tested in both positions).
    expect(rowLabels(renderMetaStrip(ALL, { focus: false }))).toEqual(['Serves', 'Time', 'Difficulty']);
  });

  it('O2 — a difficulty-only strip returns null under the focus flag', () => {
    expect(renderMetaStrip(DIFF, { focus: true })).toBeNull();
  });

  it('the standalone flag (no-image) marks the strip so CSS can round all corners', () => {
    expect(renderMetaStrip(ALL, { standalone: true })?.classList.contains('meta-strip--standalone')).toBe(true);
    expect(renderMetaStrip(ALL)?.classList.contains('meta-strip--standalone')).toBe(false);
  });

  it('snapshot: the generated markup for each presence combination is stable', () => {
    const markup = present.map(({ name, meta }) => `— ${name} —\n${renderMetaStrip(meta)?.outerHTML ?? 'null'}`);
    expect(markup.join('\n\n')).toMatchSnapshot();
  });
});

// ---- RUN-EMPTY-TILE-CHIP: pictureless tiles become an inline chip at
// single-column widths (no media band), keeping the media zone at multi-column.
describe('renderRecipeList — pictureless tile chip variant (single column)', () => {
  const bareEntry = (name?: string): CachedRecipe => {
    const value: Record<string, unknown> = { ...fixture.value };
    delete value['embed'];
    if (name !== undefined) value['name'] = name;
    return entry({ value });
  };

  it('chip variant emits no media-band element', () => {
    const card = renderRecipeList([bareEntry()], { columns: 1 }).querySelector('a.card')!;
    expect(card.querySelector('.photo-wrap')).toBeNull();
    expect(card.querySelector('.card-photo')).toBeNull();
    expect(card.querySelector('.card-photo--empty')).toBeNull();
  });

  it('chip variant emits exactly one glyph, from the shared placeholder mark', () => {
    const card = renderRecipeList([bareEntry()], { columns: 1 }).querySelector('a.card')!;
    const chip = card.querySelectorAll('.tile-chip');
    expect(chip).toHaveLength(1);
    // Same source as the band placeholder (shared helper, not a pasted copy):
    // the themed light/dark pair pointing at the no-meal standin.
    const srcs = [...chip[0]!.querySelectorAll('img.placeholder-mark')].map((m) => m.getAttribute('src'));
    expect(srcs).toContain('./assets/no-meal-light.png');
    expect(srcs).toContain('./assets/no-meal-dark.png');
  });

  it('the chip is decorative: aria-hidden and no contribution to the accessible name', () => {
    const card = renderRecipeList([bareEntry('Greek Salad')], { columns: 1 }).querySelector('a.card')!;
    const chip = card.querySelector('.tile-chip')!;
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    // Every image inside the chip is decorative (empty alt).
    for (const img of chip.querySelectorAll('img')) expect(img.getAttribute('alt')).toBe('');
    // The link's accessible name is exactly the title text.
    expect(card.textContent?.trim()).toBe('Greek Salad');
  });

  it('the accessible name equals the full title, including a title long enough to clamp', () => {
    const long = 'Mulled Wine Spice (Gluehweingewuerz)';
    const card = renderRecipeList([bareEntry(long)], { columns: 1 }).querySelector('a.card')!;
    expect(card.querySelector('.card-title')?.textContent).toBe(long);
    expect(card.textContent).toContain(long);
  });

  it('multi-column keeps the media band (no chip)', () => {
    const card = renderRecipeList([bareEntry()], { columns: 2 }).querySelector('a.card')!;
    expect(card.querySelector('.tile-chip')).toBeNull();
    expect(card.querySelector('.card-photo--empty')).not.toBeNull();
  });
});

describe('renderRecipeList — title clamp retains full text (Phase 1.3)', () => {
  it('a pathologically long title renders its complete text in the DOM', () => {
    const value: Record<string, unknown> = { ...fixture.value };
    delete value['embed'];
    const long = 'Mulled Wine Spice (Gluehweingewuerz)';
    const longer = `${long} — ${long}`; // roughly twice as long
    value['name'] = longer;
    const card = renderRecipeList([entry({ value })], { columns: 1 }).querySelector('a.card')!;
    // The clamp is visual only (-webkit-line-clamp); the full text stays present.
    expect(card.querySelector('.card-title')?.textContent).toBe(longer);
  });
});

describe('renderRecipeList — photo tiles are unchanged (Phase 1.2 byte-identical)', () => {
  // Captured from the pre-change renderer output. Photo tiles at every width, and
  // the multi-column empty band, must stay byte-for-byte what they are today.
  const PHOTO_HTML =
    '<a class="card" data-testid="recipe-item" href="./recipe.html?u=at%3A%2F%2Fdid%3Aplc%3A26tsx5juuss4yealylyfbj4h%2Fexchange.recipe.recipe%2F01JQJ5RW51ZVEW72XN6GSRWC8D"><div class="photo-wrap"><img class="card-photo" src="https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:26tsx5juuss4yealylyfbj4h/bafkreidtrbx6wbmsf6wlh73jyjsmhzdltngje2bleot5brgqkygnluyxcq@jpeg" alt="" loading="lazy"></div><span class="card-title">White Chocolate Strawberry Sourdough Sweet Bread</span></a>';
  const EMPTY_BAND_HTML =
    '<a class="card" data-testid="recipe-item" href="./recipe.html?u=at%3A%2F%2Fdid%3Aplc%3A26tsx5juuss4yealylyfbj4h%2Fexchange.recipe.recipe%2F01JQJ5RW51ZVEW72XN6GSRWC8D"><div class="photo-wrap"><div class="card-photo card-photo--empty"><img class="placeholder-mark logo--light" src="./assets/no-meal-light.png" alt=""><img class="placeholder-mark logo--dark" src="./assets/no-meal-dark.png" alt=""></div></div><span class="card-title">White Chocolate Strawberry Sourdough Sweet Bread</span></a>';

  it('a photo tile is byte-identical at single column', () => {
    const card = renderRecipeList([entry()], { columns: 1 }).querySelector('a.card')!;
    expect(card.outerHTML).toBe(PHOTO_HTML);
  });

  it('a photo tile is byte-identical at multi column', () => {
    const card = renderRecipeList([entry()], { columns: 3 }).querySelector('a.card')!;
    expect(card.outerHTML).toBe(PHOTO_HTML);
  });

  it('the multi-column empty band is byte-identical', () => {
    const bare: Record<string, unknown> = { ...fixture.value };
    delete bare['embed'];
    const card = renderRecipeList([entry({ value: bare })], { columns: 2 }).querySelector('a.card')!;
    expect(card.outerHTML).toBe(EMPTY_BAND_HTML);
  });
});

describe('renderRecipeList — mixed feed regression guard (Phase 1.4)', () => {
  it('renders the same number of tiles in the same order, photo and pictureless mixed', () => {
    const withImg = entry({ uri: 'at://did:plc:aaa/exchange.recipe.recipe/1' });
    const bareValue: Record<string, unknown> = { ...fixture.value, name: 'No Photo Dish' };
    delete bareValue['embed'];
    const bare = entry({ uri: 'at://did:plc:bbb/exchange.recipe.recipe/2', value: bareValue });
    const withImg2 = entry({ uri: 'at://did:plc:ccc/exchange.recipe.recipe/3' });
    const el = renderRecipeList([withImg, bare, withImg2], { columns: 1 });
    const cards = el.querySelectorAll('[data-testid=recipe-item]');
    expect(cards).toHaveLength(3);
    // Order preserved: the pictureless one is the middle tile and is a chip.
    expect(cards[0]?.querySelector('.card-photo')).not.toBeNull();
    expect(cards[1]?.querySelector('.tile-chip')).not.toBeNull();
    expect(cards[2]?.querySelector('.card-photo')).not.toBeNull();
  });
});
