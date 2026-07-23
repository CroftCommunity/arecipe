// D15 Phase 9 — attach embed at publish. buildEmbed maps a resolved manifest
// entry + an uploaded blob into the record's `exchange.recipe.recipe#imagesEmbed`
// (image + alt + aspectRatio + open-world credit). attachEmbeds uploads the
// cached rendition (only on --publish, via the injected PDS) and sets
// record.embed, skipping items that already carry one (idempotent/resumable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed, attachEmbeds } from '../src/publish/embed.ts';
import type { Manifest } from '../src/images/stage.ts';
import type { BlobRef, RecipeRecord } from '../src/publish/record.ts';
import type { PlanItem } from '../src/publish/publish.ts';

const blob = (cid: string): BlobRef => ({ $type: 'blob', ref: { $link: cid }, mimeType: 'image/jpeg', size: 10 });

test('buildEmbed assembles imagesEmbed with alt, aspectRatio, and credit', () => {
  const embed = buildEmbed(
    { status: 'resolved', file: '1.jpg', mime: 'image/jpeg', width: 800, height: 600, alt: 'Nachos', credit: { artist: 'Jane', license: 'CC BY-SA 3.0', source: 'https://commons/File:X' } },
    blob('cid1'),
  );
  assert.equal(embed.$type, 'exchange.recipe.recipe#imagesEmbed');
  assert.equal(embed.images.length, 1);
  assert.equal(embed.images[0]!.image.ref.$link, 'cid1');
  assert.equal(embed.images[0]!.alt, 'Nachos');
  assert.deepEqual(embed.images[0]!.aspectRatio, { width: 800, height: 600 });
  assert.equal(embed.images[0]!.credit?.artist, 'Jane');
});

const rec = (over: Partial<RecipeRecord> = {}): RecipeRecord => ({ $type: 'exchange.recipe.recipe', name: 'x', text: 't', ingredients: [], instructions: [], createdAt: '', updatedAt: '', sourceUrl: '', sourcePermalink: '', sourceRevId: 1, sourceHistoryUrl: '', retrievedAt: '', license: { id: '', token: '', attribution: '' }, wikibooks: { pageid: 1, parseFlags: [] }, ...over });

const item = (pageid: number, value: RecipeRecord): Extract<PlanItem, { action: 'create' }> => ({ action: 'create', pageid, rkey: `wb-${pageid}`, collection: 'exchange.recipe.recipe', value });

test('attachEmbeds uploads the cached rendition and sets record.embed', async () => {
  const manifest: Manifest = {
    '1': { status: 'resolved', file: '1.jpg', mime: 'image/jpeg', width: 800, height: 600, alt: 'Nachos', credit: { license: 'CC BY-SA 3.0', source: 's' } },
    '2': { status: 'skipped', reason: 'non-commercial' },
  };
  const uploads: string[] = [];
  const pds = { async uploadBlob(bytes: Uint8Array, mime: string): Promise<BlobRef> { uploads.push(`${bytes.length}:${mime}`); return blob('cidUp'); } };
  const items = [item(1, rec()), item(2, rec())];
  const out = await attachEmbeds(items, { manifest, imagesDir: '/img', pds, readFile: () => new Uint8Array([1, 2, 3]) });
  assert.equal(out.uploaded, 1);
  assert.equal(uploads.length, 1, 'only the resolved one uploaded');
  assert.equal(items[0]!.value.embed?.images[0]!.image.ref.$link, 'cidUp');
  assert.equal(items[0]!.value.embed?.images[0]!.alt, 'Nachos');
  assert.equal(items[1]!.value.embed, undefined, 'skipped manifest entry gets no embed');
});

test('attachEmbeds is idempotent — an item already carrying an embed is not re-uploaded', async () => {
  const manifest: Manifest = { '1': { status: 'resolved', file: '1.jpg', mime: 'image/jpeg', width: 800, height: 600, alt: 'x', credit: { license: 'CC0', source: 's' } } };
  let uploads = 0;
  const pds = { async uploadBlob(): Promise<BlobRef> { uploads++; return blob('new'); } };
  const withEmbed = rec({ embed: { $type: 'exchange.recipe.recipe#imagesEmbed', images: [{ image: blob('existing'), alt: 'x' }] } });
  const items = [item(1, withEmbed)];
  const out = await attachEmbeds(items, { manifest, imagesDir: '/img', pds, readFile: () => new Uint8Array([1]) });
  assert.equal(uploads, 0);
  assert.equal(out.skipped, 1);
  assert.equal(items[0]!.value.embed?.images[0]!.image.ref.$link, 'existing');
});
