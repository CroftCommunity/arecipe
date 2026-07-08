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
  it('client_id is the metadata URL and redirect stays on the production origin', () => {
    expect(HOSTED_CLIENT_METADATA.client_id).toBe(`${PRODUCTION_ORIGIN}/client-metadata.json`);
    expect(HOSTED_CLIENT_METADATA.redirect_uris).toContain(`${PRODUCTION_ORIGIN}/mine.html`);
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

describe('buildLoopbackMetadata', () => {
  it('rewrites a localhost origin to an IP-literal redirect URI', () => {
    const meta = buildLoopbackMetadata({ hostname: 'localhost', port: '4173', pathname: '/' });
    expect(meta.redirect_uris).toEqual(['http://127.0.0.1:4173/']);
  });

  it('passes an IP origin through, preserving port and path', () => {
    const meta = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '8080', pathname: '/' });
    expect(meta.redirect_uris).toEqual(['http://127.0.0.1:8080/']);
  });

  it('carries the loopback scope into the metadata and client_id', () => {
    const meta = buildLoopbackMetadata({ hostname: '127.0.0.1', port: '4173', pathname: '/' });
    expect(meta.scope).toBe(LOOPBACK_SCOPE);
    expect(meta.client_id).toContain('scope=');
    expect(decodeURIComponent(meta.client_id ?? '')).toContain('transition:generic');
  });
});
