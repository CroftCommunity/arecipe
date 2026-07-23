// "Cookbook" settings prefs. A viewer-side display toggle for the export
// affordance beside the "Cookbook" title, stored in localStorage with the same
// defensive posture as the social/starter prefs: storage failure (private mode)
// degrades to defaults, never crashes. The export button is HIDDEN by default —
// the user opts in via Settings → Cookbook → "Show export".

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SHOW_EXPORT_KEY = 'cookbook-show-export';

export type CookbookPrefs = {
  /** Whether the export button beside the Cookbook title is shown. Default OFF. */
  showExport: () => boolean;
  setShowExport: (show: boolean) => void;
};

export const createCookbookPrefs = (opts: { storage?: StorageLike } = {}): CookbookPrefs => {
  const storage = opts.storage ?? window.localStorage;
  return {
    showExport: () => {
      try {
        return storage.getItem(SHOW_EXPORT_KEY) === '1';
      } catch {
        return false;
      }
    },
    setShowExport: (show) => {
      try {
        if (show) storage.setItem(SHOW_EXPORT_KEY, '1');
        else storage.removeItem(SHOW_EXPORT_KEY);
      } catch {
        /* private mode: the toggle lives for this page only */
      }
    },
  };
};
