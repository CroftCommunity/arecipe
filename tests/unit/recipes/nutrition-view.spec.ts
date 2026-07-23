// @vitest-environment happy-dom
// D15 Phase 6B — the recipe detail renders a Nutrition section when the record
// carries nutrition, and nothing when it doesn't (hidden, not empty). Calories
// in kcal, macros in grams.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderNutrition, renderRecipeDetail } from '../../../src/recipes/view.js';
import type { CachedRecipe } from '../../../src/recipes/cache.js';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/atproto/getRecord-exchange.recipe.recipe.json', 'utf8'),
) as { uri: string; cid: string; value: Record<string, unknown> };

const entry = (value: Record<string, unknown>): CachedRecipe => ({
  uri: fixture.uri,
  cid: fixture.cid,
  value,
  verified: true,
  cachedAt: '2026-07-07T12:00:00Z',
});

describe('renderNutrition', () => {
  it('renders calories in kcal and macros in grams', () => {
    const section = renderNutrition({ nutrition: { calories: 250, fatContent: 12, proteinContent: 8, carbohydrateContent: 40 } });
    expect(section).not.toBeNull();
    const text = section!.textContent ?? '';
    expect(text).toContain('Nutrition');
    expect(text).toContain('250 kcal');
    expect(text).toContain('12 g');
  });

  it('returns null when there is no nutrition (section hidden, not empty)', () => {
    expect(renderNutrition({})).toBeNull();
    expect(renderNutrition({ nutrition: {} })).toBeNull();
  });
});

describe('renderRecipeDetail wiring', () => {
  it('includes the nutrition section when the record carries nutrition', () => {
    const detail = renderRecipeDetail(entry({ ...fixture.value, nutrition: { calories: 250 } }));
    const section = detail.querySelector('[data-testid=nutrition]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('250 kcal');
  });

  it('omits the nutrition section when the record has none', () => {
    const { nutrition, ...noNutrition } = fixture.value as Record<string, unknown>;
    void nutrition;
    const detail = renderRecipeDetail(entry(noNutrition));
    expect(detail.querySelector('[data-testid=nutrition]')).toBeNull();
  });
});
