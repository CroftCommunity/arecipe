// @vitest-environment happy-dom
// Recipe views (5d split): the list renders LINK CARDS to recipe.html (real
// pages, no in-place expansion); the detail renders the full recipe.
// Trust surface stays: silent when good, loud when bad, on both surfaces.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderRecipeDetail, renderRecipeList } from '../../../src/recipes/view.js';
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

  it('a tampered detail is stamped and warned instead', () => {
    const el = renderRecipeDetail(entry({ verified: false }), { author: 'rdur.dev' });
    expect(el.querySelector('[data-testid=provenance]')).toBeNull();
    expect(el.querySelector('.altered-stamp')?.textContent).toBe('ALTERED?');
    expect(el.querySelector('[data-testid=altered-warning]')).not.toBeNull();
  });
});
