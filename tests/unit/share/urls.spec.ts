// Share URL builders (share affordances run): the two share targets already
// exist — the recipe detail (recipe.html?u=<at-uri>[&by=<handle>]) and the
// cookbook cold-view (cookbook.html?did=<did>). These pure builders turn a
// page's own params into the canonical link a share button copies. Contract:
//   - each identifier (at-uri, DID, handle) is URL-encoded EXACTLY once
//   - `by` is included only when a handle is present (non-empty)
//   - origin is passed in, never read from a global — the function stays pure
import { describe, expect, it } from 'vitest';
import { buildCookbookShareUrl, buildRecipeShareUrl } from '../../../src/share/urls.js';

const ORIGIN = 'https://arecipe.app';
const AT_URI = 'at://did:plc:26tsx5juuss4yealylyfbj4h/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D';
const DID = 'did:plc:26tsx5juuss4yealylyfbj4h';

describe('buildRecipeShareUrl', () => {
  it('builds the canonical recipe.html?u= URL under the given origin', () => {
    const url = buildRecipeShareUrl(ORIGIN, AT_URI);
    expect(url.startsWith(`${ORIGIN}/recipe.html?u=`)).toBe(true);
  });

  it('URL-encodes the at-uri exactly once', () => {
    const url = buildRecipeShareUrl(ORIGIN, AT_URI);
    const u = new URL(url).searchParams.get('u');
    expect(u).toBe(AT_URI); // decoded back to the exact input — encoded once
    // The raw query must be percent-encoded (not the literal at:// with slashes),
    // and must NOT be double-encoded (no stray %25 from encoding a % sign).
    expect(url).toContain(`u=${encodeURIComponent(AT_URI)}`);
    expect(url).not.toContain('%25');
  });

  it('includes &by= only when a handle is present', () => {
    const withHandle = buildRecipeShareUrl(ORIGIN, AT_URI, 'somechef.example.com');
    expect(new URL(withHandle).searchParams.get('by')).toBe('somechef.example.com');
    expect(withHandle).toContain('by=somechef.example.com');

    const noHandle = buildRecipeShareUrl(ORIGIN, AT_URI);
    expect(new URL(noHandle).searchParams.has('by')).toBe(false);

    const emptyHandle = buildRecipeShareUrl(ORIGIN, AT_URI, '');
    expect(new URL(emptyHandle).searchParams.has('by')).toBe(false);
  });

  it('URL-encodes the handle exactly once', () => {
    // A handle with a reserved char proves the single-encode (space → %20, once).
    const url = buildRecipeShareUrl(ORIGIN, AT_URI, 'a b.example.com');
    expect(new URL(url).searchParams.get('by')).toBe('a b.example.com');
    expect(url).not.toContain('%2520');
  });

  it('is pure: uses the origin passed in, including a subpath base', () => {
    const preview = buildRecipeShareUrl('https://arecipe.app/pr-preview/pr-8', AT_URI);
    expect(preview.startsWith('https://arecipe.app/pr-preview/pr-8/recipe.html?u=')).toBe(true);
  });
});

describe('buildCookbookShareUrl', () => {
  it('builds the canonical cookbook.html?did= URL under the given origin', () => {
    const url = buildCookbookShareUrl(ORIGIN, DID);
    expect(url.startsWith(`${ORIGIN}/cookbook.html?did=`)).toBe(true);
  });

  it('URL-encodes the DID exactly once', () => {
    const url = buildCookbookShareUrl(ORIGIN, DID);
    expect(new URL(url).searchParams.get('did')).toBe(DID);
    expect(url).toContain(`did=${encodeURIComponent(DID)}`);
    expect(url).not.toContain('%25');
  });

  it('is pure: uses the origin passed in, including a subpath base', () => {
    const preview = buildCookbookShareUrl('https://arecipe.app/pr-preview/pr-8', DID);
    expect(preview.startsWith('https://arecipe.app/pr-preview/pr-8/cookbook.html?did=')).toBe(true);
  });
});
