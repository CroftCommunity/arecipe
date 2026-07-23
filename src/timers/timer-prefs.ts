// Feature A (timers) — the one persisted preference: "notify me when a timer
// finishes." Default OFF (A-D4): the app never asks for notification permission
// on its own; the toggle is the only thing that may request it, and a denial is
// a permanent silent no. localStorage, defensive against private mode — same
// posture as social/prefs.ts.

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const NOTIFY_KEY = 'timer-notify';

export type TimerPrefs = {
  /** Has the user opted in to timer notifications? Default false. */
  notify: () => boolean;
  setNotify: (on: boolean) => void;
};

export const createTimerPrefs = (opts: { storage?: StorageLike } = {}): TimerPrefs => {
  const storage = opts.storage ?? window.localStorage;
  return {
    notify: () => {
      try {
        return storage.getItem(NOTIFY_KEY) === '1';
      } catch {
        return false;
      }
    },
    setNotify: (on) => {
      try {
        if (on) storage.setItem(NOTIFY_KEY, '1');
        else storage.removeItem(NOTIFY_KEY);
      } catch {
        /* private mode: the toggle lives for this page only */
      }
    },
  };
};
