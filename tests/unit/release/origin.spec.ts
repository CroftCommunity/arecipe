// Signed releases Phase 4 (RED first): the NEUTRAL origin classifier — the
// banner runs on every page including Browse, so this module must be
// auth-free (unlike authModeFor in src/auth/oauth-client.ts, whose module
// pulls the OAuth client). Phase 0 F1: previews share the production ORIGIN
// (arecipe.app/pr-preview/pr-N/), so classification is path-aware.
import { describe, expect, it } from 'vitest';
import { classifyOrigin, PRODUCTION_ORIGIN } from '../../../src/release/origin.js';

const at = (origin: string, hostname: string, pathname: string) => ({
  origin,
  hostname,
  pathname,
});

describe('classifyOrigin', () => {
  it('the production origin at the site root is production', () => {
    expect(classifyOrigin(at('https://arecipe.app', 'arecipe.app', '/'))).toBe('production');
    expect(classifyOrigin(at('https://arecipe.app', 'arecipe.app', '/settings.html'))).toBe(
      'production',
    );
  });

  it('a PR preview under the SAME origin is preview, not production (F1)', () => {
    expect(
      classifyOrigin(at('https://arecipe.app', 'arecipe.app', '/pr-preview/pr-7/index.html')),
    ).toBe('preview');
  });

  it('loopback hosts are loopback', () => {
    expect(classifyOrigin(at('http://127.0.0.1:4173', '127.0.0.1', '/'))).toBe('loopback');
    expect(classifyOrigin(at('http://localhost:4173', 'localhost', '/'))).toBe('loopback');
    expect(classifyOrigin(at('http://[::1]:4173', '[::1]', '/'))).toBe('loopback');
  });

  it('any other origin (e.g. the bare github.io host) is preview-tier', () => {
    expect(
      classifyOrigin(at('https://croftcommunity.github.io', 'croftcommunity.github.io', '/')),
    ).toBe('preview');
  });

  it('exports the production origin constant (single source, auth imports from here)', () => {
    expect(PRODUCTION_ORIGIN).toBe('https://arecipe.app');
  });
});
