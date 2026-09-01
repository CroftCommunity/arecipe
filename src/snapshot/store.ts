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
  /** Hydration marker (recipe-loading perf): the uris a cook's snapshot shard
   * wrote into the recipe cache, so a later boot on the SAME build serves the
   * cook from IndexedDB instead of refetching/reverifying the shard. null =
   * not hydrated this build. */
  getHydratedUris: (did: string) => Promise<string[] | null>;
  setHydratedUris: (did: string, uris: string[]) => Promise<void>;
};

export const createSnapshotStore = (opts: { buildId: string; dbName?: string }): SnapshotStore => {
  const dbName = opts.dbName ?? DB;
  const metaKey = (did: string) => `${opts.buildId}|${did}`;
  const deltaKey = (did: string, rev: string) => `${opts.buildId}|${did}|${rev}`;
  // Distinct prefix — a DID contains no '|', so this can never collide with a
  // metaKey row.
  const hydratedKey = (did: string) => `${opts.buildId}|hydrated|${did}`;

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
    },
    getHydratedUris: async (did) => {
      const row = await inStore<{ key: string; uris: string[] } | undefined>(
        dbName,
        META,
        'readonly',
        (s) => s.get(hydratedKey(did)) as IDBRequest<{ key: string; uris: string[] } | undefined>,
      );
      return row?.uris ?? null;
    },
    setHydratedUris: async (did, uris) => {
      await inStore(dbName, META, 'readwrite', (s) => s.put({ key: hydratedKey(did), uris }));
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
  };
};
