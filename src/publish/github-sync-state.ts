// Device-local last-sync state for the meals-page status indicator (D9). Tiny,
// non-secret: the outcome + timestamp of the last calendar republish, so the
// chip can show "synced · 2m ago" / "failed" / "syncing" across page loads.
// Defensive read (corrupt → unknown), like reach.ts.

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SyncStatus = 'unknown' | 'syncing' | 'synced' | 'error' | 'needs-token';

export type SyncState = {
  status: SyncStatus;
  /** ISO timestamp of the last terminal result (synced/error), if any. */
  at?: string;
  /** Short error detail when status === 'error'. */
  message?: string;
};

const STORAGE_KEY = 'arecipe.calendar-sync.v1';
const UNKNOWN: SyncState = { status: 'unknown' };
const STATUSES: readonly SyncStatus[] = ['unknown', 'syncing', 'synced', 'error', 'needs-token'];

export type SyncStateStore = {
  load: () => SyncState;
  set: (state: SyncState) => void;
};

export const createSyncStateStore = (opts: { storage?: StorageLike } = {}): SyncStateStore => {
  const storage = opts.storage ?? window.localStorage;
  return {
    load: () => {
      let raw: string | null;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        return { ...UNKNOWN };
      }
      if (raw === null) return { ...UNKNOWN };
      try {
        const parsed = JSON.parse(raw) as Partial<SyncState>;
        const status = STATUSES.includes(parsed.status as SyncStatus)
          ? (parsed.status as SyncStatus)
          : 'unknown';
        return {
          status,
          ...(typeof parsed.at === 'string' ? { at: parsed.at } : {}),
          ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
        };
      } catch {
        return { ...UNKNOWN };
      }
    },
    set: (state) => {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* private mode: state lives for this page only */
      }
    },
  };
};
