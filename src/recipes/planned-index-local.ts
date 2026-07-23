// RUN-LAST-PLANNED — the local, fingerprinted cache of the derived index (D2).
// IndexedDB, following the drafts-local shape. This is a CACHE and never
// authoritative: it holds a serialized planned-index plus a `fingerprint` (the
// sorted content-identity of the source plans). On read, a caller who supplies a
// known fingerprint that disagrees with the stored one is told the cache is
// stale (undefined) rather than handed stale data — it fails closed. A caller
// with no fingerprint (a reader that never loads plan records — Browse, Cookbook,
// the recipe page — per D4) simply trusts whatever is cached.
//
// Exactly one writer (the Meals page, D3) ever calls `write`; every other page
// only `read`s. Nothing here fetches plan records, touches the PDS, or imports
// auth code — that is what keeps the Browse zero-auth guarantee intact.

import type { PlannedEntry } from './planned-index.js';

type StoredIndex = [string, PlannedEntry][];
type Stored = { key: string; index: StoredIndex; fingerprint: string[] };

export interface PlannedIndexCache {
  /** Read the cached index. Returns undefined when absent, or when a supplied
   * `fingerprint` disagrees with the stored one (stale → fail closed). */
  read: (opts?: { fingerprint?: readonly string[] }) => Promise<Map<string, PlannedEntry> | undefined>;
  /** Overwrite the cache with a freshly derived index and its fingerprint. */
  write: (index: Map<string, PlannedEntry>, fingerprint: readonly string[]) => Promise<void>;
}

const STORE = 'index';
const RECORD_KEY = 'planned-index';

const openDb = (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
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

/** Order-independent fingerprint equality (both are stored/compared sorted). */
const sameFingerprint = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const createPlannedIndexCache = (options: { dbName?: string } = {}): PlannedIndexCache => {
  const dbName = options.dbName ?? 'arecipe-planned-index';
  return {
    write: async (index, fingerprint) => {
      const record: Stored = {
        key: RECORD_KEY,
        index: [...index.entries()],
        fingerprint: [...fingerprint],
      };
      await inStore(dbName, 'readwrite', (store) => store.put(record));
    },
    read: async (opts) => {
      const record = await inStore(
        dbName,
        'readonly',
        (store) => store.get(RECORD_KEY) as IDBRequest<Stored | undefined>,
      );
      if (record === undefined) return undefined;
      const known = opts?.fingerprint;
      if (known !== undefined && !sameFingerprint(record.fingerprint, known)) return undefined;
      return new Map(record.index);
    },
  };
};
