// Friends social graph (Phase 9a). app.arecipe.friend is our own lexicon (D8):
// a public follow naming a DID — { subject, createdAt }. Friends are readable
// by anyone (public listRecords) and written by the account owner through the
// session-provider Agent. Reads + pure helpers are unit-tested; the
// authenticated writes are proven in the @live tier (mirrors Phase 6).

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import { createResolver } from '../identity/resolve.js';
import { loadAuthorsFeed, type FeedAuthor } from './feed.js';

export const FRIEND_COLLECTION = 'app.arecipe.friend';

/** A friend record as read back from a repo. */
export type FriendRecord = { uri: string; subject: string; createdAt: string };

/** The record body written to the repo. */
export type FriendRecordOut = {
  $type: typeof FRIEND_COLLECTION;
  subject: string;
  createdAt: string;
};

/** Resolve a handle to at least a DID (createResolver's result satisfies this). */
export type ResolveFn = (handle: string) => Promise<{ did: string }>;

const isDid = (value: string): boolean => /^did:(plc|web):.+/.test(value);

/** Build a typed app.arecipe.friend record. Fails loud on a non-DID subject —
 * a friend names a resolvable atproto identity (D9: no unsigned path). */
export const buildFriendRecord = (subject: string): FriendRecordOut => {
  if (!isDid(subject)) throw new Error(`friend subject must be a DID, got "${subject}"`);
  return { $type: FRIEND_COLLECTION, subject, createdAt: new Date().toISOString() };
};

/** Read an account's public friends list (no auth: friend records are public). */
export const listFriends = async (
  target: { pds: string; did: string },
  opts: { fetchFn?: typeof fetch } = {},
): Promise<FriendRecord[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = `${target.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(target.did)}&collection=${encodeURIComponent(FRIEND_COLLECTION)}`;
  log.debug('friends', 'listing friends', { pds: target.pds, did: target.did });
  const res = await fetchFn(url);
  if (!res.ok) {
    log.warn('friends', 'listFriends failed', { status: res.status, did: target.did });
    throw new Error(`listFriends failed (HTTP ${res.status}) for ${target.did}`);
  }
  const body = (await res.json()) as {
    records?: { uri: string; value: { subject?: string; createdAt?: string } }[];
  };
  return (body.records ?? [])
    .filter((r) => typeof r.value.subject === 'string')
    .map((r) => ({
      uri: r.uri,
      subject: r.value.subject as string,
      createdAt: r.value.createdAt ?? '',
    }));
};

/** Find the rkey of the friend record naming a subject, or null if none. */
export const findFriendRkey = (records: FriendRecord[], subject: string): string | null => {
  const match = records.find((r) => r.subject === subject);
  return match === undefined ? null : (match.uri.split('/').pop() ?? null);
};

/** Add a friend by handle: resolve → DID, write an app.arecipe.friend record. */
export const addFriend = async (
  agent: Agent,
  handle: string,
  opts: { resolve?: ResolveFn } = {},
): Promise<{ uri: string; cid: string; subject: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to add a friend from');
  const resolve = opts.resolve ?? createResolver();
  const resolved = await resolve(handle.trim());
  const record = buildFriendRecord(resolved.did);
  log.info('friends', 'adding friend', { handle, subject: record.subject });
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: FRIEND_COLLECTION,
    record,
  });
  log.info('friends', 'added friend', { uri: res.data.uri, subject: record.subject });
  return { uri: res.data.uri, cid: res.data.cid, subject: record.subject };
};

/** Remove a friend by subject DID: find the owner's matching record, delete it. */
export const removeFriend = async (agent: Agent, subject: string): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to remove a friend from');
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: FRIEND_COLLECTION,
    limit: 100,
  });
  const records: FriendRecord[] = res.data.records.map((r) => ({
    uri: r.uri,
    subject: (r.value as { subject?: string }).subject ?? '',
    createdAt: (r.value as { createdAt?: string }).createdAt ?? '',
  }));
  const rkey = findFriendRkey(records, subject);
  if (rkey === null) {
    log.warn('friends', 'removeFriend: no record for subject', { subject });
    return;
  }
  log.info('friends', 'removing friend', { subject, rkey });
  await agent.com.atproto.repo.deleteRecord({ repo: did, collection: FRIEND_COLLECTION, rkey });
};

/** Load the friends' recipes — the shared multi-author loader (src/social/feed.ts). */
export const loadFriendsFeed = (friends: FeedAuthor[]): ReturnType<typeof loadAuthorsFeed> =>
  loadAuthorsFeed(friends);
