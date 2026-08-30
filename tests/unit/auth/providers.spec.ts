// The sign-in page's provider registry — croft-pwa/docs/DESIGN.md § Flows › Sign in.
// Ported from the reference (croft-pwa/src/signin/providers.ts); every fact was
// probed against the live network and is re-probed by tests/e2e/providers-live.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  ATMO_GLOSS,
  PROVIDERS,
  SIGNUP,
  canCreateAccount,
  featuredProviders,
  otherProviders,
  providerById,
  validateProviders,
  type Provider,
} from '../../../src/auth/providers.js';

const open = (id: string): Provider => ({ id, label: id, entryway: `https://${id}.test`, signups: SIGNUP.OPEN });
const invite = (id: string): Provider => ({ id, label: id, entryway: `https://${id}.test`, signups: SIGNUP.INVITE });

describe('providers: the registry', () => {
  it('passes its own validation', () => {
    expect(() => validateProviders(PROVIDERS)).not.toThrow();
  });
  it('knows the probed postures', () => {
    const by = Object.fromEntries(PROVIDERS.map((p) => [p.entryway, p.signups]));
    expect(by['https://bsky.social']).toBe(SIGNUP.OPEN);
    expect(by['https://blacksky.app']).toBe(SIGNUP.OPEN);
    expect(by['https://eurosky.social']).toBe(SIGNUP.OPEN);
    expect(by['https://northsky.social']).toBe(SIGNUP.INVITE);
  });
  it('carries the atmo gloss verbatim', () => {
    expect(ATMO_GLOSS).toBe('A Personal Data Server provider in the open social Atmosphere');
  });
  it('names what it does not know', () => {
    expect(() => providerById('nope')).toThrow(/nope.*bsky/);
  });
});

describe('providers: two panels split by posture', () => {
  it('featured = open in order, capped at four; other = invite-only', () => {
    expect(featuredProviders([open('a'), invite('b'), open('c')]).map((p) => p.id)).toEqual(['a', 'c']);
    expect(otherProviders([open('a'), invite('b'), open('c')]).map((p) => p.id)).toEqual(['b']);
    expect(featuredProviders(['a', 'b', 'c', 'd', 'e'].map(open))).toHaveLength(4);
  });
  it('every registered provider is on exactly one panel', () => {
    const all = [...featuredProviders(), ...otherProviders()].map((p) => p.id).sort();
    expect(all).toEqual(PROVIDERS.map((p) => p.id).sort());
  });
  it('open providers offer Create; invite-only ones do NOT (both directions)', () => {
    expect(canCreateAccount(open('o'))).toBe(true);
    expect(canCreateAccount(invite('i'))).toBe(false);
  });
});

describe('providers: bad data fails loudly', () => {
  it('unknown posture names provider and value', () => {
    const bad = [{ id: 'x', label: 'X', entryway: 'https://x.test', signups: 'maybe' }] as unknown as Provider[];
    expect(() => validateProviders(bad)).toThrow(/x.*maybe/);
  });
  it('non-https entryway and duplicate entryway are refused', () => {
    expect(() => validateProviders([{ ...open('h'), entryway: 'http://h.test' }])).toThrow(/https/);
    expect(() => validateProviders([open('a'), { ...invite('b'), entryway: 'https://a.test' }])).toThrow(/a\.test/);
  });
});
