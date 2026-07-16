// Build visibility (M1-checkpoint rider on the bundle decision): the shell
// footer always shows which build is running and how big it is, and the same
// facts are logged at startup. This is the mealplanner visible-version-stamp
// pattern, upgraded into the trust story — at Phase 11 the stamp's version is
// what the signed manifest attests.

import { log } from './log.js';
import { createReleaseConfig } from './release/config.js';

export type BuildInfo = {
  version: string;
  builtAt: string;
  mainBytes: number;
  mainGzipBytes: number;
};

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

export const formatBuildStamp = (info: BuildInfo): string =>
  `v${info.version} · ${kb(info.mainBytes)} (${kb(info.mainGzipBytes)} gz)`;

export type BuildStampDeps = {
  /** The device-local version pin, if set (signed releases D4): a pinned
   * install shows the RUNNING (locked) version, never network build-info —
   * the network would advertise exactly the upgrade the pin refuses. */
  lockedVersion?: () => Promise<string | null>;
  fetchFn?: typeof fetch;
};

const defaultLockedVersion = (): Promise<string | null> =>
  createReleaseConfig()
    .load()
    .then((cfg) => cfg.lockedVersion ?? null)
    .catch(() => null);

/** Fetch build-info.json (emitted by scripts/build.mjs) and mount the footer stamp + colophon. */
export const mountBuildStamp = async (
  parent: HTMLElement,
  deps: BuildStampDeps = {},
): Promise<void> => {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  const stamp = document.createElement('p');
  stamp.dataset['testid'] = 'build-stamp';

  // Colophon: copyright + source, one action (the whole line is the link).
  const colophon = document.createElement('a');
  colophon.className = 'colophon';
  colophon.dataset['testid'] = 'colophon';
  colophon.href = 'https://github.com/CroftCommunity/arecipe';
  colophon.rel = 'noopener';
  const ghIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ghIcon.setAttribute('viewBox', '0 0 16 16');
  ghIcon.setAttribute('width', '12');
  ghIcon.setAttribute('height', '12');
  ghIcon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z',
  );
  path.setAttribute('fill', 'currentColor');
  ghIcon.append(path);
  colophon.append(document.createTextNode('© 2026 Chase Pettet · '), ghIcon, document.createTextNode(' source'));

  footer.append(stamp, colophon);
  parent.append(footer);
  try {
    const locked = await (deps.lockedVersion ?? defaultLockedVersion)();
    if (locked !== null) {
      stamp.textContent = `v${locked} · version locked`;
      log.info('build', 'running locked build', { lockedVersion: locked });
      return;
    }
    const res = await (deps.fetchFn ?? fetch)('./build-info.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = (await res.json()) as BuildInfo;
    stamp.textContent = formatBuildStamp(info);
    log.info('build', 'running build', { ...info });
  } catch (err) {
    // A missing stamp is a build-pipeline defect — say so, don't hide it.
    stamp.textContent = 'build info unavailable';
    log.warn('build', 'build-info.json missing or invalid', { error: String(err) });
  }
};
