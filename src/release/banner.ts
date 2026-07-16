// The app-wide release banner (signed releases D7): a dismissible rust bar
// shown ONLY for bad release verdicts (unsigned/invalid) and ONLY on the
// production origin — an unsigned PR preview or local build is normal, so
// preview/loopback log instead of alarming. Bad = EITHER the fresh page-level
// origin check OR the verdict the SW recorded at activate; the two sources
// cross-check each other. Mounted from the shared nav shell, so this module
// is auth-free by construction (Browse ships it — the bundle-split guard
// enforces the import graph).

import type { ReleaseVerdict } from './config.js';
import type { VerifyOutcome } from './verify.js';
import type { OriginClass } from './origin.js';

const DISMISS_KEY = 'arecipe-release-banner-dismissed';
const BAD = new Set(['unsigned', 'invalid']);

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ReleaseBannerDeps = {
  originClass: OriginClass;
  /** Fresh page-level origin-manifest check. */
  check: () => Promise<VerifyOutcome>;
  /** The SW's recorded install-time verdict, from the shared config. */
  storedVerdict: () => Promise<ReleaseVerdict | undefined>;
  storage: StorageLike;
  log?: (message: string) => void;
};

export const mountReleaseBanner = async (
  host: HTMLElement,
  deps: ReleaseBannerDeps,
): Promise<void> => {
  let dismissed = false;
  try {
    dismissed = deps.storage.getItem(DISMISS_KEY) === '1';
  } catch {
    /* storage blocked → banner shows each load; safe direction */
  }
  if (dismissed) return;

  const [fresh, stored] = await Promise.all([deps.check(), deps.storedVerdict()]);
  const bad = [fresh.state, stored?.state].filter((s) => s !== undefined && BAD.has(s));
  if (bad.length === 0) return;

  const reason = fresh.state === 'invalid' ? fresh.reason : bad[0];
  if (deps.originClass !== 'production') {
    // Previews and local builds are unsigned by design — say so quietly.
    deps.log?.(`release check: ${bad[0] ?? 'bad'} (${reason ?? '—'}) — expected off production, not bannering`);
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'release-banner';
  banner.dataset['testid'] = 'release-banner';
  const label = document.createElement('span');
  label.textContent =
    fresh.state === 'invalid' || stored?.state === 'invalid'
      ? `This copy of arecipe couldn’t be verified — the release check failed (${reason ?? 'invalid'}). Details under Account → Release & version.`
      : 'This copy of arecipe is running an unsigned build on the production site. Details under Account → Release & version.';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'release-banner-dismiss';
  dismiss.dataset['testid'] = 'release-banner-dismiss';
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss for this session');
  dismiss.addEventListener('click', () => {
    banner.remove();
    try {
      deps.storage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: dismissal lives for this page only */
    }
  });
  banner.append(label, dismiss);
  host.prepend(banner);
};
