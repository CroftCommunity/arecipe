// Preview-only DEMO session — for reviewing signed-in UI on a PR preview build,
// and ONLY there. It carries NO credentials: a synthetic DID that resolves to
// nothing and an agent whose every network call rejects, so it can neither read
// nor write anyone's data. It is opt-in (append `?demo` to a preview URL) and
// fully reviewable (this file is in the diff) — NOT a hidden bypass.
//
// Safety invariants:
//  - Activation is PATH-based (`/pr-preview/`), the one thing a production page
//    (served at the site root) can never match — even though the preview shares
//    the production origin `https://arecipe.app`.
//  - `mockSessionBoot()` throws if called off a preview origin (defence in
//    depth): a session can never be fabricated on production.
//  - The agent is read-only; there is no real token anywhere, so even if the
//    guard were somehow bypassed it grants zero capability.

import type { Agent } from '@atproto/api';
import type { SessionBoot } from './boot.js';
import type { SessionProvider } from './session-provider.js';

const DEMO_FLAG = 'arecipe-preview-demo';
/** A syntactically-valid but non-existent DID (resolves to nothing). */
export const PREVIEW_DEMO_DID = 'did:plc:previewdemo0account00000';

type LocationLike = { pathname: string; search: string };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** True only on a PR preview deploy. Path-based, so a production page (served at
 * the site root) can never match, even though it shares the origin. */
export const isPreviewOrigin = (loc: LocationLike = window.location): boolean =>
  loc.pathname.includes('/pr-preview/');

/** Whether the demo session is requested for this tab. On a preview origin,
 * `?demo` turns it on (persisted for the tab) and `?demo=0` turns it off; off a
 * preview origin it is always false. */
export const isPreviewDemoActive = (
  loc: LocationLike = window.location,
  storage: StorageLike = window.sessionStorage,
): boolean => {
  if (!isPreviewOrigin(loc)) return false;
  const params = new URLSearchParams(loc.search);
  if (params.has('demo')) {
    const on = params.get('demo') !== '0';
    try {
      if (on) storage.setItem(DEMO_FLAG, '1');
      else storage.removeItem(DEMO_FLAG);
    } catch {
      /* private mode: demo lives for this navigation only */
    }
    return on;
  }
  try {
    return storage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
};

/** Clear the demo flag (used by sign-out). */
export const exitPreviewDemo = (storage: StorageLike = window.sessionStorage): void => {
  try {
    storage.removeItem(DEMO_FLAG);
  } catch {
    /* nothing to clear */
  }
};

// A read-only Agent stand-in: `.did`/`.assertDid` yield the synthetic DID; every
// other access is a proxy whose calls reject, so no read or write can succeed.
const denyProxy = (): unknown =>
  new Proxy(function denied(): void {} as object, {
    get: () => denyProxy(),
    apply: () => Promise.reject(new Error('preview demo session is read-only')),
  });

const previewAgent = (): Agent =>
  new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      if (prop === 'did' || prop === 'assertDid') return PREVIEW_DEMO_DID;
      return denyProxy();
    },
  }) as unknown as Agent;

const previewProvider = (): SessionProvider => ({
  restore: () => Promise.resolve(previewAgent()),
  signIn: () => Promise.resolve(),
  signOut: () => {
    exitPreviewDemo();
    return Promise.resolve();
  },
  forceRefresh: () => Promise.resolve({}),
});

/** The demo SessionBoot. THROWS off a preview origin — a real-looking session can
 * never be produced on production. */
export const mockSessionBoot = (loc: LocationLike = window.location): SessionBoot => {
  if (!isPreviewOrigin(loc)) {
    throw new Error('preview demo session refused: not a preview origin');
  }
  return { provider: previewProvider(), agent: previewAgent() };
};

/** A slim banner shown ONLY on preview builds: it labels the build and toggles
 * the demo session via `?demo`. On production and in tests (root path) it is a
 * no-op, so it never affects the real app. */
export const mountPreviewDemoBanner = (host: HTMLElement, loc: Location = window.location): void => {
  if (!isPreviewOrigin(loc)) return;
  const active = isPreviewDemoActive(loc);
  const bar = document.createElement('div');
  bar.className = 'preview-demo-banner';
  bar.dataset['testid'] = 'preview-demo-banner';

  const label = document.createElement('span');
  label.textContent = active
    ? 'Preview demo session — read-only, fake account. '
    : 'Preview build. ';
  const toggle = document.createElement('a');
  toggle.className = 'friend-link';
  const url = new URL(loc.href);
  if (active) {
    url.searchParams.set('demo', '0');
    toggle.textContent = 'exit demo';
  } else {
    url.searchParams.set('demo', '1');
    toggle.textContent = 'enter demo sign-in';
  }
  toggle.href = `${url.pathname}${url.search}`;
  toggle.dataset['testid'] = 'preview-demo-toggle';
  bar.append(label, toggle);
  host.prepend(bar);
};
