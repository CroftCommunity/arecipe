// Cook follows — PDS tier (D3). Public per-cook app.arecipe.cookFollow records,
// mirroring app.bsky.graph.follow's shape ({ subject, createdAt }) and read path
// (public listRecords on your own repo — the identical unauthenticated,
// CORS-open path resolveCookbook already uses for bsky follows). Follow =
// createRecord, unfollow = deleteRecord (rkey resolved by subject), list =
// listRecords. Writes go through the session Agent (auth-bearing pages only); the
// list/mirror reads take an injectable fetchFn and never need a session.
//
// D5: the local store is the universal read model. mirrorCookFollowsDown pulls
// the PDS records into the local store on a signed-in load.
//
// D2/D3 (2026-07-16 hardening): the mirror is now RECONCILING, not add-only. It
// stamps each PDS record's rkey onto the local row (the D1 published marker),
// PRUNES marked local rows the PDS no longer has (a remote unfollow made on
// another device), and leaves unmarked local-only rows alone (D6 offer
// material). publishCookFollow is adopt-first: it never creates a duplicate for
// a subject the PDS already has — making publish idempotent under double-tap and
// migrating pre-marker rows.
//
// Known bound (D8): listCookFollows reads a single listRecords page (limit=100),
// so reconciliation covers up to 100 follows; paginating past that is deferred.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import type { CookFollowsLocal } from './cook-follows-local.js';

export const COOK_FOLLOW_COLLECTION = 'app.arecipe.cookFollow';

/** One cookFollow record as read from a PDS: the rkey (for delete), the followed
 *  cook's DID, and the record AT-URI. */
export type PdsCookFollow = { rkey: string; subject: string; uri: string };

const rkeyFromUri = (uri: string): string => uri.split('/').pop() ?? uri;

/** List the account's cook follows via public listRecords (own repo, unauth).
 *  Skips records missing a `subject` (open-world tolerance). */
export const listCookFollows = async (
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<PdsCookFollow[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${COOK_FOLLOW_COLLECTION}&limit=100`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`cookFollow list failed (HTTP ${res.status})`);
  const body = (await res.json()) as {
    records?: { uri: string; value?: { subject?: unknown } }[];
  };
  const follows: PdsCookFollow[] = [];
  for (const record of body.records ?? []) {
    const subject = record.value?.subject;
    if (typeof subject !== 'string') continue;
    follows.push({ rkey: rkeyFromUri(record.uri), subject, uri: record.uri });
  }
  return follows;
};

/** Publish a public follow of `subject`. Rkey is PDS-minted (a TID). */
export const followCook = async (
  agent: Agent,
  subject: string,
): Promise<{ uri: string; cid: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to follow from');
  const record = { $type: COOK_FOLLOW_COLLECTION, subject, createdAt: new Date().toISOString() };
  log.info('cook-follows', 'following', { subject });
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: COOK_FOLLOW_COLLECTION,
    record,
  });
  log.info('cook-follows', 'followed', { uri: res.data.uri });
  return { uri: res.data.uri, cid: res.data.cid };
};

/** Delete the follow of `subject`: resolve its rkey via listRecords, then
 *  deleteRecord. A no-op when no matching record exists (already unfollowed). */
export const unfollowCook = async (
  agent: Agent,
  subject: string,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to unfollow from');
  const follows = await listCookFollows(target, opts);
  const match = follows.find((f) => f.subject === subject);
  if (match === undefined) {
    log.debug('cook-follows', 'unfollow skipped — no record', { subject });
    return;
  }
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COOK_FOLLOW_COLLECTION,
    rkey: match.rkey,
  });
  log.info('cook-follows', 'unfollowed', { subject, rkey: match.rkey });
};

/** Reconcile the PDS cook follows into the local store (D2/D5). For each PDS
 *  record: upsert the row (first-write-wins keeps a resolved handle) and stamp
 *  its rkey as the published marker. Then PRUNE any marked local row whose rkey
 *  is gone from the PDS list — that follow was deleted remotely (another
 *  device's unfollow) and must not survive or be re-offered. Unmarked
 *  (local-only) rows are untouched — they are the D6 publish offer's material.
 *  The subject DID is the handle placeholder; display resolves the real handle. */
export const mirrorCookFollowsDown = async (
  local: CookFollowsLocal,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<void> => {
  const follows = await listCookFollows(target, opts);
  const pdsRkeys = new Set(follows.map((f) => f.rkey));
  // (a) upsert + stamp every PDS record (re-stamp handles a rotated rkey).
  for (const f of follows) {
    local.add({ did: f.subject, handle: f.subject });
    local.markPublished(f.subject, f.rkey);
  }
  // (b) prune marked rows the PDS no longer has (reconcile a remote unfollow).
  let pruned = 0;
  for (const row of local.list()) {
    if (row.publishedRkey !== undefined && !pdsRkeys.has(row.publishedRkey)) {
      local.remove(row.did);
      pruned += 1;
    }
  }
  log.debug('cook-follows', 'mirrored down', { count: follows.length, pruned });
};

/** Adopt-first publish of a local-only follow (D3). Checks the fresh PDS list
 *  for `subject`: if a record already exists, ADOPT it (stamp the marker, no
 *  write); else createRecord and stamp the new rkey. Idempotent under
 *  double-tap, and migrates pre-marker rows (they adopt on first publish rather
 *  than duplicating). Stamps the local store either way. */
export const publishCookFollow = async (
  agent: Agent,
  subject: string,
  local: CookFollowsLocal,
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<{ rkey: string; adopted: boolean }> => {
  const existing = await listCookFollows(target, opts);
  const match = existing.find((f) => f.subject === subject);
  if (match !== undefined) {
    log.info('cook-follows', 'adopting existing record on publish', { subject, rkey: match.rkey });
    local.markPublished(subject, match.rkey);
    return { rkey: match.rkey, adopted: true };
  }
  const { uri } = await followCook(agent, subject);
  const rkey = rkeyFromUri(uri);
  local.markPublished(subject, rkey);
  return { rkey, adopted: false };
};
