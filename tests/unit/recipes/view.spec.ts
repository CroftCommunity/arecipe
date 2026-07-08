// @vitest-environment happy-dom
// Recipe views (5d split): the list renders LINK CARDS to recipe.html (real
// pages, no in-place expansion); the detail renders the full recipe.
// Trust surface stays: silent when good, loud when bad, on both surfaces.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderRecipeDetail,
  renderRecipeDetailsList,
  renderRecipeList,
} from '../../../src/recipes/view.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

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

  it('photo-less recipes get the brand-mark placeholder, not an emoji', () => {
    const bare = { ...fixture.value };
    delete bare['embed'];
    const el = renderRecipeList([entry({ value: bare })]);
    const placeholder = el.querySelector<HTMLImageElement>('.card-photo--empty img');
    expect(placeholder?.getAttribute('src')).toContain('logo-');
    expect(placeholder?.getAttribute('alt')).toBe('');
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
