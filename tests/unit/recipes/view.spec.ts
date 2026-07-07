// @vitest-environment happy-dom
// Phase 4b: rendering cached recipes. Behaviors:
// - each cached recipe renders its title
// - a verified entry carries the verified marker; an unverified one carries
//   the unverified marker (both sides — mutation resistance)
// - the detail view renders ingredients and instructions as list items
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderRecipeList } from '../../../src/recipes/view.js';
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

describe('renderRecipeList', () => {
  it('renders each recipe title', () => {
    const el = renderRecipeList([entry()]);
    expect(el.textContent).toContain('White Chocolate Strawberry Sourdough Sweet Bread');
  });

  // Trust surface (design iteration 3): silent when good, loud when bad —
  // the browser-padlock lesson. Intact records carry no badge; a tampered
  // record is stamped ALTERED? and warned, visibly, with no interaction.
  it('an intact record carries no badge — the card is clean', () => {
    const el = renderRecipeList([entry()]);
    expect(el.querySelector('.altered-stamp')).toBeNull();
    expect(el.querySelector('[data-testid=altered-warning]')).toBeNull();
  });

  it('a tampered record is loudly stamped and warned without any interaction', () => {
    const el = renderRecipeList([entry({ uri: 'at://x/y/z', verified: false })]);
    const stamp = el.querySelector<HTMLElement>('.altered-stamp');
    expect(stamp?.textContent).toBe('ALTERED?');
    const warning = el.querySelector<HTMLElement>('[data-testid=altered-warning]');
    expect(warning?.hidden).toBe(false);
    expect(warning?.textContent).toMatch(/doesn.t match what the author published/i);
  });

  it('the detail carries a human provenance line (author · fingerprint matches · date)', () => {
    const el = renderRecipeList([entry()], { author: 'rdur.dev' });
    const provenance = el.querySelector<HTMLElement>('[data-testid=provenance]');
    expect(provenance?.textContent).toContain('as published by rdur.dev');
    expect(provenance?.textContent).toContain('fingerprint matches');
    expect(provenance?.textContent).toMatch(/\b20\d\d\b/); // a year from updatedAt
  });

  it('a tampered record replaces the provenance line with the warning', () => {
    const el = renderRecipeList([entry({ verified: false })], { author: 'rdur.dev' });
    expect(el.querySelector('[data-testid=provenance]')).toBeNull();
    expect(el.querySelector('[data-testid=altered-warning]')).not.toBeNull();
  });

  it('renders ingredients and instructions as list items in the detail', () => {
    const el = renderRecipeList([entry()]);
    const ingredients = el.querySelectorAll('[data-testid=recipe-ingredients] li');
    const instructions = el.querySelectorAll('[data-testid=recipe-instructions] li');
    expect(ingredients.length).toBeGreaterThan(0);
    expect(instructions.length).toBeGreaterThan(0);
    expect(Array.from(ingredients).map((li) => li.textContent)).toContain(
      (fixture.value['ingredients'] as string[])[0],
    );
  });
});
