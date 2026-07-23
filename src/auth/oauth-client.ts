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

// `pathname` is accepted but DELIBERATELY IGNORED (callers pass window.location):
// baking it into the client_id was the local-dev refresh bug (see below). Kept in
// the type so the pathname-independence is a pinned regression, not silent.
type LocationLike = { hostname: string; port: string; pathname?: string };

/** The app's authed pages — those that boot a session (importers of
 * `auth/boot.ts`: signin, account, cookbook, editor, meals, plan, mine, recipe) — as
 * redirect_uri pathnames. `signin.html` MUST stay first: it is the sole page
 * that completes the OAuth callback, and @atproto/oauth-client defaults BOTH the
 * authorization request and the code exchange to `redirect_uris[0]`. The rest
 * are enumerated purely so the loopback `client_id` is byte-identical on every
 * page. Order is fixed → the client_id is stable. */
export const LOOPBACK_REDIRECT_PATHS = [
  '/signin.html', // callback landing — keep first (redirect_uris[0])
  '/account.html',
  '/cookbook.html',
  '/editor.html',
  '/meals.html',
  '/plan.html',
  '/mine.html',
  '/recipe.html',
] as const;

/**
 * Loopback client metadata for the given origin (D6). One STABLE `client_id`
 * across all pages, with the scope and every authed page's redirect_uri baked
 * in. The old form derived the single redirect_uri from `location.pathname`, so
 * a token minted on signin.html was bound to signin.html's client and could not
 * refresh on any other page ("Token was not issued to this client"); signin.html
 * redirects away once authed, so no reachable page could refresh. Enumerating
 * all pages' redirect_uris in one pathname-independent client_id fixes that.
 * @atproto/oauth-types accepts repeated `redirect_uri` params (verified). Hosted
 * mode is a separate fixed client_id (client-metadata.json) and is unaffected.
 */
export const buildLoopbackMetadata = (location: LocationLike): OAuthClientMetadataInput => {
  const host = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  const authority = `http://${host}${location.port === '' ? '' : `:${location.port}`}`;
  const params = LOOPBACK_REDIRECT_PATHS.map(
    (path) => `redirect_uri=${encodeURIComponent(`${authority}${path}`)}`,
  );
  params.push(`scope=${encodeURIComponent(LOOPBACK_SCOPE)}`);
  const clientId = `http://localhost?${params.join('&')}`;
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
