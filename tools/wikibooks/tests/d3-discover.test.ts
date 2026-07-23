// D3 — delta discovery across a six-month gap. The single most important design
// constraint: NEVER use list=recentchanges ($wgRCMaxAge is 30 days, so a
// semiannual run would silently miss five months of edits). Discovery is full
// enumeration + a batched revision sweep, classified against the ledger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WikiTransport, type FetchLike, type FetchResponse } from '../src/http/transport.ts';
import { WikiClient } from '../src/http/wiki-client.ts';
import { FakeClock } from '../src/util/clock.ts';
import { loadConfig } from '../src/config.ts';
import {
  classifyPages,
  resolveVanished,
  assertBlastRadius,
  BlastRadiusError,
  type EnumPage,
  type RevInfo,
} from '../src/discover.ts';
import { openLedger, type RecipeRow } from '../src/ledger/ledger.ts';

// ---- A configurable fake Action API over the real etiquette layer ----

type ServerSpec = {
  pages: EnumPage[];
  revid: Map<number, number>;
  missing?: Set<number>; // pageids that prop=info reports as deleted
  cmPageSize?: number; // force continuation
  cookbookNsId?: number;
};

const makeServer = (spec: ServerSpec): { fetch: FetchLike; urls: string[] } => {
  const urls: string[] = [];
  const pageSize = spec.cmPageSize ?? 500;
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    const p = new URL(url).searchParams;
    const body = (v: unknown): FetchResponse => ({
      status: 200,
      headers: new Map(),
      text: async () => JSON.stringify(v),
    });
    if (p.get('meta') === 'siteinfo') {
      const id = spec.cookbookNsId ?? 102;
      return body({ query: { namespaces: { [id]: { id, name: 'Cookbook', canonical: 'Cookbook' } } } });
    }
    if (p.get('list') === 'categorymembers') {
      const offset = Number(p.get('cmcontinue') ?? '0');
      const slice = spec.pages.slice(offset, offset + pageSize);
      const out: Record<string, unknown> = {
        query: { categorymembers: slice.map((pg) => ({ pageid: pg.pageid, ns: 102, title: pg.title })) },
      };
      if (offset + pageSize < spec.pages.length) {
        out.continue = { cmcontinue: String(offset + pageSize), continue: '-||' };
      }
      return body(out);
    }
    if (p.get('prop') === 'revisions') {
      const ids = (p.get('pageids') ?? '').split('|').filter(Boolean).map(Number);
      return body({
        query: {
          pages: ids.map((id) => {
            const pg = spec.pages.find((x) => x.pageid === id);
            return {
              pageid: id,
              ns: 102,
              title: pg?.title ?? `Cookbook:Page${id}`,
              revisions: [{ revid: spec.revid.get(id) ?? 1, timestamp: '2026-06-01T00:00:00Z' }],
            };
          }),
        },
      });
    }
    if (p.get('prop') === 'info') {
      const ids = (p.get('pageids') ?? '').split('|').filter(Boolean).map(Number);
      return body({
        query: {
          pages: ids.map((id) =>
            spec.missing?.has(id)
              ? { pageid: id, title: `Cookbook:Page${id}`, missing: true }
              : { pageid: id, ns: 102, title: `Cookbook:Page${id}` },
          ),
        },
      });
    }
    throw new Error(`fake server got unexpected query: ${url}`);
  };
  return { fetch, urls };
};

const cfg = () => loadConfig({ WIKIBOOKS_CONTACT: 'ops@arecipe.app' });
const clientFor = (spec: ServerSpec) => {
  const clock = new FakeClock();
  const server = makeServer(spec);
  const transport = new WikiTransport(cfg(), server.fetch, clock);
  return { client: new WikiClient(cfg(), transport), transport, urls: server.urls };
};

// ---- classification table (pure) ----

const row = (over: Partial<RecipeRow>): RecipeRow => ({
  pageid: 0, title: '', revid: 1, rev_timestamp: null, raw_sha256: null, ir_sha256: null,
  transform_version: 1, status: 'active', skip_reason: null, record_rkey: null, record_cid: null,
  published_at: null, published_repo_rev: null, first_seen: null, last_seen: null, ...over,
});

test('classify covers new / changed / unchanged / vanished', () => {
  const ledger: RecipeRow[] = [
    row({ pageid: 1, revid: 5 }), // unchanged
    row({ pageid: 2, revid: 5 }), // changed (enum revid 6)
    row({ pageid: 3, revid: 5 }), // vanished (absent from enum)
  ];
  const enumeration: EnumPage[] = [
    { pageid: 1, title: 'Cookbook:One' },
    { pageid: 2, title: 'Cookbook:Two' },
    { pageid: 9, title: 'Cookbook:Nine' }, // new
  ];
  const revs: RevInfo[] = [
    { pageid: 1, revid: 5, timestamp: 't' },
    { pageid: 2, revid: 6, timestamp: 't' },
    { pageid: 9, revid: 1, timestamp: 't' },
  ];
  const c = classifyPages(ledger, enumeration, revs);
  assert.deepEqual(c.newPages.map((x) => x.pageid), [9]);
  assert.deepEqual(c.changed.map((x) => x.pageid), [2]);
  assert.deepEqual(c.unchanged.map((x) => x.pageid), [1]);
  assert.deepEqual(c.vanished, [3]);
});

test('a rename (same pageid, new title) is changed — never a vanish+new pair', () => {
  const ledger = [row({ pageid: 100, title: 'Cookbook:Pancakes', revid: 5 })];
  const enumeration = [{ pageid: 100, title: 'Cookbook:Pancake' }];
  const revs = [{ pageid: 100, revid: 6, timestamp: 't' }];
  const c = classifyPages(ledger, enumeration, revs);
  assert.deepEqual(c.vanished, []);
  assert.deepEqual(c.newPages, []);
  assert.deepEqual(c.changed.map((x) => [x.pageid, x.title]), [[100, 'Cookbook:Pancake']]);
});

test('only active ledger rows can vanish (already-retracted rows do not re-trigger)', () => {
  const ledger = [row({ pageid: 1, revid: 5, status: 'deleted' })];
  const c = classifyPages(ledger, [], []);
  assert.deepEqual(c.vanished, []);
});

// ---- vanished split: decategorised vs deleted ----

test('resolveVanished splits decategorised (still exists) from deleted (gone)', async () => {
  const { client } = clientFor({
    pages: [],
    revid: new Map(),
    missing: new Set([2]), // page 2 is gone, page 1 still exists
  });
  const res = await resolveVanished([1, 2], (id) => client.pageInfo(id));
  assert.deepEqual(res.decategorised, [1]);
  assert.deepEqual(res.deleted, [2]);
});

// ---- 5% blast-radius guard ----

test('blast-radius guard trips above 5% and not at/below it', () => {
  assert.throws(() => assertBlastRadius(51, 1000), BlastRadiusError); // 5.1%
  assert.doesNotThrow(() => assertBlastRadius(49, 1000)); // 4.9%
  assert.doesNotThrow(() => assertBlastRadius(50, 1000)); // exactly 5% — "exceeds" is strict
  try {
    assertBlastRadius(51, 1000);
    assert.fail('should have thrown');
  } catch (e) {
    assert.match((e as Error).message, /51/);
  }
});

// ---- continuation ----

test('enumeration follows continuation across a synthetic three-page enumeration', async () => {
  const pages: EnumPage[] = Array.from({ length: 7 }, (_, i) => ({
    pageid: i + 1,
    title: `Cookbook:Page${i + 1}`,
  }));
  const { client } = clientFor({ pages, revid: new Map(), cmPageSize: 3 });
  const all = await client.enumerateRecipes();
  assert.equal(all.length, 7);
  assert.deepEqual(
    all.map((p) => p.pageid),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

// ---- the constraint test, named for it ----

test('discovery NEVER calls list=recentchanges', async () => {
  const pages: EnumPage[] = Array.from({ length: 120 }, (_, i) => ({
    pageid: i + 1,
    title: `Cookbook:Page${i + 1}`,
  }));
  const { client, urls } = clientFor({ pages, revid: new Map(pages.map((p) => [p.pageid, 2])) });
  await client.resolveCookbookNamespaceId();
  await client.enumerateRecipes();
  await client.revisionSweep(pages.map((p) => p.pageid));
  for (const u of urls) {
    assert.ok(!/recentchanges/.test(u), `discovery hit recentchanges: ${u}`);
    assert.ok(!/[?&]rc/.test(u), `discovery used an rc* param: ${u}`);
  }
  // Belt-and-braces: the source must not USE the module (comments explaining the
  // constraint naturally name it, so strip comments before grepping for usage).
  const here = dirname(fileURLToPath(import.meta.url));
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const disc = stripComments(readFileSync(join(here, '..', 'src', 'discover.ts'), 'utf8'));
  const wc = stripComments(readFileSync(join(here, '..', 'src', 'http', 'wiki-client.ts'), 'utf8'));
  assert.ok(!/recentchanges/.test(disc + wc), 'source USES recentchanges (outside comments)');
});

// ---- request budget for a 3,600-page corpus ----

test('discovery stays under 100 wiki requests for a 3,600-page corpus', async () => {
  const N = 3600;
  const pages: EnumPage[] = Array.from({ length: N }, (_, i) => ({
    pageid: i + 1,
    title: `Cookbook:Page${i + 1}`,
  }));
  const { client, transport } = clientFor({ pages, revid: new Map(pages.map((p) => [p.pageid, 2])) });
  await client.resolveCookbookNamespaceId();
  const enumerated = await client.enumerateRecipes();
  await client.revisionSweep(enumerated.map((p) => p.pageid));
  assert.equal(enumerated.length, N);
  assert.ok(
    transport.requestCount < 100,
    `discovery made ${transport.requestCount} requests, budget is <100`,
  );
});

// ---- flatness verification (VERIFY: category is the complete enumeration) ----

const flatnessServer = (flat: number, subcatCounts: Record<string, number>): FetchLike => async (url) => {
  const p = new URL(url).searchParams;
  const body = (v: unknown): FetchResponse => ({ status: 200, headers: new Map(), text: async () => JSON.stringify(v) });
  if (p.get('list') === 'categorymembers' && p.get('cmtype') === 'subcat') {
    return body({ query: { categorymembers: Object.keys(subcatCounts).map((title) => ({ title })) } });
  }
  if (p.get('prop') === 'categoryinfo') {
    const title = (p.get('titles') ?? '');
    return body({ query: { pages: [{ categoryinfo: { pages: subcatCounts[title] ?? 0 } }] } });
  }
  throw new Error(`flatness fake got unexpected query: ${url}`);
};

test('flatness check passes when the flat enumeration covers the subcategories', async () => {
  const { verifyCategoryFlatness } = await import('../src/discover.ts');
  const clock = new FakeClock();
  const t = new WikiTransport(cfg(), flatnessServer(3600, { 'Category:Very easy recipes': 704, 'Category:Easy recipes': 1557, 'Category:Medium recipes': 1273, 'Category:Difficult recipes': 93 }), clock);
  const client = new WikiClient(cfg(), t);
  const report = await verifyCategoryFlatness(client, 3627);
  assert.equal(report.subcatSum, 704 + 1557 + 1273 + 93);
  assert.equal(report.ok, true);
  assert.equal(report.fallbackUsed, false);
});

test('flatness check flags a materially short flat enumeration and engages fallback', async () => {
  const { verifyCategoryFlatness } = await import('../src/discover.ts');
  const clock = new FakeClock();
  const t = new WikiTransport(cfg(), flatnessServer(100, { 'Category:Easy recipes': 3600 }), clock);
  const client = new WikiClient(cfg(), t);
  const report = await verifyCategoryFlatness(client, 100); // flat is only ~3% of 3600
  assert.equal(report.ok, false);
  assert.equal(report.fallbackUsed, true);
  assert.match(report.note, /FLAT ENUMERATION SHORT/);
  assert.equal(report.discrepancy, 3500);
});

// ---- integration: discover() ties it together with the ledger + guard ----

test('discover() end-to-end classifies against the ledger and honours the guard', async () => {
  const { discover } = await import('../src/discover.ts');
  const led = openLedger(':memory:');
  led.upsert(row({ pageid: 1, title: 'Cookbook:One', revid: 5 }));
  led.upsert(row({ pageid: 2, title: 'Cookbook:Two', revid: 5 }));
  const pages: EnumPage[] = [
    { pageid: 1, title: 'Cookbook:One' }, // unchanged
    { pageid: 3, title: 'Cookbook:Three' }, // new
  ]; // page 2 vanished
  const { client } = clientFor({ pages, revid: new Map([[1, 5], [3, 1]]), missing: new Set([2]) });
  const result = await discover(client, led, cfg());
  assert.deepEqual(result.newPages.map((p) => p.pageid), [3]);
  assert.deepEqual(result.unchanged.map((p) => p.pageid), [1]);
  assert.deepEqual(result.deleted, [2]);
  assert.deepEqual(result.decategorised, []);
  led.close();
});
