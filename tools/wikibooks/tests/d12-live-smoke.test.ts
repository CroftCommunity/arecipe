// D12 — the ONE live-grade test. Gated behind WIKIBOOKS_LIVE=1, skipped by
// default. It fetches exactly three named pages from the REAL en.wikibooks
// Action API through the REAL etiquette layer (WikiTransport) and asserts the
// transform produces publishable IR. This is the single boundary separating a
// stand-in-grade suite from live grade (STAND-INS.md). It does NOT touch a PDS —
// publish stays dry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WikiTransport, type FetchLike } from '../src/http/transport.ts';
import { WikiClient } from '../src/http/wiki-client.ts';
import { realClock } from '../src/util/clock.ts';
import { loadConfig } from '../src/config.ts';
import { transform } from '../src/transform/transform.ts';
import { buildRecord } from '../src/publish/record.ts';

const LIVE = process.env.WIKIBOOKS_LIVE === '1';

const NAMED_PAGES = ['Cookbook:A Nice Cup of Tea', 'Cookbook:Guacamole', 'Cookbook:Pancake'];

test('live smoke: three real pages transform to publishable IR', { skip: !LIVE }, async () => {
  const cfg = loadConfig({
    ...process.env,
    WIKIBOOKS_CONTACT: process.env.WIKIBOOKS_CONTACT ?? 'ops@arecipe.app',
  });
  const realFetch: FetchLike = (url, init) => fetch(url, { headers: init.headers });
  const client = new WikiClient(cfg, new WikiTransport(cfg, realFetch, realClock));

  // Namespace VERIFY at runtime.
  const nsId = await client.resolveCookbookNamespaceId();
  assert.equal(nsId, 102, 'Cookbook namespace should resolve to 102');

  const contents = await client.fetchContentByTitles(NAMED_PAGES);
  assert.ok(contents.length >= 1, 'at least one named page should resolve');

  let publishableSeen = 0;
  for (const c of contents) {
    const ir = transform(c.wikitext, c.title);
    if (!ir.publishable) continue;
    publishableSeen++;
    const { rkey, record } = buildRecord(
      ir,
      { pageid: c.pageid, title: c.title, revid: c.revid, revTimestamp: c.timestamp, retrievedAt: new Date(realClock.now()).toISOString() },
      cfg,
    );
    assert.match(rkey, /^wb-\d+$/);
    assert.ok(record.ingredients.length > 0 && record.instructions.length > 0);
    assert.ok(record.sourceUrl.startsWith('https://en.wikibooks.org/wiki/Cookbook:'));
    assert.equal(record.license.id, 'CC-BY-SA-4.0');
  }
  assert.ok(publishableSeen >= 1, 'at least one named page should produce publishable IR');
});
