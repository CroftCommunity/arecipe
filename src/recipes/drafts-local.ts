// Local-first drafts (Phase 6): "build a recipe and save it without
// publishing it yet." IndexedDB only — nothing here touches the network or
// the PDS; Phase 8 layers PDS sync (eviction survival) on top.

import { log } from '../log.js';
import type { EditorFields } from './write.js';

/** A draft's authoring status (Phase 11b). `published` is NOT here — it is a
 * DERIVED meta-status (a recipe reads as published because it lives in the
 * Published section), never stored on or chosen for a draft (OQ13). */
export type DraftStatus = 'draft' | 'cooking' | 'ready';

export type Draft = {
  id: string;
  fields: EditorFields;
  savedAt: string;
  status: DraftStatus;
};

export type DraftStore = {
  save: (fields: EditorFields, id?: string, status?: DraftStatus) => Promise<Draft>;
  get: (id: string) => Promise<Draft | undefined>;
  list: () => Promise<Draft[]>;
  remove: (id: string) => Promise<void>;
};

/** Read-tolerate legacy drafts saved before status existed: default to 'draft'. */
const withStatus = (d: Draft): Draft => ({ ...d, status: d.status ?? 'draft' });

const STORE = 'drafts';

const openDb = (dbName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
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

export const createDraftStore = (options: { dbName?: string } = {}): DraftStore => {
  const dbName = options.dbName ?? 'arecipe-drafts';
  return {
    save: async (fields, id, status) => {
      const draft: Draft = {
        id: id ?? crypto.randomUUID(),
        fields,
        savedAt: new Date().toISOString(),
        status: status ?? 'draft', // default when unspecified (new draft)
      };
      await inStore(dbName, 'readwrite', (store) => store.put(draft));
      log.debug('drafts', 'saved', { id: draft.id, status: draft.status });
      return draft;
    },
    get: async (id) => {
      const d = await inStore(dbName, 'readonly', (store) => store.get(id) as IDBRequest<Draft | undefined>);
      return d === undefined ? undefined : withStatus(d);
    },
    list: async () => {
      const all = await inStore(dbName, 'readonly', (store) => store.getAll() as IDBRequest<Draft[]>);
      return all.map(withStatus).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    },
    remove: async (id) => {
      await inStore(dbName, 'readwrite', (store) => store.delete(id));
      log.debug('drafts', 'removed', { id });
    },
  };
};
