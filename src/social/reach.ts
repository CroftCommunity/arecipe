// Reach prefs (CB4): which cookbook sources stock your Cookbook — starter cooks
// + your Bluesky follows + your Bluesky followers. This is axis 1 of the two-axis
// social settings (axis 2 = social signals in prefs.ts; the like-graph DEPTH
// dial is deferred to CB6). Stored in localStorage with the same defensive
// posture as starter/social prefs: store the DISABLED set, so the default (all
// sources on) needs no storage and a read failure degrades to all-on. load()
// yields the ReachConfig that resolveCookbook consumes.

import type { ReachConfig } from './cookbook.js';

/** A toggleable cookbook source (the ReachConfig keys). */
export type ReachSource = keyof ReachConfig;
const SOURCES: readonly ReachSource[] = ['starters', 'added', 'follows', 'followers'];

const STORAGE_KEY = 'reach-sources-disabled';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ReachPrefs = {
  /** The ReachConfig resolveCookbook consumes (default: every source on). */
  load: () => ReachConfig;
  isEnabled: (source: ReachSource) => boolean;
  setEnabled: (source: ReachSource, enabled: boolean) => void;
};

export const createReachPrefs = (opts: { storage?: StorageLike } = {}): ReachPrefs => {
  const storage = opts.storage ?? window.localStorage;
  const readDisabled = (): Set<ReachSource> => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return new Set(raw === null ? [] : (JSON.parse(raw) as ReachSource[]));
    } catch {
      return new Set();
    }
  };
  const writeDisabled = (disabled: Set<ReachSource>): void => {
    try {
      if (disabled.size === 0) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
    } catch {
      /* private mode: toggles live for this page only */
    }
  };
  const isEnabled = (source: ReachSource): boolean => !readDisabled().has(source);
  return {
    isEnabled,
    load: () =>
      SOURCES.reduce(
        (config, source) => ({ ...config, [source]: isEnabled(source) }),
        {} as ReachConfig,
      ),
    setEnabled: (source, enabled) => {
      const disabled = readDisabled();
      if (enabled) disabled.delete(source);
      else disabled.add(source);
      writeDisabled(disabled);
    },
  };
};
