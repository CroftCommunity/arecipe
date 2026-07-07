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
};

const makeFakeSession = (did: string, calls: string[]): FakeSession => ({
  did,
  signOut: async () => {
    calls.push(`signOut:${did}`);
  },
  fetchHandler: async () => new Response('{}'),
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
