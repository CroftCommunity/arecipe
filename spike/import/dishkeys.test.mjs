// Phase 1b: canonical dishKey normalization. Pure-function tests (ops tooling,
// run: node --test spike/import/dishkeys.test.mjs). The normalizer must fold
// accents, strip decorative qualifier prefixes, slugify, and apply an alias
// table for cross-name synonyms (boeuf/beef) — while keeping genuinely
// distinct dishes apart (a mug cake is not the loaf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldAccents, normalizeDishKey, proposeGroups } from './dishkeys.mjs';

test('foldAccents strips diacritics to ASCII', () => {
  assert.equal(foldAccents('Crème Brûlée'), 'Creme Brulee');
  assert.equal(foldAccents('jalapeño piñata'), 'jalapeno pinata');
});

test('normalizeDishKey folds accents so both crème brûlée spellings converge', () => {
  assert.equal(normalizeDishKey('Classic Crème Brûlée'), 'creme-brulee');
  assert.equal(normalizeDishKey('Crème Brûlée'), 'creme-brulee');
});

test('normalizeDishKey strips decorative qualifier prefixes', () => {
  assert.equal(normalizeDishKey('Chewy Chocolate Chip Cookies'), 'chocolate-chip-cookies');
  assert.equal(normalizeDishKey('Classic Chocolate Chip Cookies'), 'chocolate-chip-cookies');
  assert.equal(normalizeDishKey('My Favorite Banana Bread'), 'banana-bread');
});

test('alias table merges cross-name synonyms (boeuf ↔ beef bourguignon)', () => {
  assert.equal(normalizeDishKey('Boeuf Bourguignon'), 'beef-bourguignon');
  assert.equal(normalizeDishKey('Beef Bourguignon'), 'beef-bourguignon');
});

test('strips a trailing "with ..." clause so an add-on variant merges to the base dish', () => {
  assert.equal(normalizeDishKey('Simple Caesar Salad with Grilled Chicken'), 'caesar-salad');
  // but the base dish and a genuinely different dish still differ
  assert.notEqual(normalizeDishKey('15-Minute Fish Tacos with Slaw'), normalizeDishKey('Ground Beef Tacos'));
});

test('genuinely distinct dishes stay apart — a mug cake is not the loaf', () => {
  assert.equal(normalizeDishKey('Banana Bread Mug Cake'), 'banana-bread-mug-cake');
  assert.notEqual(normalizeDishKey('Banana Bread Mug Cake'), normalizeDishKey('Classic Moist Banana Bread'));
});

test('proposeGroups buckets by dishKey; deterministic; no name under two keys', () => {
  const recs = [
    { name: 'My Favorite Banana Bread', ref: 'a' },
    { name: 'Banana Bread', ref: 'b' },
    { name: 'Boeuf Bourguignon', ref: 'c' },
    { name: 'Beef Bourguignon', ref: 'd' },
    { name: 'Pad Thai', ref: 'e' },
  ];
  const { byRef, groups } = proposeGroups(recs);
  // every record mapped to exactly one key
  assert.equal(Object.keys(byRef).length, 5);
  assert.equal(byRef['a'], 'banana-bread');
  assert.equal(byRef['c'], 'beef-bourguignon');
  assert.equal(byRef['d'], 'beef-bourguignon');
  // groups: banana-bread(2), beef-bourguignon(2), pad-thai(1)
  assert.equal(groups['banana-bread'].length, 2);
  assert.equal(groups['beef-bourguignon'].length, 2);
  assert.equal(groups['pad-thai'].length, 1);
  // deterministic: same input → same output
  assert.deepEqual(proposeGroups(recs).byRef, byRef);
});
