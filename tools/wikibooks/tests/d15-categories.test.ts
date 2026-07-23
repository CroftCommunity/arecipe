// D15 Phase 1 — capture [[Category:…]] links on the IR before they are stripped
// from prose. These are the enabling signal for diet / category / keyword
// crosswalks (RUN-WIKIBOOKS-ENRICH). Pure and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCategories } from '../src/transform/wikitext.ts';
import { transform } from '../src/transform/transform.ts';

test('extractCategories pulls category names, strips the sortkey, is case-insensitive on the prefix', () => {
  const wt = [
    'Some prose.',
    '[[Category:Vegetarian recipes]]',
    '[[Category:Naturally gluten-free recipes]]',
    '[[category:Halal recipes|Halal]]', // lowercase prefix + sortkey
    '[[Category:Vegetarian recipes]]', // duplicate → collapsed
  ].join('\n');
  assert.deepEqual(extractCategories(wt), [
    'Vegetarian recipes',
    'Naturally gluten-free recipes',
    'Halal recipes',
  ]);
});

test('no category links → empty array', () => {
  assert.deepEqual(extractCategories('Just prose, [[Cookbook:Onion|onions]], no categories.'), []);
});

test('transform surfaces categories on the IR', () => {
  const ir = transform(
    '{{Recipe summary|category=Stews}}\nAn Ethiopian cabbage and potato stew.\n' +
      '== Ingredients ==\n* [[Cookbook:Cabbage|cabbage]]\n== Procedure ==\n# Simmer.\n' +
      '[[Category:Vegan recipes]]\n[[Category:Ethiopian recipes]]',
    'Cookbook:Atkilt Wat',
  );
  assert.deepEqual(ir.categories, ['Vegan recipes', 'Ethiopian recipes']);
});

test('categories do not leak into prose/refs (still stripped from the rendered body)', () => {
  const ir = transform(
    'A dish.\n== Ingredients ==\n* [[Cookbook:Rice|rice]]\n== Procedure ==\n# Cook.\n[[Category:Vegan recipes]]',
    'Cookbook:X',
  );
  assert.ok(!(ir.lead ?? '').includes('Category'), 'category text must not appear in the lead');
});
