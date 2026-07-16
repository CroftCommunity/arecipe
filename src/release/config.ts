// The shared release config (signed releases D3): one tiny IndexedDB record
// read by BOTH the page and the service worker — localStorage is invisible to
// a SW, IDB is the storage they share. DEVICE-LOCAL by ruling: the version pin
// references a device-local cache another install may never have had, so
// neither setting ever roams (never written to the PDS).

export type ReleaseVerdict = {
  state: 'verified' | 'stale-mismatch' | 'unsigned' | 'invalid' | 'unchecked';
  reason?: string;
  /** The build the verdict is ABOUT (the SW's own version at activate). */
  version?: string;
  checkedAt: string;
};

export type ReleaseConfig = {
  /** D4: the pin — serve this version's cache regardless of what activates
   * above it. Unset = no pin (the default). */
  lockedVersion?: string;
  /** D5: install-only-verified. ON by default. */
  requireVerified: boolean;
  /** The newest version that verified on THIS device — the enforcement
   * fallback target. Its cache is never deleted. */
  lastVerifiedVersion?: string;
  /** The install-time verdict recorded by the SW at activate. */
  verdict?: ReleaseVerdict;
};

const DEFAULTS: ReleaseConfig = { requireVerified: true };
const STORE = 'config';
const KEY = 'v1';

const openDb = (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as Error);
  });

const inStore = async <T>(
  dbName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb(dbName);
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as Error);
    });
  } finally {
    db.close();
  }
};

export type ReleaseConfigStore = {
  load: () => Promise<ReleaseConfig>;
  /** Merge a patch; a key explicitly present with value `undefined` clears
   * that field (how unpin works). */
  save: (patch: Partial<ReleaseConfig>) => Promise<ReleaseConfig>;
};

export const createReleaseConfig = (options: { dbName?: string } = {}): ReleaseConfigStore => {
  const dbName = options.dbName ?? 'arecipe-release';
  const load = async (): Promise<ReleaseConfig> => {
    const stored = await inStore(
      dbName,
      'readonly',
      (store) => store.get(KEY) as IDBRequest<Partial<ReleaseConfig> | undefined>,
    );
    return { ...DEFAULTS, ...stored };
  };
  return {
    load,
    save: async (patch) => {
      const next: ReleaseConfig = { ...(await load()), ...patch };
      for (const key of Object.keys(next) as (keyof ReleaseConfig)[]) {
        if (next[key] === undefined) delete next[key];
      }
      await inStore(dbName, 'readwrite', (store) => store.put(next, KEY));
      return next;
    },
  };
};
