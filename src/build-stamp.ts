// Build visibility (M1-checkpoint rider on the bundle decision): the shell
// footer always shows which build is running and how big it is, and the same
// facts are logged at startup. This is the mealplanner visible-version-stamp
// pattern, upgraded into the trust story — at Phase 11 the stamp's version is
// what the signed manifest attests.

import { log } from './log.js';

export type BuildInfo = {
  version: string;
  builtAt: string;
  mainBytes: number;
  mainGzipBytes: number;
};

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

export const formatBuildStamp = (info: BuildInfo): string =>
  `v${info.version} · ${kb(info.mainBytes)} (${kb(info.mainGzipBytes)} gz)`;

/** Fetch build-info.json (emitted by scripts/build.mjs) and mount the footer stamp. */
export const mountBuildStamp = async (parent: HTMLElement): Promise<void> => {
  const stamp = document.createElement('footer');
  stamp.dataset['testid'] = 'build-stamp';
  parent.append(stamp);
  try {
    const res = await fetch('./build-info.json');
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
