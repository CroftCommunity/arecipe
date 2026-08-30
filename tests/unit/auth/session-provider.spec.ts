// Phase 3: the session-provider port (D5). The app consumes an Agent through
// this interface; OAuth (production) and app-password (test) implementations
// are interchangeable. Behaviors:
// - restore() returns null when the client has no session to restore
// - restore() returns a live Agent bound to the restored session's DID
// - signIn() delegates to the client's redirect flow
// - signOut() revokes the current session
import { describe, expect, it } from 'vitest';
import { createOAuthSessionProvider } from '../../../src/auth/session-provider.js';

// Minimal stand-in for BrowserOAuthClient: only the surface the provider uses.
type FakeSession = {
  did: string;
  signOut: () => Promise<void>;
  fetchHandler: (pathname: string, init?: RequestInit) => Promise<Response>;
  getTokenInfo: (refresh?: boolean | 'auto') => Promise<{ expiresAt?: Date }>;
};

const makeFakeSession = (did: string, calls: string[]): FakeSession => ({
  did,
  signOut: async () => {
    calls.push(`signOut:${did}`);
  },
  fetchHandler: async () => new Response('{}'),
  getTokenInfo: async (refresh) => {
    calls.push(`getTokenInfo:${String(refresh)}`);
    return { expiresAt: new Date('2026-07-07T18:00:00Z') };
  },
});

describe('createOAuthSessionProvider', () => {
  it('restore() returns null when no session exists', async () => {
    const provider = createOAuthSessionProvider({
      client: { init: async () => undefined, signIn: async () => undefined },
    });
    expect(await provider.restore()).toBeNull();
  });

  it('restore() returns an Agent bound to the restored DID', async () => {
    const calls: string[] = [];
    const session = makeFakeSession('did:plc:abc123', calls);
    const provider = createOAuthSessionProvider({
      client: { init: async () => ({ session }), signIn: async () => undefined },
    });
    const agent = await provider.restore();
    expect(agent).not.toBeNull();
    expect(agent?.did).toBe('did:plc:abc123');
  });

  it('signIn() delegates the handle to the client redirect flow', async () => {
    const calls: string[] = [];
    const provider = createOAuthSessionProvider({
      client: {
        init: async () => undefined,
        signIn: async (handle: string) => {
          calls.push(`signIn:${handle}`);
          return undefined;
        },
      },
    });
    await provider.signIn('alice.bsky.social');
    expect(calls).toEqual(['signIn:alice.bsky.social']);
  });

  it('forceRefresh() forces a token refresh on the restored session (3b debug hook)', async () => {
    const calls: string[] = [];
    const session = makeFakeSession('did:plc:abc123', calls);
    const provider = createOAuthSessionProvider({
      client: { init: async () => ({ session }), signIn: async () => undefined },
    });
    await provider.restore();
    const info = await provider.forceRefresh();
    expect(calls).toContain('getTokenInfo:true');
    expect(info.expiresAt).toEqual(new Date('2026-07-07T18:00:00Z'));
  });

  it('forceRefresh() fails loud when signed out', async () => {
    const provider = createOAuthSessionProvider({
      client: { init: async () => undefined, signIn: async () => undefined },
    });
    await expect(provider.forceRefresh()).rejects.toThrow(/no session/i);
  });

  it('signOut() revokes the restored session', async () => {
    const calls: string[] = [];
    const session = makeFakeSession('did:plc:abc123', calls);
    const provider = createOAuthSessionProvider({
      client: { init: async () => ({ session }), signIn: async () => undefined },
    });
    await provider.restore();
    await provider.signOut();
    expect(calls).toEqual(['signOut:did:plc:abc123']);
  });
});

// The sign-in page's Create account button sends prompt=create through the same
// seam; plain Sign in sends nothing. Both directions, so an options-less signIn
// cannot invent a prompt and a create cannot lose one (DESIGN.md § Flows rule 4).
describe('createOAuthSessionProvider — sign-in options', () => {
  it('forwards { prompt: "create" } to the client, and nothing when absent', async () => {
    const calls: unknown[][] = [];
    const provider = createOAuthSessionProvider({
      client: {
        init: async () => undefined,
        signIn: async (...args: unknown[]) => {
          calls.push(args);
        },
      },
    });
    await provider.signIn('https://bsky.social', { prompt: 'create' });
    await provider.signIn('alice.test');
    expect(calls).toEqual([
      ['https://bsky.social', { prompt: 'create' }],
      ['alice.test'],
    ]);
  });
});
