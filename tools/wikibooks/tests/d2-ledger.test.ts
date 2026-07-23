// D2 — the SQLite ledger. One row per recipe, keyed by pageid (never title), so
// a page move is an update, not a phantom delete+create. Two independent change
// axes: upstream (revid) and local (transform_version / ir_sha256).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLedger, type RecipeRow } from '../src/ledger/ledger.ts';
import { computeAxes, needsRepublish } from '../src/ledger/change.ts';

const baseRow = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  pageid: 100,
  title: 'Cookbook:Pancakes',
  revid: 5,
  rev_timestamp: '2026-01-01T00:00:00Z',
  raw_sha256: 'rawA',
  ir_sha256: 'irA',
  transform_version: 1,
  status: 'active',
  skip_reason: null,
  record_rkey: 'wb-100',
  record_cid: 'cidA',
  published_at: '2026-01-02T00:00:00Z',
  published_repo_rev: 'rev1',
  first_seen: '2026-01-01T00:00:00Z',
  last_seen: '2026-01-01T00:00:00Z',
  ...over,
});

test('ledger round-trips a row', () => {
  const led = openLedger(':memory:');
  const row = baseRow();
  led.upsert(row);
  assert.deepEqual(led.get(100), row);
  assert.equal(led.get(999), undefined);
  assert.deepEqual(led.all(), [row]);
  led.close();
});

test('a rename (same pageid, new title) is an update — zero deletes', () => {
  const led = openLedger(':memory:');
  led.upsert(baseRow({ title: 'Cookbook:Pancakes' }));
  led.upsert(baseRow({ title: 'Cookbook:Pancake', revid: 6, last_seen: '2026-06-01T00:00:00Z' }));
  const rows = led.all();
  assert.equal(rows.length, 1, 'still exactly one row — no delete+create');
  assert.equal(rows[0]!.pageid, 100);
  assert.equal(rows[0]!.title, 'Cookbook:Pancake');
  assert.equal(rows[0]!.revid, 6);
  assert.equal(rows[0]!.status, 'active');
  led.close();
});

test('runs table records mode, counts, and request/write tallies', () => {
  const led = openLedger(':memory:');
  const runId = led.startRun('run');
  led.finishRun(runId, {
    counts: { new: 2, changed: 1, unchanged: 10, decategorised: 0, deleted: 0, skipped: 3 },
    wikiRequests: 81,
    pdsWrites: 0,
  });
  const runs = led.runs();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.mode, 'run');
  assert.equal(runs[0]!.wiki_requests, 81);
  assert.equal(runs[0]!.pds_writes, 0);
  assert.ok(runs[0]!.finished !== null);
  assert.deepEqual(JSON.parse(runs[0]!.counts_json), {
    new: 2, changed: 1, unchanged: 10, decategorised: 0, deleted: 0, skipped: 3,
  });
  led.close();
});

// ---- Two change axes (pure) ----

test('nothing changed → neither axis, no republish, no fetch', () => {
  const row = baseRow();
  const axes = computeAxes(row, { revid: 5, irSha256: 'irA', transformVersion: 1 });
  assert.deepEqual(axes, { upstreamChanged: false, localChanged: false });
  assert.equal(needsRepublish(axes), false);
});

test('axis 1: upstream change (revid differs) triggers republish AND fetch', () => {
  const row = baseRow();
  const axes = computeAxes(row, { revid: 6, irSha256: 'irA', transformVersion: 1 });
  assert.equal(axes.upstreamChanged, true);
  assert.equal(axes.localChanged, false);
  assert.equal(needsRepublish(axes), true);
});

test('axis 2: parser-version bump (same wiki content) triggers republish, NOT fetch', () => {
  const row = baseRow();
  const axes = computeAxes(row, { revid: 5, irSha256: 'irB', transformVersion: 2 });
  assert.equal(axes.upstreamChanged, false, 'wiki did not move → no fetch');
  assert.equal(axes.localChanged, true);
  assert.equal(needsRepublish(axes), true);
});

test('axis 2: same version but re-transform yields a different ir_sha256 → local change', () => {
  const row = baseRow();
  const axes = computeAxes(row, { revid: 5, irSha256: 'irB', transformVersion: 1 });
  assert.equal(axes.upstreamChanged, false);
  assert.equal(axes.localChanged, true);
});
