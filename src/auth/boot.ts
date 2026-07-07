// Shared session bootstrap for pages that use auth (mine, account).
// Browse deliberately never imports this — it ships zero auth code.

import type { Agent } from '@atproto/api';
import { isDebugEnabled, log } from '../log.js';
import { createOAuthClient, isLoopbackHostname } from './oauth-client.js';
import { createOAuthSessionProvider, type SessionProvider } from './session-provider.js';

export type SessionBoot = {
  provider: SessionProvider | null;
  agent: Agent | null;
};

/** Create the provider (loopback origins only until 8c), restore any session, expose the debug hook. */
export const bootSession = async (): Promise<SessionBoot> => {
  const provider = isLoopbackHostname(window.location.hostname)
    ? createOAuthSessionProvider({ client: createOAuthClient() })
    : null;
  if (provider === null) {
    log.info('auth', 'deployed origin — sign-in unavailable until the hosted client (8c)', {
      hostname: window.location.hostname,
    });
    return { provider: null, agent: null };
  }
  let agent: Agent | null = null;
  try {
    agent = (await provider.restore()) ?? null;
  } catch (err) {
    log.error('auth', 'session restore failed', { error: String(err) });
  }
  // Debug console surface (?debug=1 / localStorage.debug): field debugging
  // and the 3b/5 regression tests force refreshes through this.
  if (isDebugEnabled(window.location.search, window.localStorage.getItem('debug'))) {
    (window as Window & { arecipeDebug?: unknown }).arecipeDebug = {
      forceRefresh: provider.forceRefresh,
    };
  }
  return { provider, agent };
};
