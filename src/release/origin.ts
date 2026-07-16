// Neutral runtime-origin classifier (signed releases D7, finding F1). The
// release banner runs on EVERY page including Browse, so this module must be
// auth-free — it is the dependency-free single source of the production
// origin, which src/auth/oauth-client.ts imports FROM here (never the other
// direction). Path-aware because PR previews share the production origin
// (arecipe.app/pr-preview/pr-N/ — the custom domain covers the whole gh-pages
// branch); the path check mirrors auth/preview-session.ts's isPreviewOrigin.

/** The origin whose deploys are signed releases; sign-in is likewise only
 * offered here (see authModeFor). */
export const PRODUCTION_ORIGIN = 'https://arecipe.app';

export const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

export type OriginClass = 'production' | 'preview' | 'loopback';

type LocationLike = { origin: string; hostname: string; pathname: string };

/** production = the real origin off /pr-preview/; loopback = local dev;
 * everything else (PR previews, mirrors, forks) = preview tier, where bad
 * release verdicts LOG instead of bannering. */
export const classifyOrigin = (loc: LocationLike): OriginClass => {
  if (isLoopbackHostname(loc.hostname)) return 'loopback';
  if (loc.origin === PRODUCTION_ORIGIN && !loc.pathname.includes('/pr-preview/')) {
    return 'production';
  }
  return 'preview';
};
