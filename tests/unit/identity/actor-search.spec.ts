// Phase 1: cook (actor) typeahead search. Behavior under test (against a
// RECORDED response in tests/fixtures/identity/searchActorsTypeahead-cooks.json,
// captured from the live app.bsky.actor.searchActorsTypeahead endpoint):
// - a query maps the AppView's actors[] to { did, handle, displayName?, avatar? }
// - displayName / avatar are optional and dropped when absent
// - sub-min-length / empty / whitespace queries return [] WITHOUT fetching
// - errors (HTTP non-ok, thrown fetch) degrade soft: warn + [] (never throw)
// - limit is forwarded; an abort signal is passed through to fetch
//
// The typeahead path is an ambient enhancement fired per keystroke, so it
// degrades soft rather than failing loud (the "Find recipes" submit still
// fails loud — see the plan's Reasoning). That is why these tests assert []
// on error rather than a thrown error.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createActorSearch } from '../../../src/identity/actor-search.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/identity/${name}`, import.meta.url), 'utf8');

const COOKS = fixture('searchActorsTypeahead-cooks.json');

/** A fetch double that records every URL it was called with and replies with a
 * fixed route, so tests can assert both the response mapping and whether a
 * fetch happened at all (the min-length short-circuit). */
const recordingFetch = (
  reply: { status: number; body: string } | { throws: Error },
): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if ('throws' in reply) throw reply.throws;
    return new Response(reply.body, {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
};

describe('createActorSearch', () => {
  it('maps the AppView actors to suggestions, dropping absent displayName/avatar', async () => {
    const { fetch } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });

    const results = await search('rdur');

    expect(results).toEqual([
      {
        did: 'did:plc:vli2bot3i4vsyfwpmmomeeju',
        handle: 'rdurand.bsky.social',
        displayName: 'Romain Durand',
        avatar:
          'https://cdn.bsky.app/img/avatar/plain/did:plc:vli2bot3i4vsyfwpmmomeeju/avatar@jpeg',
      },
      {
        did: 'did:plc:4joosvmfioo5lvne4gkc6t6i',
        handle: 'rdurcan.bsky.social',
        displayName: 'Rebecca Durcan',
        avatar:
          'https://cdn.bsky.app/img/avatar/plain/did:plc:4joosvmfioo5lvne4gkc6t6i/avatar@jpeg',
      },
      // Third actor has no displayName/avatar — those keys must be absent.
      { did: 'did:plc:24bchnxw6w54vkineh7a6wet', handle: 'rdurward.bsky.social' },
    ]);
  });

  it('calls the searchActorsTypeahead endpoint with the query and limit', async () => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });

    await search('rdur', { limit: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead',
    );
    expect(calls[0]?.url).toContain('q=rdur');
    expect(calls[0]?.url).toContain('limit=5');
  });

  it('honors a custom appView base', async () => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch, appView: 'https://example.test' });

    await search('rdur');

    expect(calls[0]?.url).toContain('https://example.test/xrpc/app.bsky.actor.searchActorsTypeahead');
  });

  // Min-length boundary — the reason this exists is to avoid firing a network
  // request on every single keystroke. Assert the edges, not one point.
  it.each([
    ['', 'empty'],
    [' ', 'whitespace'],
    ['a', 'one char'],
  ])('returns [] WITHOUT fetching for a %s query (%s)', async (query) => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });

    const results = await search(query);

    expect(results).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('DOES fetch at the min length (two chars)', async () => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });

    await search('rd');

    expect(calls).toHaveLength(1);
  });

  it('trims the query before length-checking and sending', async () => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });

    await search('  rdur  ');

    expect(calls[0]?.url).toContain('q=rdur');
    expect(calls[0]?.url).not.toContain('q=+');
  });

  it('degrades soft (warns, returns []) on a non-ok HTTP response', async () => {
    const warn = vi.spyOn((await import('../../../src/log.js')).log, 'warn');
    const { fetch } = recordingFetch({ status: 500, body: '{"error":"boom"}' });
    const search = createActorSearch({ fetchFn: fetch });

    const results = await search('rdur');

    expect(results).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('degrades soft (returns []) on a thrown network error', async () => {
    const { fetch } = recordingFetch({ throws: new Error('offline') });
    const search = createActorSearch({ fetchFn: fetch });

    const results = await search('rdur');

    expect(results).toEqual([]);
  });

  it('passes the abort signal through to fetch', async () => {
    const { fetch, calls } = recordingFetch({ status: 200, body: COOKS });
    const search = createActorSearch({ fetchFn: fetch });
    const controller = new AbortController();

    await search('rdur', { signal: controller.signal });

    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });
});
