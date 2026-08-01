// D3/D5: IndexedDB for revalidation state. Two stores in the `arecipe-snapshot`
// DB (kept separate from the recipe cache's `arecipe` DB so its schema evolves
// independently):
//   - meta:   { key: "<buildId>|<did>", lastRevalidatedAt }  — debounce clock
//   - deltas: { key: "<buildId>|<did>|<rev>", records }       — refetched records
// EVERY key is build-scoped (buildId prefix), so a build change never mixes
// deltas across snapshot generations (D5). The snapshot is a cache, never an
// authority — nothing here is trusted once live data arrives.

const DB = 'arecipe-snapshot';
const META = 'meta';
const DELTAS = 'deltas';

const openDb = (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(DELTAS)) db.createObjectStore(DELTAS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error as Error);
  });

const inStore = async <T>(
  dbName: string,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb(dbName);
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(storeName, mode).objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error as Error);
    });
  } finally {
    db.close();
  }
};

export type SnapshotStore = {
  getLastRevalidatedAt: (did: string) => Promise<number | null>;
  setLastRevalidatedAt: (did: string, ts: number) => Promise<void>;
  putDelta: (did: string, rev: string, records: unknown[]) => Promise<void>;
  getDelta: (did: string, rev: string) => Promise<unknown[] | undefined>;
  /** The newest delta stored for a cook (the last `putDelta`), or null. This is
   * what lets a returning session paint the last-known-live corpus over the
   * stale bundle even while the rev-check debounce is still active — without it,
   * `putDelta` would be write-only and every boot would fall back to the bundle
   * (and its stale count) until a fresh, un-debounced revalidation completed. */
  getLatestDelta: (did: string) => Promise<{ rev: string; records: unknown[] } | null>;
};

export const createSnapshotStore = (opts: { buildId: string; dbName?: string }): SnapshotStore => {
  const dbName = opts.dbName ?? DB;
  const metaKey = (did: string) => `${opts.buildId}|${did}`;
  const deltaKey = (did: string, rev: string) => `${opts.buildId}|${did}|${rev}`;
  // The latest-delta pointer lives under its own meta key (suffix guards against
  // ever colliding with `metaKey`, which holds the debounce clock) so writing a
  // delta never clobbers lastRevalidatedAt and vice versa.
  const latestRevKey = (did: string) => `${opts.buildId}|${did}|@latest`;

  return {
    getLastRevalidatedAt: async (did) => {
      const row = await inStore<{ key: string; lastRevalidatedAt: number } | undefined>(
        dbName,
        META,
        'readonly',
        (s) => s.get(metaKey(did)) as IDBRequest<{ key: string; lastRevalidatedAt: number } | undefined>,
      );
      return row?.lastRevalidatedAt ?? null;
    },
    setLastRevalidatedAt: async (did, ts) => {
      await inStore(dbName, META, 'readwrite', (s) => s.put({ key: metaKey(did), lastRevalidatedAt: ts }));
    },
    putDelta: async (did, rev, records) => {
      await inStore(dbName, DELTAS, 'readwrite', (s) => s.put({ key: deltaKey(did, rev), records }));
      // Remember this as the cook's newest delta so getLatestDelta can find it
      // on a later boot without knowing the rev up front.
      await inStore(dbName, META, 'readwrite', (s) => s.put({ key: latestRevKey(did), rev }));
    },
    getDelta: async (did, rev) => {
      const row = await inStore<{ key: string; records: unknown[] } | undefined>(
        dbName,
        DELTAS,
        'readonly',
        (s) => s.get(deltaKey(did, rev)) as IDBRequest<{ key: string; records: unknown[] } | undefined>,
      );
      return row?.records;
    },
    getLatestDelta: async (did) => {
      const pointer = await inStore<{ key: string; rev: string } | undefined>(
        dbName,
        META,
        'readonly',
        (s) => s.get(latestRevKey(did)) as IDBRequest<{ key: string; rev: string } | undefined>,
      );
      if (pointer === undefined) return null;
      const records = await inStore<{ key: string; records: unknown[] } | undefined>(
        dbName,
        DELTAS,
        'readonly',
        (s) => s.get(deltaKey(did, pointer.rev)) as IDBRequest<{ key: string; records: unknown[] } | undefined>,
      );
      if (records === undefined) return null;
      return { rev: pointer.rev, records: records.records };
    },
  };
};
