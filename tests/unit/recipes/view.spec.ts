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

  it('marks verified entries verified and unverified entries unverified', () => {
    const el = renderRecipeList([entry(), entry({ uri: 'at://x/y/z', verified: false })]);
    const items = Array.from(el.querySelectorAll('[data-testid=recipe-item]'));
    expect(items[0]?.querySelector('[data-verified]')?.getAttribute('data-verified')).toBe('true');
    expect(items[1]?.querySelector('[data-verified]')?.getAttribute('data-verified')).toBe('false');
  });

  it('clicking the stamp reveals a plain-language explanation (both verdicts)', () => {
    const el = renderRecipeList([entry(), entry({ uri: 'at://x/y/z', verified: false })]);
    const items = Array.from(el.querySelectorAll('[data-testid=recipe-item]'));

    const verifiedStamp = items[0]?.querySelector<HTMLElement>('.stamp');
    verifiedStamp?.click();
    const verifiedNote = items[0]?.querySelector<HTMLElement>('[data-testid=stamp-note]');
    expect(verifiedNote?.hidden).toBe(false);
    expect(verifiedNote?.textContent).toMatch(/hasn.t been altered/i);

    const unverifiedStamp = items[1]?.querySelector<HTMLElement>('.stamp');
    unverifiedStamp?.click();
    const unverifiedNote = items[1]?.querySelector<HTMLElement>('[data-testid=stamp-note]');
    expect(unverifiedNote?.hidden).toBe(false);
    expect(unverifiedNote?.textContent).toMatch(/did not match/i);

    // Second click hides it again.
    verifiedStamp?.click();
    expect(items[0]?.querySelector<HTMLElement>('[data-testid=stamp-note]')?.hidden).toBe(true);
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
