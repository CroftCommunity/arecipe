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
import clientMetadataJson from '../../client-metadata.json';

/** D1: bare `atproto` cannot call appview RPCs; transition:generic can. */
export const LOOPBACK_SCOPE = 'atproto transition:generic';

/** The production origin whose hosted client-metadata document this build
 * carries. Sign-in is offered only here (client_id must match the origin)
 * or on loopback; every other origin is read-only. */
export const PRODUCTION_ORIGIN = 'https://arecipe.app';

/** The hosted client-metadata document, served verbatim at
 * `${PRODUCTION_ORIGIN}/client-metadata.json` (see build.mjs) and burned in
 * here — the auth server fetches the URL to verify; the two must match. */
export const HOSTED_CLIENT_METADATA = clientMetadataJson as OAuthClientMetadataInput;

export type AuthMode = 'loopback' | 'hosted' | 'none';

/**
 * Which OAuth client (if any) this origin can run:
 * - loopback hosts (local dev) → the loopback client
 * - the production origin → the hosted client-metadata document
 * - anything else → none (the client_id/redirect wouldn't match → read-only)
 */
export const authModeFor = (origin: string, hostname: string): AuthMode => {
  if (isLoopbackHostname(hostname)) return 'loopback';
  if (origin === PRODUCTION_ORIGIN) return 'hosted';
  return 'none';
};

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

/** The BrowserOAuthClient for the current origin: loopback metadata locally,
 * the hosted client-metadata document on the production origin. */
export const createOAuthClient = (options: CreateOAuthClientOptions = {}): BrowserOAuthClient => {
  const mode = authModeFor(window.location.origin, window.location.hostname);
  const metadata =
    mode === 'hosted' ? HOSTED_CLIENT_METADATA : buildLoopbackMetadata(window.location);
  log.debug('auth', 'oauth client configured', {
    mode,
    clientId: metadata.client_id,
    scope: metadata.scope ?? '',
  });
  return new BrowserOAuthClient({
    handleResolver: options.handleResolver ?? 'https://bsky.social',
    clientMetadata: metadata,
  });
};
