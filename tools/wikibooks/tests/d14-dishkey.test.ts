// D14 — dishKey alignment stamp. arecipe groups "versions of one dish" by an
// open-world `dishKey` field on the record, read only from the record value.
// wbsync itself does NOT derive dishKeys (the canonical, human-reviewed deriver
// lives outside the isolated tool); it stamps an operator-supplied, approved
// rkey→dishKey map. When no dishKey is supplied, the field is absent (a standalone
// recipe), exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord, type RawMeta } from '../src/publish/record.ts';
import { transform } from '../src/transform/transform.ts';
import { loadConfig } from '../src/config.ts';

const cfg = () => loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });

const meta = (over: Partial<RawMeta> = {}): RawMeta => ({
  pageid: 26503,
  title: 'Cookbook:Bouillabaisse',
  revid: 42,
  revTimestamp: '2026-06-01T00:00:00Z',
  retrievedAt: '2026-07-23T12:00:00Z',
  ...over,
});

const ir = () =>
  transform(
    'A Provençal fish stew.\n== Ingredients ==\n* [[Cookbook:Fish|fish]]\n== Procedure ==\n# Simmer.',
    'Cookbook:Bouillabaisse',
  );

test('a supplied dishKey is stamped onto the record (top-level, where arecipe reads it)', () => {
  const { record } = buildRecord(ir(), meta(), cfg(), { dishKey: 'bouillabaisse' });
  assert.equal(record.dishKey, 'bouillabaisse');
});

test('no dishKey supplied → the field is absent (standalone recipe, unchanged behaviour)', () => {
  const { record } = buildRecord(ir(), meta(), cfg());
  assert.equal('dishKey' in record, false);
});

test('an empty / whitespace dishKey is treated as absent (never stamps a blank group)', () => {
  const a = buildRecord(ir(), meta(), cfg(), { dishKey: '' }).record;
  const b = buildRecord(ir(), meta(), cfg(), { dishKey: '   ' }).record;
  assert.equal('dishKey' in a, false);
  assert.equal('dishKey' in b, false);
});

test('stamping stays deterministic and does not disturb provenance', () => {
  const a = buildRecord(ir(), meta(), cfg(), { dishKey: 'bouillabaisse' }).record;
  const b = buildRecord(ir(), meta(), cfg(), { dishKey: 'bouillabaisse' }).record;
  assert.deepEqual(a, b);
  assert.equal(a.sourceRevId, 42);
});
