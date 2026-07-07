// Phase 3: loopback OAuth client configuration. Behaviors pinned from the
// Phase 0 D1 probe:
// - the requested scope MUST include transition:generic (bare `atproto`
//   cannot call appview RPCs — D1 finding) and MUST survive into the
//   client metadata
// - a `localhost` origin is rewritten to an IP-literal redirect URI
//   (atproto loopback clients may not redirect to the localhost hostname)
// - an IP origin passes through as-is, port and path preserved
import { describe, expect, it } from 'vitest';
import { buildLoopbackMetadata, LOOPBACK_SCOPE } from '../../../src/auth/oauth-client.js';

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
