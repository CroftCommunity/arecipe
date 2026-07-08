// TDD for the image-attach record transform (ops tooling, spike/).
// Run: node --test spike/import/image-record.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileTitleFromCommonsUrl, withImage } from './image-record.mjs';

test('fileTitleFromCommonsUrl extracts and decodes the File: title', () => {
  assert.equal(
    fileTitleFromCommonsUrl('https://commons.wikimedia.org/wiki/File:Guacamole_IMGP1271.jpg'),
    'File:Guacamole_IMGP1271.jpg',
  );
  assert.equal(
    fileTitleFromCommonsUrl('https://commons.wikimedia.org/wiki/File:Bowl%27o%27Coleslaw_modified.jpg'),
    "File:Bowl'o'Coleslaw_modified.jpg",
  );
  assert.equal(
    fileTitleFromCommonsUrl('https://commons.wikimedia.org/wiki/File:Pozole,_Mazatl%C3%A1n,_2023_02.jpg'),
    'File:Pozole,_Mazatlán,_2023_02.jpg',
  );
});

const VALUE = {
  $type: 'exchange.recipe.recipe',
  name: 'Guacamole',
  text: 'A fresh dip.',
  ingredients: ['2 avocados'],
  instructions: ['Mash.'],
  recipeCuisine: 'mexican',
  createdAt: '2026-07-08T16:00:00.000Z',
  updatedAt: '2026-07-08T16:00:00.000Z',
};
const BLOB = { $type: 'blob', ref: { $link: 'bafyxyz' }, mimeType: 'image/jpeg', size: 210000 };

test('withImage attaches the blob, alt, aspectRatio and credit', () => {
  const now = '2026-07-08T17:00:00.000Z';
  const out = withImage(
    VALUE,
    {
      blob: BLOB,
      alt: 'Guacamole',
      aspectRatio: { width: 1024, height: 680 },
      credit: { artist: 'Nikodem Nijaki', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Guacamole_IMGP1271.jpg' },
    },
    now,
  );
  const img = out.embed.images[0];
  assert.equal(img.image, BLOB);
  assert.equal(img.alt, 'Guacamole');
  assert.deepEqual(img.aspectRatio, { width: 1024, height: 680 });
  assert.equal(img.credit.artist, 'Nikodem Nijaki');
  assert.equal(out.updatedAt, now);
  assert.equal(out.createdAt, VALUE.createdAt); // preserved
  assert.equal(out.recipeCuisine, 'mexican'); // other fields preserved
  assert.equal(VALUE.embed, undefined); // input not mutated
});

test('withImage omits aspectRatio and credit when not given', () => {
  const out = withImage(VALUE, { blob: BLOB, alt: 'x' }, '2026-07-08T17:00:00.000Z');
  assert.equal(out.embed.images[0].aspectRatio, undefined);
  assert.equal(out.embed.images[0].credit, undefined);
});
