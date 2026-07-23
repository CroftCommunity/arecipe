// D13 — end-to-end orchestration + the acceptance criteria. Drives the full
// executeRun against a fake wiki (real etiquette layer) + fake PDS + temp
// ledger/raw/run dirs. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiTransport, type FetchLike, type FetchResponse } from '../src/http/transport.ts';
import { WikiClient } from '../src/http/wiki-client.ts';
import { FakeClock, type Clock } from '../src/util/clock.ts';
import { loadConfig } from '../src/config.ts';
import { openLedger, type Ledger } from '../src/ledger/ledger.ts';
import { executeRun, type RunContext } from '../src/run.ts';
import { BlastRadiusError } from '../src/discover.ts';
import type { PdsClient } from '../src/publish/publish.ts';

// ---- fake wiki (mutable state) ----

type Page = { pageid: number; title: string; revid: number; wikitext: string };

const recipeWt = (name: string, extra = '') =>
  `{{Recipe summary|category=Test recipes|servings=2|time=10 minutes|difficulty=1}}\n` +
  `'''${name}''' is a simple test recipe used by the wbsync acceptance suite.\n` +
  `== Ingredients ==\n* [[Cookbook:Salt|salt]]\n== Procedure ==\n# Cook the ${name}.${extra}`;

type Wiki = { pages: Map<number, Page>; category: Set<number> };

const makeWiki = (n: number): Wiki => {
  const pages = new Map<number, Page>();
  const category = new Set<number>();
  for (let i = 1; i <= n; i++) {
    pages.set(i, { pageid: i, title: `Cookbook:Recipe ${i}`, revid: 100, wikitext: recipeWt(`Recipe ${i}`) });
    category.add(i);
  }
  return { pages, category };
};

const wikiServer = (wiki: Wiki): FetchLike => async (url) => {
  const p = new URL(url).searchParams;
  const body = (v: unknown): FetchResponse => ({ status: 200, headers: new Map(), text: async () => JSON.stringify(v) });
  if (p.get('meta') === 'siteinfo') {
    return body({ query: { namespaces: { '102': { id: 102, name: 'Cookbook', canonical: 'Cookbook' } } } });
  }
  if (p.get('list') === 'categorymembers') {
    if (p.get('cmtype') === 'subcat') return body({ query: { categorymembers: [{ title: 'Category:Easy recipes' }] } });
    const members = [...wiki.category].map((id) => wiki.pages.get(id)!).filter(Boolean);
    return body({ query: { categorymembers: members.map((pg) => ({ pageid: pg.pageid, ns: 102, title: pg.title })) } });
  }
  if (p.get('prop') === 'categoryinfo') {
    return body({ query: { pages: [{ categoryinfo: { pages: wiki.category.size } }] } });
  }
  if (p.get('prop') === 'revisions') {
    const wantContent = (p.get('rvprop') ?? '').includes('content');
    const ids = (p.get('pageids') ?? '').split('|').filter(Boolean).map(Number);
    return body({
      query: {
        pages: ids.map((id) => {
          const pg = wiki.pages.get(id);
          if (pg === undefined) return { pageid: id, missing: true };
          const rev: Record<string, unknown> = { revid: pg.revid, timestamp: '2026-06-01T00:00:00Z' };
          if (wantContent) rev.slots = { main: { content: pg.wikitext } };
          return { pageid: id, ns: 102, title: pg.title, revisions: [rev] };
        }),
      },
    });
  }
  if (p.get('prop') === 'info') {
    const ids = (p.get('pageids') ?? '').split('|').filter(Boolean).map(Number);
    return body({
      query: {
        pages: ids.map((id) => {
          const pg = wiki.pages.get(id);
          return pg === undefined ? { pageid: id, missing: true } : { pageid: id, ns: 102, title: pg.title };
        }),
      },
    });
  }
  throw new Error(`unexpected wiki query: ${url}`);
};

// ---- fake PDS ----

type PdsCall = { kind: 'put' | 'delete'; rkey: string };
const makePds = (): { pds: PdsClient; calls: PdsCall[]; store: Set<string> } => {
  const calls: PdsCall[] = [];
  const store = new Set<string>();
  let rev = 0;
  const pds: PdsClient = {
    async putRecord(_r, _c, rkey) { calls.push({ kind: 'put', rkey }); store.add(rkey); rev++; return { cid: `cid-${rkey}-${rev}`, uri: `at://x/${rkey}` }; },
    async deleteRecord(_r, _c, rkey) { calls.push({ kind: 'delete', rkey }); store.delete(rkey); rev++; },
    async currentRev() { return `rev-${rev}`; },
  };
  return { pds, calls, store };
};

// ---- harness ----

const cfg = () =>
  loadConfig({
    WIKIBOOKS_CONTACT: 'ops@arecipe.app',
    WIKIBOOKS_PUBLISH_HANDLE: 'cookbook.arecipe.app',
    WIKIBOOKS_PUBLISH_SERVICE: 'https://pds.example',
    WIKIBOOKS_PUBLISH_APP_PASSWORD: 'x',
  });

type Harness = { ctx: (runId: string, pds?: PdsClient) => RunContext; wiki: Wiki; ledger: Ledger; root: string; clock: Clock };

const harness = (n: number): Harness => {
  const wiki = makeWiki(n);
  const ledger = openLedger(':memory:', () => '2026-07-23T00:00:00Z');
  const root = mkdtempSync(join(tmpdir(), 'wbrun-'));
  const clock = new FakeClock(1_700_000_000_000);
  const ctx = (runId: string, pds?: PdsClient): RunContext => {
    const transport = new WikiTransport(cfg(), wikiServer(wiki), new FakeClock());
    return {
      cfg: cfg(), ledger, client: new WikiClient(cfg(), transport),
      stateDir: root, rawDir: join(root, 'raw'), runDir: join(root, 'runs', runId), runId, clock, pds,
    };
  };
  return { ctx, wiki, ledger, root, clock };
};

// ---- acceptance ----

test('run twice with no upstream change → second pass makes ZERO PDS writes', async () => {
  const h = harness(4);
  const pds1 = makePds();
  const s1 = await executeRun(h.ctx('r1', pds1.pds), { publish: true, reparse: false });
  assert.equal(s1.publishable, 4);
  assert.equal(s1.planCounts.create, 4, 'first run creates all 4');
  assert.equal(pds1.calls.length, 4);
  assert.ok(s1.repoRev !== null);

  const pds2 = makePds();
  const s2 = await executeRun(h.ctx('r2', pds2.pds), { publish: true, reparse: false });
  assert.equal(s2.pdsWrites, 0, 'nothing changed upstream → zero PDS writes');
  assert.deepEqual(s2.planCounts, { create: 0, update: 0, delete: 0 });
  assert.equal(pds2.calls.length, 0);
  assert.ok(s2.wikiRequests > 0, `run reports its wiki request count (${s2.wikiRequests})`);
  assert.ok(existsSync(join(h.root, 'runs', 'r2', 'summary.json')));
});

test('a rename (same pageid, new title) is an UPDATE with the same rkey — no delete', async () => {
  const h = harness(3);
  await executeRun(h.ctx('r1', makePds().pds), { publish: true, reparse: false });
  // Rename page 1 upstream (new title, new revid; still in category).
  const pg = h.wiki.pages.get(1)!;
  pg.title = 'Cookbook:Recipe One Renamed';
  pg.revid = 200;
  const pds = makePds();
  const s = await executeRun(h.ctx('r2', pds.pds), { publish: true, reparse: false });
  assert.equal(s.planCounts.update, 1);
  assert.equal(s.planCounts.delete, 0, 'a rename never retracts');
  assert.deepEqual(pds.calls, [{ kind: 'put', rkey: 'wb-1' }], 'same rkey → update, not orphan+create');
});

test('decategorised vs deleted are distinct retractions, guarded by blast-radius', async () => {
  const h = harness(45); // large enough that vanishing two stays under 5% (2/45 = 4.4%)
  await executeRun(h.ctx('r1', makePds().pds), { publish: true, reparse: false });
  // Page 2 decategorised (still exists), page 3 deleted (gone).
  h.wiki.category.delete(2);
  h.wiki.category.delete(3);
  h.wiki.pages.delete(3);
  const pds = makePds();
  const s = await executeRun(h.ctx('r2', pds.pds), { publish: true, reparse: false });
  assert.equal(s.discovery?.decategorised, 1);
  assert.equal(s.discovery?.deleted, 1);
  assert.equal(s.planCounts.delete, 2, 'both retracted');
  assert.deepEqual(pds.calls.map((c) => c.kind).sort(), ['delete', 'delete']);
  assert.equal(h.ledger.get(2)?.status, 'decategorised');
  assert.equal(h.ledger.get(3)?.status, 'deleted');
});

test('the 5% blast-radius guard aborts BEFORE any PDS write', async () => {
  const h = harness(10); // vanish 2 of 10 = 20% > 5%
  await executeRun(h.ctx('r1', makePds().pds), { publish: true, reparse: false });
  h.wiki.category.delete(1);
  h.wiki.category.delete(2);
  const pds = makePds();
  await assert.rejects(executeRun(h.ctx('r2', pds.pds), { publish: true, reparse: false }), BlastRadiusError);
  assert.equal(pds.calls.length, 0, 'no PDS write happened before the abort');
});

test('--reparse (parser bump) republishes only changed pages with ZERO wiki requests', async () => {
  const h = harness(3);
  await executeRun(h.ctx('r1', makePds().pds), { publish: true, reparse: false });
  // Simulate a parser improvement that changes page 1's IR: stale its ledger hash.
  h.ledger.patch(1, { title: h.ledger.get(1)!.title, revid: h.ledger.get(1)!.revid, ir_sha256: 'STALE-HASH' });
  const pds = makePds();
  const ctx = h.ctx('r3', pds.pds);
  const before = ctx.client.requestCount;
  const s = await executeRun(ctx, { publish: true, reparse: true });
  assert.equal(ctx.client.requestCount, before, 'reparse makes NO wiki requests');
  assert.equal(s.wikiRequests, 0);
  assert.equal(s.planCounts.update, 1, 'only the changed page republishes');
  assert.deepEqual(pds.calls, [{ kind: 'put', rkey: 'wb-1' }]);
});

test('the run summary reports the mandated stats and restates O1–O4', async () => {
  const h = harness(4);
  const s = await executeRun(h.ctx('r1', makePds().pds), { publish: true, reparse: false });
  const onDisk = JSON.parse(readFileSync(join(h.root, 'runs', 'r1', 'summary.json'), 'utf8'));
  assert.equal(onDisk.corpusSize, 4);
  assert.equal(typeof onDisk.publishable, 'number');
  assert.ok('skippedReasons' in onDisk);
  assert.ok(Array.isArray(onDisk.parseFlagFrequency));
  assert.ok(onDisk.wikiRequests > 0);
  assert.ok('wallMs' in onDisk);
  assert.ok(onDisk.repoRev !== null);
  for (const k of ['O1', 'O2', 'O3', 'O4']) assert.ok(onDisk.ownerDecisions[k], `O${k} restated`);
  assert.match(onDisk.ownerDecisions.O2, /CC-BY-SA-4\.0/);
});
