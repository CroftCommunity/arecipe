// Feature B (seasonality) — settings store. One toggle (default ON) and an
// explicit region (default a labelled constant — B-D2). Off means the badge,
// the strip, and the boost all disappear and ranking is the pre-feature
// baseline. localStorage, defensive against private mode.

import { DEFAULT_REGION, REGIONS, type RegionId } from './produce.js';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const ENABLED_KEY = 'seasonality-enabled';
const REGION_KEY = 'seasonality-region';

const isRegion = (v: string | null): v is RegionId => REGIONS.some((r) => r.id === v);

export type SeasonalityPrefs = {
  /** Whole feature on/off. Default ON — unset (or anything but '0') → enabled. */
  enabled: () => boolean;
  setEnabled: (on: boolean) => void;
  /** The explicit region. Unknown/absent → the documented default. */
  region: () => RegionId;
  setRegion: (region: RegionId) => void;
};

export const createSeasonalityPrefs = (opts: { storage?: StorageLike } = {}): SeasonalityPrefs => {
  const storage = opts.storage ?? window.localStorage;
  return {
    enabled: () => {
      try {
        return storage.getItem(ENABLED_KEY) !== '0';
      } catch {
        return true;
      }
    },
    setEnabled: (on) => {
      try {
        if (on) storage.removeItem(ENABLED_KEY);
        else storage.setItem(ENABLED_KEY, '0');
      } catch {
        /* private mode: the toggle lives for this page only */
      }
    },
    region: () => {
      try {
        const v = storage.getItem(REGION_KEY);
        return isRegion(v) ? v : DEFAULT_REGION;
      } catch {
        return DEFAULT_REGION;
      }
    },
    setRegion: (region) => {
      try {
        storage.setItem(REGION_KEY, region);
      } catch {
        /* private mode: the choice lives for this page only */
      }
    },
  };
};
