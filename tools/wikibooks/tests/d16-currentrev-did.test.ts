// D16 — currentRev must address com.atproto.sync.getLatestCommit by DID.
//
// Regression: stagePublish calls applyPlan with `repo` = the configured publish
// HANDLE (arecipe.bsky.social). getLatestCommit's `did` parameter only accepts a
// DID, so a handle returns HTTP 400. That threw at the very END of applyPlan —
// after all 3,695 records had already been written — which aborted the ledger
// fold-back loop in stagePublish, leaving record_rkey/published_at/
// published_repo_rev null for a corpus that was in fact fully published.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpPdsClient } from '../src/publish/http-pds.ts';
import { RateLimiter } from '../src/http/rate-limiter.ts';
import { FakeClock } from '../src/util/clock.ts';

const res = (status: number, json: unknown = {}) => ({
  status,
  headers: { get: () => null },
  json: async () => json,
  text: async () => JSON.stringify(json),
});

const noGap = () => new RateLimiter(new FakeClock(0), { minGapMs: 0 });

const clientFor = (urls: string[]) =>
  new HttpPdsClient(
    'https://pds.example',
    { did: 'did:plc:abc123', accessJwt: 'jwt' },
    {
      limiter: noGap(),
      fetch: async (url) => {
        urls.push(url);
        // Mirror the real PDS: `did` must be a DID, anything else is a 400.
        const did = new URL(url).searchParams.get('did') ?? '';
        return did.startsWith('did:') ? res(200, { rev: 'rev-xyz' }) : res(400);
      },
    },
  );

test('currentRev addresses getLatestCommit by DID when handed a handle', async () => {
  const urls: string[] = [];
  const client = clientFor(urls);

  const rev = await client.currentRev('arecipe.bsky.social');

  assert.equal(rev, 'rev-xyz', 'a handle must not blow up the rev capture');
  assert.equal(
    new URL(urls[0]!).searchParams.get('did'),
    'did:plc:abc123',
    'the session DID is used, not the handle',
  );
});

test('currentRev passes an explicit DID through unchanged', async () => {
  const urls: string[] = [];
  const client = clientFor(urls);

  const rev = await client.currentRev('did:plc:other999');

  assert.equal(rev, 'rev-xyz');
  assert.equal(
    new URL(urls[0]!).searchParams.get('did'),
    'did:plc:other999',
    'an explicit DID is honoured rather than overridden by the session',
  );
});

test('currentRev still surfaces a genuine transport failure', async () => {
  const client = new HttpPdsClient(
    'https://pds.example',
    { did: 'did:plc:abc123', accessJwt: 'jwt' },
    { limiter: noGap(), fetch: async () => res(503) },
  );

  // A 5xx is retried by the limiter, so the surfaced error is its exhaustion —
  // the point is that a real failure still throws rather than being swallowed.
  await assert.rejects(() => client.currentRev('arecipe.bsky.social'), /exhausted/);
});

test('currentRev returns a 4xx failure directly (not retried away)', async () => {
  const client = new HttpPdsClient(
    'https://pds.example',
    { did: 'did:plc:abc123', accessJwt: 'jwt' },
    { limiter: noGap(), fetch: async () => res(404) },
  );

  await assert.rejects(() => client.currentRev('did:plc:abc123'), /getLatestCommit failed: HTTP 404/);
});
