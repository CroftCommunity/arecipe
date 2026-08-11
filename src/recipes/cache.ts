// IndexedDB recipe cache with Tier 2 CID verification (Phase 4a, per the D6
// decision). `verified` means the CID recomputed from the received record
// bytes (lex-JSON → DAG-CBOR → sha-256 → CIDv1) matches the PDS-reported
// CID — never set by trusting the PDS's word. A mismatch is a trust-surface
// event: stored as verified:false and logged at warn, never silent.
// Tier 3 (sync CAR + MST proof + commit signature) is a named later
// hardening item.

import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { log as defaultLogger, type Logger } from '../log.js';

export type CachedRecipe = {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
  verified: boolean;
  cachedAt: string;
};

/** lex-JSON → IPLD: {$link} becomes a CID, {$bytes} becomes bytes (D6 probe). */
const fromLexJson = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(fromLexJson);
  if (v !== null && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === '$link' && typeof obj['$link'] === 'string') {
      return CID.parse(obj['$link']);
    }
    if (keys.length === 1 && keys[0] === '$bytes' && typeof obj['$bytes'] === 'string') {
      return Uint8Array.from(atob(obj['$bytes']), (c) => c.charCodeAt(0));
    }
    return Object.fromEntries(keys.map((k) => [k, fromLexJson(obj[k])]));
  }
  return v;
};

/** Tier 2 verification: recompute the record's CID from its value. */
export const recomputeCid = async (value: Record<string, unknown>): Promise<string> => {
  const bytes = dagCbor.encode(fromLexJson(value));
  const hash = await sha256.digest(bytes);
  return CID.createV1(dagCbor.code, hash).toString();
};

type PutRecord = { uri: string; cid: string; value: Record<string, unknown> };

export type RecipeCache = {
  put: (record: PutRecord) => Promise<CachedRecipe>;
  /** Batch write: ONE connection + ONE transaction for the whole batch (a
   * per-record connection is pathological at corpus size — Phase 3 of the
   * 2026-08-06 sharding plan). Verification stays per record. */
  putMany: (records: PutRecord[]) => Promise<CachedRecipe[]>;
  get: (uri: string) => Promise<CachedRecipe | undefined>;
  list: () => Promise<CachedRecipe[]>;
  /** One cook's records via a key range over the `at://<did>/` uri prefix —
   * a small cook's read must not scan a corpus-sized store. */
  listByUriPrefix: (prefix: string) => Promise<CachedRecipe[]>;
};

const STORE = 'recipes';

const openDb = (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'uri' });
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

export const createRecipeCache = (
  options: { dbName?: string; logger?: Logger } = {},
): RecipeCache => {
  const dbName = options.dbName ?? 'arecipe';
  const logger = options.logger ?? defaultLogger;

  const verify = async (record: PutRecord): Promise<CachedRecipe> => {
    const recomputed = await recomputeCid(record.value);
    const verified = recomputed === record.cid;
    if (verified) {
      logger.debug('cache', 'cid verified', { uri: record.uri });
    } else {
      logger.warn('cache', 'cid mismatch — stored as unverified', {
        uri: record.uri,
        reported: record.cid,
        recomputed,
      });
    }
    return {
      uri: record.uri,
      cid: record.cid,
      value: record.value,
      verified,
      cachedAt: new Date().toISOString(),
    };
  };

  return {
    put: async (record) => {
      const entry = await verify(record);
      await inStore(dbName, 'readwrite', (store) => store.put(entry));
      return entry;
    },
    putMany: async (records) => {
      if (records.length === 0) return [];
      const entries: CachedRecipe[] = [];
      for (const record of records) entries.push(await verify(record));
      const db = await openDb(dbName);
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          for (const entry of entries) store.put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error as Error);
          tx.onabort = () => reject((tx.error as Error | null) ?? new Error('transaction aborted'));
        });
      } finally {
        db.close();
      }
      return entries;
    },
    get: (uri) => inStore(dbName, 'readonly', (store) => store.get(uri) as IDBRequest<CachedRecipe | undefined>),
    list: () => inStore(dbName, 'readonly', (store) => store.getAll() as IDBRequest<CachedRecipe[]>),
    listByUriPrefix: (prefix) =>
      inStore(
        dbName,
        'readonly',
        (store) =>
          store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)) as IDBRequest<CachedRecipe[]>,
      ),
  };
};
