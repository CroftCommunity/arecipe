// D3: revalidate each cook against its PDS by repo revision. Per cook, ONE
// getLatestCommit; compare to the manifest rev:
//   - equal      → done, nothing else fetched for that cook this session
//   - different  → refetch records (listRecords), store the delta, live wins
//   - 4xx (gone) → the repo is deactivated/removed; drop it from the live view
//   - reject     → transient; keep the snapshot, never throw
//
// Scheduling: cap concurrency at 4, process cooks in the ORDER GIVEN (the caller
// passes viewport cooks first, then the rest during idle time). A cross-session
// debounce (lastRevalidatedAt) skips a cook that was revalidated within the
// window; the app's explicit refresh (force:true) always bypasses it. A failed
// revalidation is not an error state — the snapshot keeps serving.
//
// Deliberately uses listRecords, not the getRepo?since= CAR diff: the diff path
// means shipping CAR + DAG-CBOR decoding for a corpus whose whole premise is it
// rarely changes. See the run summary for the tradeoff + revisit trigger.

import { log as defaultLogger, type Logger } from '../log.js';
import { getLatestCommit, GetLatestCommitError } from './sync.js';
import type { SnapshotStore } from './store.js';

export type RevalidateCook = { did: string; handle: string; displayName?: string; pds: string; rev: string };
export type LiveIdentity = { handle: string; displayName?: string };
export type RevalidateStatus = 'unchanged' | 'changed' | 'debounced' | 'gone' | 'error';
export type RevalidateOutcome = { did: string; status: RevalidateStatus; records?: RecordLike[] };

type RecordLike = { uri: string; cid: string; value: Record<string, unknown> };

export type RevalidateDeps = {
  store: SnapshotStore;
  readRecords: (target: { pds: string; did: string }) => Promise<RecordLike[]>;
  fetchFn?: typeof fetch;
  now?: () => number;
  concurrency?: number;
  /** Cross-session debounce window (O2 default 60 min, set by the caller). */
  debounceMs?: number;
  /** The explicit refresh control bypasses the debounce entirely. */
  force?: boolean;
  onChanged?: (did: string, records: RecordLike[]) => void | Promise<void>;
  onGone?: (did: string) => void | Promise<void>;
  /** D4: identity is provisional in the snapshot. When provided, the live DID
   * doc is re-resolved — but only when a cook actually changed or the user
   * forced a refresh, so the routine warm path stays ONE request per cook. When
   * the live handle/displayName disagrees, onIdentity fires and live wins. */
  resolveIdentity?: (did: string) => Promise<LiveIdentity | null>;
  onIdentity?: (did: string, identity: LiveIdentity) => void | Promise<void>;
  logger?: Logger;
};

const DEFAULT_DEBOUNCE_MS = 60 * 60 * 1000; // O2: 60 minutes

/** Run tasks with a fixed concurrency cap, preserving input order for start. */
const pool = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!);
    }
  });
  await Promise.all(runners);
  return results;
};

export const revalidateCooks = async (
  cooks: RevalidateCook[],
  deps: RevalidateDeps,
): Promise<RevalidateOutcome[]> => {
  const now = deps.now ?? (() => Date.now());
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const logger = deps.logger ?? defaultLogger;

  const revalidateOne = async (cook: RevalidateCook): Promise<RevalidateOutcome> => {
    if (!deps.force && debounceMs > 0) {
      const last = await deps.store.getLastRevalidatedAt(cook.did);
      if (last !== null && now() - last < debounceMs) return { did: cook.did, status: 'debounced' };
    }

    let live;
    try {
      live = await getLatestCommit({ fetchFn: deps.fetchFn, pds: cook.pds, did: cook.did });
    } catch (err) {
      // A 4xx means the repo is deactivated/removed — drop it from the live view
      // for this session (D4). Anything else is transient: keep the snapshot.
      const status = err instanceof GetLatestCommitError ? err.status : 0;
      if (status >= 400 && status < 500) {
        await deps.store.setLastRevalidatedAt(cook.did, now());
        await deps.onGone?.(cook.did);
        logger.info('snapshot', 'cook repo gone/deactivated — removed from live view', { did: cook.did, status });
        return { did: cook.did, status: 'gone' };
      }
      logger.warn('snapshot', 'rev check failed — keeping snapshot', { did: cook.did, error: String(err) });
      return { did: cook.did, status: 'error' };
    }

    await deps.store.setLastRevalidatedAt(cook.did, now());
    const changed = live.rev !== cook.rev;

    // D4 identity: only when the repo changed or the user forced a refresh (so
    // the routine warm path stays one request per cook). Live wins in place.
    if (deps.resolveIdentity !== undefined && (changed || deps.force === true)) {
      try {
        const id = await deps.resolveIdentity(cook.did);
        if (id !== null && (id.handle !== cook.handle || (id.displayName !== undefined && id.displayName !== cook.displayName))) {
          await deps.onIdentity?.(cook.did, id);
        }
      } catch (err) {
        logger.warn('snapshot', 'identity re-resolve failed — keeping provisional', { did: cook.did, error: String(err) });
      }
    }

    if (!changed) return { did: cook.did, status: 'unchanged' };

    // Changed: refetch and replace. A failure here still keeps the snapshot.
    try {
      const records = await deps.readRecords({ pds: cook.pds, did: cook.did });
      await deps.store.putDelta(cook.did, live.rev, records);
      await deps.onChanged?.(cook.did, records);
      return { did: cook.did, status: 'changed', records };
    } catch (err) {
      logger.warn('snapshot', 'refetch failed — keeping snapshot', { did: cook.did, error: String(err) });
      return { did: cook.did, status: 'error' };
    }
  };

  return pool(cooks, deps.concurrency ?? 4, revalidateOne);
};
