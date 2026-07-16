// Phase 3: loopback OAuth client configuration. Behaviors pinned from the
// Phase 0 D1 probe:
// - the requested scope MUST include transition:generic (bare `atproto`
//   cannot call appview RPCs — D1 finding) and MUST survive into the
//   client metadata
// - a `localhost` origin is rewritten to an IP-literal redirect URI
//   (atproto loopback clients may not redirect to the localhost hostname)
// - an IP origin passes through as-is, port and path preserved
import { describe, expect, it } from 'vitest';
import {
  authModeFor,
  buildLoopbackMetadata,
  HOSTED_CLIENT_METADATA,
  isLoopbackHostname,
  LOOPBACK_SCOPE,
  PRODUCTION_ORIGIN,
} from '../../../src/auth/oauth-client.js';

describe('authModeFor', () => {
  it('loopback origins use the loopback client', () => {
    expect(authModeFor('http://127.0.0.1:4173', '127.0.0.1')).toBe('loopback');
    expect(authModeFor('http://localhost:4173', 'localhost')).toBe('loopback');
  });

  it('the production origin uses the hosted client', () => {
    expect(authModeFor(PRODUCTION_ORIGIN, 'arecipe.app')).toBe('hosted');
  });

  it('any other deployed origin has no sign-in (client_id would not match)', () => {
    expect(authModeFor('https://croftcommunity.github.io', 'croftcommunity.github.io')).toBe('none');
  });
});

describe('HOSTED_CLIENT_METADATA', () => {
  it('client_id is the metadata URL and redirect lands on the dedicated sign-in page', () => {
    expect(HOSTED_CLIENT_METADATA.client_id).toBe(`${PRODUCTION_ORIGIN}/client-metadata.json`);
    expect(HOSTED_CLIENT_METADATA.redirect_uris).toContain(`${PRODUCTION_ORIGIN}/signin.html`);
  });

  it('requests the appview scope and is a public DPoP web client', () => {
    expect(HOSTED_CLIENT_METADATA.scope).toBe(LOOPBACK_SCOPE);
    expect(HOSTED_CLIENT_METADATA.token_endpoint_auth_method).toBe('none');
    expect(HOSTED_CLIENT_METADATA.dpop_bound_access_tokens).toBe(true);
  });
});

describe('isLoopbackHostname', () => {
  it('accepts the loopback hosts the loopback client supports', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
  });

  it('rejects deployed origins — OAuth needs the hosted client there (M3)', () => {
    expect(isLoopbackHostname('chasemp.github.io')).toBe(false);
    expect(isLoopbackHostname('arecipe.app')).toBe(false);
  });
});

describe('LOOPBACK_SCOPE', () => {
  it('includes atproto and transition:generic (D1: bare atproto cannot call appview RPCs)', () => {
    expect(LOOPBACK_SCOPE.split(' ')).toEqual(
      expect.arrayContaining(['atproto', 'transition:generic']),
    );
  });
});

// D6 (2026-07-16): the loopback client_id is now STABLE across pages. It used to
// bake the initiating page's pathname into the single redirect_uri, so a token
// minted on signin.html could not refresh on any other page ("Token was not
// issued to this client"). The fix enumerates every authed page's redirect_uri
// in ONE client_id that no longer depends on the current pathname — verified
// (@atproto/oauth-types) to accept repeated redirect_uri params.
describe('buildLoopbackMetadata (stable loopback client_id, D6)', () => {
  it('produces a byte-identical client_id regardless of the current page pathname', () => {
    const onSignin = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/signin.html' });
    const onAccount = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/account.html' });
    const onMine = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/mine.html' });
    // The refresh bug was exactly this inequality — pin them equal.
    expect(onSignin.client_id).toBe(onAccount.client_id);
    expect(onAccount.client_id).toBe(onMine.client_id);
    expect(onSignin.redirect_uris).toEqual(onAccount.redirect_uris);
  });

  it('enumerates the authed pages, with signin.html first (the callback lands there)', () => {
    const meta = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/signin.html' });
    // signin.html MUST be redirect_uris[0]: @atproto/oauth-client defaults both
    // the authorization request and the code exchange to redirect_uris[0], and
    // signin.ts is the sole page that completes the OAuth callback.
    expect(meta.redirect_uris?.[0]).toBe('http://127.0.0.1:4173/signin.html');
    // Every authed page (those that boot a session) is registered.
    expect(meta.redirect_uris).toEqual(
      expect.arrayContaining([
        'http://127.0.0.1:4173/signin.html',
        'http://127.0.0.1:4173/account.html',
        'http://127.0.0.1:4173/cookbook.html',
        'http://127.0.0.1:4173/editor.html',
        'http://127.0.0.1:4173/meals.html',
        'http://127.0.0.1:4173/mine.html',
        'http://127.0.0.1:4173/recipe.html',
      ]),
    );
  });

  it('rewrites a localhost origin to IP-literal redirect URIs (RFC 8252), all sharing host:port', () => {
    const meta = buildLoopbackMetadata({ hostname: 'localhost', port: '4173', pathname: '/signin.html' });
    for (const uri of meta.redirect_uris ?? []) {
      expect(uri.startsWith('http://127.0.0.1:4173/')).toBe(true);
    }
    expect(meta.redirect_uris).toContain('http://127.0.0.1:4173/signin.html');
  });

  it('passes an IP origin through, preserving the port on every redirect URI', () => {
    const meta = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '8080', pathname: '/mine.html' });
    for (const uri of meta.redirect_uris ?? []) {
      expect(uri.startsWith('http://127.0.0.1:8080/')).toBe(true);
    }
  });

  it('carries the loopback scope into the metadata and client_id', () => {
    const meta = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/signin.html' });
    expect(meta.scope).toBe(LOOPBACK_SCOPE);
    expect(meta.client_id).toContain('scope=');
    expect(decodeURIComponent(meta.client_id ?? '')).toContain('transition:generic');
  });
});

// D6 acceptance: the loopback change must leave hosted (production) metadata
// byte-identical — hosted uses one fixed client_id from client-metadata.json and
// was never affected by the bug.
describe('hosted metadata is untouched by the loopback fix (D6)', () => {
  it('hosted redirect_uris is exactly the single dedicated sign-in page', () => {
    expect(HOSTED_CLIENT_METADATA.redirect_uris).toEqual([`${PRODUCTION_ORIGIN}/signin.html`]);
    expect(HOSTED_CLIENT_METADATA.client_id).toBe(`${PRODUCTION_ORIGIN}/client-metadata.json`);
  });
});
