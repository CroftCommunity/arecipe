// Pure-transform tests for the record data-hygiene ops script. The network
// runner is guarded behind a main-module check, so importing the module here
// exercises only correctRecordValue. Run: node --test spike/import/fix-metadata.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correctRecordValue } from './fix-metadata.mjs';

test('corrects "side dish" category to "side", preserves createdAt, bumps updatedAt', () => {
  const { value, changed } = correctRecordValue(
    { recipeCategory: 'side dish', createdAt: 'C', updatedAt: 'U' },
    'NOW',
  );
  assert.equal(changed, true);
  assert.equal(value.recipeCategory, 'side');
  assert.equal(value.createdAt, 'C');
  assert.equal(value.updatedAt, 'NOW');
});

test('strips the doubled "Diet" suffix from diet tokens, leaves well-formed tokens', () => {
  const { value, changed } = correctRecordValue(
    {
      suitableForDiet: [
        'exchange.recipe.defs#dietGlutenFreeDiet',
        'exchange.recipe.defs#dietVegetarian',
      ],
    },
    'NOW',
  );
  assert.equal(changed, true);
  assert.deepEqual(value.suitableForDiet, [
    'exchange.recipe.defs#dietGlutenFree',
    'exchange.recipe.defs#dietVegetarian',
  ]);
});

test('a clean record is unchanged (idempotent) and updatedAt is NOT bumped', () => {
  const clean = {
    recipeCategory: 'side',
    suitableForDiet: ['exchange.recipe.defs#dietVegetarian'],
    updatedAt: 'U',
  };
  const { value, changed } = correctRecordValue(clean, 'NOW');
  assert.equal(changed, false);
  assert.equal(value.updatedAt, 'U');
});

test('a record with neither malformed field is untouched', () => {
  const { changed } = correctRecordValue({ name: 'x', recipeCategory: 'dinner' }, 'NOW');
  assert.equal(changed, false);
});
