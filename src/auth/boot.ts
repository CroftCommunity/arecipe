// Shared session bootstrap for pages that use auth (mine, account).
// Browse deliberately never imports this — it ships zero auth code.

import type { Agent } from '@atproto/api';
import { isDebugEnabled, log } from '../log.js';
import { authModeFor, createOAuthClient } from './oauth-client.js';
import { isPreviewDemoActive, mockSessionBoot } from './preview-session.js';
import { setSessionHint } from './session-hint.js';
import { createOAuthSessionProvider, type SessionProvider } from './session-provider.js';

export type SessionBoot = {
  provider: SessionProvider | null;
  agent: Agent | null;
};

/** Create the provider (loopback or hosted origins), restore any session, expose the debug hook. */
export const bootSession = async (): Promise<SessionBoot> => {
  // Preview-only demo session (read-only, fake account; opt-in via ?demo on a
  // /pr-preview/ build). Refused anywhere else — see preview-session.ts.
  if (isPreviewDemoActive()) {
    log.info('auth', 'preview demo session active — read-only, fake account (not production)');
    return mockSessionBoot();
  }
  const mode = authModeFor(window.location.origin, window.location.hostname);
  const provider =
    mode === 'none' ? null : createOAuthSessionProvider({ client: createOAuthClient() });
  if (provider === null) {
    log.info('auth', 'origin has no OAuth client — read-only', {
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
  // Mirror session presence into the zero-auth landing hint (index.html reads it
  // to route a signed-in home landing to the Cookbook).
  setSessionHint(agent !== null);
  // Debug console surface (?debug=1 / localStorage.debug): field debugging
  // and the 3b/5 regression tests force refreshes through this.
  if (isDebugEnabled(window.location.search, window.localStorage.getItem('debug'))) {
    (window as Window & { arecipeDebug?: unknown }).arecipeDebug = {
      forceRefresh: provider.forceRefresh,
    };
  }
  return { provider, agent };
};
