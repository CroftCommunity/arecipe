// Account danger zone — the data wipe (plan 2026-07-16-5). Two halves:
//  - PDS: enumerate the repo's collections (describeRepo), keep ONLY the
//    app.arecipe.* prefix, page every rkey (listRecords), delete in
//    applyWrites batches. exchange.recipe.* — and anything else, e.g.
//    app.bsky.* — survives by construction, not by a denylist.
//  - Local: clear localStorage (settings/prefs/hints), delete our IndexedDB
//    databases, drop the service worker's arecipe-* caches.
// A wipe is NOT a sign-out: the OAuth library's own session store is
// deliberately untouched; the post-wipe reload restores the session and the
// boot flow re-stamps the landing hint.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';

export const ARECIPE_NSID_PREFIX = 'app.arecipe.';

/** Our IndexedDB databases: the recipe cache (recipes/cache.ts) and the local
 * drafts store (recipes/drafts-local.ts). */
export const ARECIPE_DBS = ['arecipe', 'arecipe-drafts'] as const;

/** applyWrites caps a call at 200 writes. */
const DELETE_BATCH = 200;

export type WipeProgress = (message: string) => void;

/** The repo's app.arecipe.* collections (and only those). */
export const listArecipeCollections = async (agent: Agent, did: string): Promise<string[]> => {
  const res = await agent.com.atproto.repo.describeRepo({ repo: did });
  return res.data.collections.filter((c) => c.startsWith(ARECIPE_NSID_PREFIX));
};

/** Every rkey of a collection, following cursors to the end BEFORE deleting
 * anything (deleting while paging would invalidate the cursor). */
const listAllRkeys = async (agent: Agent, did: string, collection: string): Promise<string[]> => {
  const rkeys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    for (const record of res.data.records) {
      const rkey = record.uri.split('/').pop() ?? '';
      if (rkey !== '') rkeys.push(rkey);
    }
    cursor = res.data.cursor;
    if (cursor === undefined || res.data.records.length === 0) return rkeys;
  }
};

/** Delete every app.arecipe.* record in the signed-in repo. Returns the count
 * deleted. Fails loud (throws) on the first PDS error — the caller reports it;
 * nothing local has been touched yet (PDS-first order, D3). */
export const wipePdsArecipeData = async (
  agent: Agent,
  onProgress: WipeProgress = () => {},
): Promise<number> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to wipe');
  const collections = await listArecipeCollections(agent, did);
  let total = 0;
  for (const collection of collections) {
    const rkeys = await listAllRkeys(agent, did, collection);
    for (let i = 0; i < rkeys.length; i += DELETE_BATCH) {
      const chunk = rkeys.slice(i, i + DELETE_BATCH);
      await agent.com.atproto.repo.applyWrites({
        repo: did,
        writes: chunk.map((rkey) => ({
          $type: 'com.atproto.repo.applyWrites#delete' as const,
          collection,
          rkey,
        })),
      });
      total += chunk.length;
      onProgress(`Deleted ${total} record${total === 1 ? '' : 's'}…`);
    }
    log.info('wipe', 'collection cleared', { collection, count: rkeys.length });
  }
  return total;
};

type CacheStoreLike = { keys: () => Promise<string[]>; delete: (name: string) => Promise<boolean> };

export type LocalWipeDeps = {
  storage?: Pick<Storage, 'clear'>;
  indexedDb?: Pick<IDBFactory, 'deleteDatabase'>;
  cacheStore?: CacheStoreLike;
};

const deleteDb = (idb: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = idb.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`deleteDatabase ${name} failed`));
    // Another tab holds the DB open: deletion completes once it closes; don't
    // hang the wipe on it — the reload path re-creates empty stores anyway.
    req.onblocked = () => resolve();
  });

/** Clear this device: all localStorage, our IndexedDB databases, and the
 * service worker's arecipe-* caches (the sw.ts naming scheme). */
export const wipeLocalData = async (deps: LocalWipeDeps = {}): Promise<void> => {
  const storage = deps.storage ?? window.localStorage;
  storage.clear();
  const idb = deps.indexedDb ?? window.indexedDB;
  for (const name of ARECIPE_DBS) await deleteDb(idb, name);
  const cacheStore = deps.cacheStore ?? (typeof caches === 'undefined' ? undefined : caches);
  if (cacheStore !== undefined) {
    for (const name of await cacheStore.keys()) {
      if (name.startsWith('arecipe-')) await cacheStore.delete(name);
    }
  }
  log.info('wipe', 'local data cleared', { dbs: ARECIPE_DBS.length });
};
