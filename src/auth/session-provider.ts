// The session-provider port (Phase 3, shaped by the D5 probe). The app
// consumes an authenticated Agent through this interface. Production wires
// it to the OAuth client (DPoP; the library owns persistence — v0.4.6
// stores sessions in IndexedDB and restores them via init(), so this module
// deliberately adds NO storage of its own). Tests wire the same port to an
// app-password Agent, which keeps wiring tests off the third-party consent
// screen. Caveats the @live OAuth tier alone covers: DPoP nonce retries,
// OAuth token lifetimes/refresh, scope behavior.

import { Agent } from '@atproto/api';
import { log } from '../log.js';
import { setSessionHint } from './session-hint.js';

/** The slice of BrowserOAuthClient the provider consumes (injectable for tests). */
export type OAuthClientPort = {
  init: () => Promise<{ session: OAuthSessionLike } | undefined>;
  signIn: (target: string, options?: SignInOptions) => Promise<unknown>;
};

/** Sign-in intent (DESIGN.md § Flows › Sign in rule 4): `create` lands in the
 * provider's registration wizard instead of its sign-in screen. Only ever sent
 * for a provider start where signups are open. */
export type SignInOptions = {
  readonly prompt?: 'create';
};

/** The slice of OAuthSession the provider consumes. */
export type OAuthSessionLike = {
  did: string;
  signOut: () => Promise<void>;
  fetchHandler: (pathname: string, init?: RequestInit) => Promise<Response>;
  getTokenInfo: (refresh?: boolean | 'auto') => Promise<{ expiresAt?: Date }>;
};

export type SessionProvider = {
  /** Restore an existing session (or complete a login callback). Null when signed out. */
  restore: () => Promise<Agent | null>;
  /** Begin the interactive sign-in redirect at a handle, DID, or provider
   * ENTRYWAY (https origin — server first, the DID comes back in the token).
   * Resolves only on failure/abort. */
  signIn: (target: string, options?: SignInOptions) => Promise<void>;
  /** Revoke the restored session. No-op when signed out. */
  signOut: () => Promise<void>;
  /**
   * Force a token refresh now (debug/diagnostic surface — exposed on the
   * console in debug mode; also exercised by the 3b two-tab regression test).
   * The library serializes concurrent refreshes across tabs via
   * navigator.locks; this just requests one.
   */
  forceRefresh: () => Promise<{ expiresAt?: Date }>;
};

export const createOAuthSessionProvider = (opts: { client: OAuthClientPort }): SessionProvider => {
  let current: OAuthSessionLike | null = null;

  return {
    restore: async () => {
      const result = await opts.client.init();
      if (result === undefined) {
        log.debug('auth', 'no session to restore');
        return null;
      }
      current = result.session;
      log.info('auth', 'session restored', { did: current.did });
      return new Agent(result.session);
    },
    signIn: async (target, options) => {
      log.info('auth', 'sign-in initiated', { target, prompt: options?.prompt ?? '' });
      // Forwarded verbatim and ONLY when given: an options-less call must not
      // invent a prompt (the official client treats undefined and {} alike, but
      // the test pins the seam so a future default cannot creep in).
      if (options === undefined) await opts.client.signIn(target);
      else await opts.client.signIn(target, options);
    },
    signOut: async () => {
      if (current === null) return;
      log.info('auth', 'signing out', { did: current.did });
      await current.signOut();
      current = null;
      setSessionHint(false); // clear the landing hint so home goes back to Browse
    },
    forceRefresh: async () => {
      if (current === null) throw new Error('no session to refresh');
      log.info('auth', 'forcing token refresh', { did: current.did });
      const info = await current.getTokenInfo(true);
      log.info('auth', 'token refreshed', {
        expiresAt: info.expiresAt?.toISOString() ?? 'unknown',
      });
      return info;
    },
  };
};
