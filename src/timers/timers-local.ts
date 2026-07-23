// Feature A (timers) — device-scoped persistence (A-D1). IndexedDB only, mirror
// of drafts-local.ts's shape. Timers are ephemeral device state: they survive
// navigation and reload so the rice keeps running while you go look at the meal
// plan, but they are NEVER written to the PDS — a timer is not a record.
//
// What is stored is the Timer as-is (absolute `endsAt`); there is deliberately
// no "remaining" field to persist, so nothing can drift (A1 / A4.1).

import { log } from '../log.js';
import type { Timer } from './timer-state.js';

export type TimerStore = {
  save: (timer: Timer) => Promise<Timer>;
  list: () => Promise<Timer[]>;
  remove: (id: string) => Promise<void>;
};

const STORE = 'timers';

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

export const createTimerStore = (options: { dbName?: string } = {}): TimerStore => {
  const dbName = options.dbName ?? 'arecipe-timers';
  return {
    save: async (timer) => {
      await inStore(dbName, 'readwrite', (store) => store.put(timer));
      log.debug('timers', 'saved', { id: timer.id, endsAt: timer.endsAt });
      return timer;
    },
    list: async () => {
      const all = await inStore(dbName, 'readonly', (store) => store.getAll() as IDBRequest<Timer[]>);
      // Oldest-first: the order they were started reads naturally in a list.
      return all.sort((a, b) => a.createdAt - b.createdAt);
    },
    remove: async (id) => {
      await inStore(dbName, 'readwrite', (store) => store.delete(id));
      log.debug('timers', 'removed', { id });
    },
  };
};
