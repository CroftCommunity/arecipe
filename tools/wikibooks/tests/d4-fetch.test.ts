// D4 — fetch stage. new/changed pageids only, batched at the 50-cap. raw/ is
// content-addressable by revid and never mutated in place; a killed run costs
// exactly one batch, not the corpus (resumable via progress.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchStage, latestRawFor, type ContentFetcher } from '../src/fetch.ts';
import type { PageContent } from '../src/http/wiki-client.ts';
import { FakeClock } from '../src/util/clock.ts';

const scratch = () => mkdtempSync(join(tmpdir(), 'wbfetch-'));

const content = (pageid: number, revid: number): PageContent => ({
  pageid,
  title: `Cookbook:Page${pageid}`,
  revid,
  timestamp: '2026-06-01T00:00:00Z',
  wikitext: `{{Recipe}} page ${pageid} rev ${revid}`,
  requestUrl: `https://en.wikibooks.org/w/api.php?pageids=${pageid}`,
});

/** A ContentFetcher that records every batch it is asked to fetch and can be
 *  scripted to throw on the Nth batch (to simulate a crash). */
const recordingFetcher = (
  revidOf: (pageid: number) => number,
  throwOnBatch?: number,
): { fetcher: ContentFetcher; batches: number[][]; fetchCount: Map<number, number> } => {
  const batches: number[][] = [];
  const fetchCount = new Map<number, number>();
  const fetcher: ContentFetcher = {
    async fetchContent(pageids) {
      batches.push([...pageids]);
      if (throwOnBatch !== undefined && batches.length === throwOnBatch) {
        throw new Error('simulated crash mid-batch');
      }
      for (const id of pageids) fetchCount.set(id, (fetchCount.get(id) ?? 0) + 1);
      return pageids.map((id) => content(id, revidOf(id)));
    },
  };
  return { fetcher, batches, fetchCount };
};

test('batching respects the 50-cap', async () => {
  const root = scratch();
  const ids = Array.from({ length: 120 }, (_, i) => i + 1);
  const { fetcher, batches } = recordingFetcher(() => 2);
  const res = await fetchStage(fetcher, ids, {
    rawDir: join(root, 'raw'),
    runDir: join(root, 'runs', 'r1'),
    clock: new FakeClock(),
  });
  assert.equal(batches.length, 3, 'ceil(120/50) = 3 batches');
  for (const b of batches) assert.ok(b.length <= 50, `batch of ${b.length} exceeds 50`);
  assert.equal(res.pagesWritten, 120);
});

test('raw files are content-addressed by revid and never overwritten in place', async () => {
  const root = scratch();
  const rawDir = join(root, 'raw');
  await fetchStage(recordingFetcher(() => 5).fetcher, [42], {
    rawDir,
    runDir: join(root, 'runs', 'a'),
    clock: new FakeClock(),
  });
  const rev5Path = join(rawDir, '42', '5.json');
  assert.ok(existsSync(rev5Path));
  const rev5Before = readFileSync(rev5Path, 'utf8');

  // A later run sees revid 6 for the same page.
  await fetchStage(recordingFetcher(() => 6).fetcher, [42], {
    rawDir,
    runDir: join(root, 'runs', 'b'),
    clock: new FakeClock(),
  });
  assert.equal(readFileSync(rev5Path, 'utf8'), rev5Before, 'old revision file untouched');
  assert.ok(existsSync(join(rawDir, '42', '6.json')), 'new revision file added');
  assert.deepEqual(readdirSync(join(rawDir, '42')).sort(), ['5.json', '6.json']);

  // The transform stage reads the newest revision for a page.
  const latest = latestRawFor(rawDir, 42);
  assert.equal(latest?.revid, 6);
  assert.equal(latest?.requestUrl, 'https://en.wikibooks.org/w/api.php?pageids=42');
});

test('a raw file carries the mandated fields including fetchedAt + requestUrl', async () => {
  const root = scratch();
  const rawDir = join(root, 'raw');
  const clock = new FakeClock(1_700_000_000_000);
  await fetchStage(recordingFetcher(() => 9).fetcher, [7], {
    rawDir,
    runDir: join(root, 'runs', 'a'),
    clock,
  });
  const raw = JSON.parse(readFileSync(join(rawDir, '7', '9.json'), 'utf8'));
  assert.equal(raw.pageid, 7);
  assert.equal(raw.title, 'Cookbook:Page7');
  assert.equal(raw.revid, 9);
  assert.equal(raw.timestamp, '2026-06-01T00:00:00Z');
  assert.match(raw.wikitext, /\{\{Recipe\}\}/);
  assert.equal(raw.fetchedAt, new Date(1_700_000_000_000).toISOString());
  assert.ok(typeof raw.requestUrl === 'string' && raw.requestUrl.length > 0);
});

test('resume after a crash mid-batch re-fetches only the interrupted batch, not completed ones', async () => {
  const root = scratch();
  const rawDir = join(root, 'raw');
  const runDir = join(root, 'runs', 'r1');
  const ids = Array.from({ length: 120 }, (_, i) => i + 1); // 3 batches

  // First run crashes on the 2nd batch (batch 1 completes + progress persisted).
  const first = recordingFetcher(() => 3, 2);
  await assert.rejects(
    fetchStage(first.fetcher, ids, { rawDir, runDir, clock: new FakeClock() }),
    /simulated crash/,
  );
  // Batch 1's 50 pages were written; batch 2/3 were not.
  const afterCrash = ids.filter((id) => existsSync(join(rawDir, String(id), '3.json')));
  assert.equal(afterCrash.length, 50, 'exactly batch 1 persisted before the crash');

  // Resume: same runDir, no throwing this time.
  const second = recordingFetcher(() => 3);
  const res = await fetchStage(second.fetcher, ids, { rawDir, runDir, clock: new FakeClock() });

  // Batch 1's pages must NOT be re-fetched by the resume run.
  for (let id = 1; id <= 50; id++) {
    assert.ok(!second.fetchCount.has(id), `completed page ${id} was needlessly re-fetched`);
  }
  // All 120 pages exist afterward.
  for (const id of ids) assert.ok(existsSync(join(rawDir, String(id), '3.json')), `page ${id} missing`);
  assert.equal(res.resumedSkipped, 50);
});
