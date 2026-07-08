// "Social" settings prefs (Phase 9b). Viewer-side display toggles, stored in
// localStorage with the same defensive posture as exclusions/starter prefs:
// storage failure (private mode) degrades to defaults, never crashes. Toggles
// are OFF by default (the social surfaces show). Hide Comments is wired in 9b;
// Hide Likes lands in 9c on this same store (the key is reserved here).

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const HIDE_COMMENTS_KEY = 'social-hide-comments';

export type SocialPrefs = {
  hideComments: () => boolean;
  setHideComments: (hidden: boolean) => void;
};

export const createSocialPrefs = (opts: { storage?: StorageLike } = {}): SocialPrefs => {
  const storage = opts.storage ?? window.localStorage;
  const read = (key: string): boolean => {
    try {
      return storage.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  const write = (key: string, on: boolean): void => {
    try {
      if (on) storage.setItem(key, '1');
      else storage.removeItem(key);
    } catch {
      /* private mode: the toggle lives for this page only */
    }
  };
  return {
    hideComments: () => read(HIDE_COMMENTS_KEY),
    setHideComments: (hidden) => write(HIDE_COMMENTS_KEY, hidden),
  };
};
