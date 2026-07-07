// Phase 2: handle → DID → PDS resolution. Behavior under test (against
// RECORDED responses in tests/fixtures/identity/ — see PROBE-NOTES.md there):
// - a real handle resolves to its DID, PDS endpoint, and signing key
// - did:web documents resolve via https://<host>/.well-known/did.json
// - an unresolvable handle fails loud with the service's message
// - a DID document without an #atproto_pds service fails loud
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createResolver } from '../../../src/identity/resolve.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/identity/${name}`, import.meta.url), 'utf8');

type Route = { match: string; status: number; body: string };

const fakeFetch = (routes: Route[]): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    if (route === undefined) throw new Error(`unexpected fetch in test: ${url}`);
    return new Response(route.body, {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

const PLC_ROUTES: Route[] = [
  {
    match: 'com.atproto.identity.resolveHandle?handle=ngvalidation2112.bsky.social',
    status: 200,
    body: fixture('resolveHandle-ngvalidation2112.json'),
  },
  {
    match: 'plc.directory/did:plc:xyfhcaweaeyew3zrgk6jaln7',
    status: 200,
    body: fixture('plc-diddoc-ngvalidation2112.json'),
  },
];

describe('createResolver', () => {
  it('resolves a handle to DID + PDS endpoint + signing key (did:plc)', async () => {
    const resolve = createResolver({ fetchFn: fakeFetch(PLC_ROUTES) });
    const identity = await resolve('ngvalidation2112.bsky.social');
    expect(identity).toEqual({
      handle: 'ngvalidation2112.bsky.social',
      did: 'did:plc:xyfhcaweaeyew3zrgk6jaln7',
      pds: 'https://stropharia.us-west.host.bsky.network',
      signingKey: expect.stringMatching(/^z/), // Multikey publicKeyMultibase
    });
  });

  it('resolves did:web documents from the well-known path', async () => {
    const resolve = createResolver({
      fetchFn: fakeFetch([
        {
          match: 'resolveHandle?handle=webby.example.com',
          status: 200,
          body: JSON.stringify({ did: 'did:web:webby.example.com' }),
        },
        {
          match: 'https://webby.example.com/.well-known/did.json',
          status: 200,
          body: fixture('didweb-diddoc-synthetic.json'),
        },
      ]),
    });
    const identity = await resolve('webby.example.com');
    expect(identity.did).toBe('did:web:webby.example.com');
    expect(identity.pds).toBe('https://pds.example.com');
  });

  it('fails loud on an unresolvable handle, carrying the service message', async () => {
    const resolve = createResolver({
      fetchFn: fakeFetch([
        { match: 'resolveHandle', status: 400, body: fixture('resolveHandle-unresolvable.json') },
      ]),
    });
    await expect(resolve('definitely-not-real-xyz9.bsky.social')).rejects.toThrow(
      /Unable to resolve handle/,
    );
  });

  it('fails loud when the DID document has no #atproto_pds service', async () => {
    const noPds = JSON.parse(fixture('plc-diddoc-ngvalidation2112.json')) as { service?: unknown };
    delete noPds.service;
    const resolve = createResolver({
      fetchFn: fakeFetch([
        {
          match: 'resolveHandle',
          status: 200,
          body: fixture('resolveHandle-ngvalidation2112.json'),
        },
        { match: 'plc.directory/', status: 200, body: JSON.stringify(noPds) },
      ]),
    });
    await expect(resolve('ngvalidation2112.bsky.social')).rejects.toThrow(/atproto_pds/);
  });
});
