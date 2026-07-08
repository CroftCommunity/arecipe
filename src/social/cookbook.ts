// Cookbook scope (CB1): the shared "who's in my kitchen" resolver. Your
// Cookbook = your own recipes + a bounded, user-chosen reach drawn from
// Bluesky primitives — starter-pack cooks + your Bluesky follows + your
// Bluesky followers — plus you. This module resolves depth-0 membership: the
// set of member repos (DID + optional handle + which source(s) named them).
// It replaces the dropped app.arecipe.friend graph as the discovery scope for
// the recipe page (comments/likes), the Cookbook tab, and the feed.
//
// Discovery endpoints (verified 2026-07-08, browser-reachable, CORS-open —
// see the plan's ★ Cookbook re-plan note; do NOT re-probe):
//  - follows:   listRecords?collection=app.bsky.graph.follow on YOUR PDS
//               (records { subject:<did>, createdAt }; direct repo read, no AppView)
//  - followers: app.bsky.graph.getFollowers?actor=<did> on public.api.bsky.app
//               ({ followers:[{ did, handle }] }; handle may be "handle.invalid",
//               did is always present — the one accepted AppView dependency)
//
// Contract: sources are resolved independently and degrade — a source that
// fails logs a warning and contributes nothing; it never fails the whole
// cookbook (mirrors loadAuthorsFeed's degrade-not-blank posture). Members are
// returned in source-priority order (you → starter → follow → follower) so a
// downstream per-recipe discovery cap favors the high-signal sources.

import { log } from '../log.js';
import { createStarterPrefs } from '../recipes/starter.js';
import type { FeedAuthor } from './feed.js';

/** Which source(s) named a member. A member can carry more than one. */
export type CookbookSource = 'you' | 'starter' | 'follow' | 'follower';

/** A resolved cookbook member repo. */
export type CookbookMember = { did: string; handle?: string; sources: CookbookSource[] };

/** Which reach sources are enabled. Depth (the like-graph network effect) is
 * NOT here — it is deferred to CB6 (see the plan). */
export type ReachConfig = { starters: boolean; follows: boolean; followers: boolean };

const DEFAULT_REACH: ReachConfig = { starters: true, follows: true, followers: true };
const DEFAULT_APPVIEW = 'https://public.api.bsky.app';
const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

/** Resolve the cookbook's depth-0 member repos from the enabled sources.
 * `you` (the signed-in account, `{did, pds}`) is required for follows/followers
 * — both read your own repo/graph; omit it (e.g. a source-only preview) and
 * only starters resolve. Injectable `fetchFn`/`appView`/`starters` for
 * hermetic tests. Returns all members; a per-recipe consumer applies its own
 * logged cap (see the plan's CB1 open-question resolution). */
export const resolveCookbook = async (args: {
  you?: { did: string; pds: string };
  config?: ReachConfig;
  starters?: FeedAuthor[];
  fetchFn?: typeof fetch;
  appView?: string;
}): Promise<CookbookMember[]> => {
  const config = args.config ?? DEFAULT_REACH;
  const fetchFn = args.fetchFn ?? fetch;
  const appView = args.appView ?? DEFAULT_APPVIEW;

  // Insertion order IS priority order (you → starter → follow → follower).
  const byDid = new Map<string, CookbookMember>();
  const add = (did: string, source: CookbookSource, handle?: string): void => {
    const existing = byDid.get(did);
    if (existing === undefined) {
      byDid.set(did, { did, sources: [source], ...(handle !== undefined ? { handle } : {}) });
      return;
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (existing.handle === undefined && handle !== undefined) existing.handle = handle;
  };

  if (args.you !== undefined) add(args.you.did, 'you');

  if (config.starters) {
    const starters = args.starters ?? createStarterPrefs().enabledAuthors();
    for (const author of starters) add(author.did, 'starter', author.handle);
    log.debug('cookbook', 'starters resolved', { count: starters.length });
  }

  const you = args.you;
  if (config.follows && you !== undefined) {
    try {
      const url = `${you.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(you.did)}&collection=${FOLLOW_COLLECTION}&limit=100`;
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { records?: { value: { subject?: string } }[] };
      let n = 0;
      for (const record of body.records ?? []) {
        const subject = record.value.subject;
        if (typeof subject === 'string') {
          add(subject, 'follow');
          n++;
        }
      }
      log.debug('cookbook', 'follows resolved', { count: n });
    } catch (err) {
      log.warn('cookbook', 'follows source failed', { error: String(err) });
    }
  }

  if (config.followers && you !== undefined) {
    try {
      const url = `${appView}/xrpc/app.bsky.graph.getFollowers?actor=${encodeURIComponent(you.did)}&limit=100`;
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { followers?: { did?: string; handle?: string }[] };
      let n = 0;
      for (const follower of body.followers ?? []) {
        if (typeof follower.did !== 'string') continue;
        // handle.invalid is a real AppView value for an unverified handle — keep
        // the DID (always resolvable), drop the placeholder handle.
        const handle =
          follower.handle !== undefined && follower.handle !== 'handle.invalid'
            ? follower.handle
            : undefined;
        add(follower.did, 'follower', handle);
        n++;
      }
      log.debug('cookbook', 'followers resolved', { count: n });
    } catch (err) {
      log.warn('cookbook', 'followers source failed', { error: String(err) });
    }
  }

  const members = [...byDid.values()];
  log.info('cookbook', 'resolved', { members: members.length });
  return members;
};
