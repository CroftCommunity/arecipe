// Loopback OAuth client construction (Phase 3). The hosted client-metadata
// document is an M3 item; local development uses atproto's loopback client
// exception. Two hard-won D1 facts are encoded here:
// - scope must be requested explicitly via the loopback client_id — the bare
//   default `atproto` scope cannot call appview-proxied RPCs
// - the redirect URI must be an IP literal (127.0.0.1), never `localhost`

import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import {
  atprotoLoopbackClientMetadata,
  type OAuthClientMetadataInput,
} from '@atproto/oauth-types';
import { log } from '../log.js';

/** D1: bare `atproto` cannot call appview RPCs; transition:generic can. */
export const LOOPBACK_SCOPE = 'atproto transition:generic';

/**
 * Whether the loopback OAuth client can exist on this origin. On deployed
 * origins (GitHub Pages, arecipe.app) sign-in requires the hosted
 * client-metadata document — an M3 item; until then the app runs read-only
 * there instead of crashing at startup.
 */
export const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

type LocationLike = { hostname: string; port: string; pathname: string };

/** Loopback client metadata for the given origin, with the scope baked into the client_id. */
export const buildLoopbackMetadata = (location: LocationLike): OAuthClientMetadataInput => {
  const host = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  const redirectUri = `http://${host}${location.port === '' ? '' : `:${location.port}`}${location.pathname}`;
  const clientId = `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(LOOPBACK_SCOPE)}`;
  return atprotoLoopbackClientMetadata(clientId);
};

export type CreateOAuthClientOptions = {
  /** Service for the OAuth flow's own handle resolution (not Phase 2's resolver). */
  handleResolver?: string;
};

/** The production BrowserOAuthClient, configured for the current (loopback) origin. */
export const createOAuthClient = (options: CreateOAuthClientOptions = {}): BrowserOAuthClient => {
  const metadata = buildLoopbackMetadata(window.location);
  log.debug('auth', 'oauth client configured', {
    clientId: metadata.client_id,
    scope: metadata.scope ?? '',
  });
  return new BrowserOAuthClient({
    handleResolver: options.handleResolver ?? 'https://bsky.social',
    clientMetadata: metadata,
  });
};
