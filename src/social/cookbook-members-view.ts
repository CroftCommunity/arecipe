// Cookbook members view (Phase 6, extracted from cookbook.ts). The member list
// — your starter cooks + who you follow / your followers on Bluesky, each with a
// source badge — plus the "your starter cooks…" explainer and a Settings link.
// It renders on Account now (signed-in); Cookbook keeps just the recipe feed.
// `membersToAuthors` is exported because the Cookbook feed also maps members →
// authors before loading their recipes.

import type { Agent } from '@atproto/api';
import { createResolver } from '../identity/resolve.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { resolveCookbook, type CookbookMember, type ReachConfig } from './cookbook.js';
import { createCookFollowsLocal } from './cook-follows-local.js';
import { followCook, listCookFollows, mirrorCookFollowsDown, unfollowCook } from './cook-follows-pds.js';
import { renderAddCookPanel } from './add-cook-panel.js';
import type { FeedAuthor } from './feed.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Human label for where a member came from (first/strongest source wins). */
const SOURCE_LABEL: Record<CookbookMember['sources'][number], string> = {
  you: 'you',
  starter: 'starter',
  added: 'added',
  follow: 'following',
  follower: 'follower',
};
// `added` (an explicit cook-follow) ranks after starter, before follow (D8).
const SOURCE_ORDER = ['you', 'starter', 'added', 'follow', 'follower'] as const;
const primarySource = (m: CookbookMember): (typeof SOURCE_ORDER)[number] | undefined =>
  SOURCE_ORDER.find((s) => m.sources.includes(s));
const sourceLabel = (m: CookbookMember): string => {
  const primary = primarySource(m);
  return primary === undefined ? '' : SOURCE_LABEL[primary];
};

/** Resolve each member to a feed author (handle for the card + profile link). */
export const membersToAuthors = async (members: CookbookMember[]): Promise<FeedAuthor[]> =>
  Promise.all(
    members.map(async (m) => {
      if (m.handle !== undefined) return { handle: m.handle, did: m.did };
      try {
        const { handle } = await resolveDidDoc(m.did);
        return { handle: handle ?? m.did, did: m.did };
      } catch {
        return { handle: m.did, did: m.did };
      }
    }),
  );

export type MembersListOptions = {
  /** Called with a member's DID when its per-row unfollow is tapped. Only
   *  `added` (cook-follow) members carry an unfollow control. */
  onUnfollow?: (did: string) => void;
};

/** Render the member list with profile links + a source badge. `added` members
 *  (explicit cook-follows) also get a per-row unfollow when `onUnfollow` is
 *  given — signed-in removal deletes the record; local-only rows drop locally. */
export const renderMembersList = (
  members: CookbookMember[],
  authors: FeedAuthor[],
  opts: MembersListOptions = {},
): HTMLElement => {
  const list = el('div', 'friends-list');
  list.dataset['testid'] = 'cookbook-members';
  const handleByDid = Object.fromEntries(authors.map((a) => [a.did, a.handle]));
  if (members.length === 0) {
    list.append(el('p', 'status', 'no cooks yet'));
    return list;
  }
  for (const m of members) {
    const row = el('div', 'friend-row');
    row.dataset['testid'] = 'cookbook-member';
    const handle = handleByDid[m.did] ?? m.did;
    const link = el('a', 'friend-link', handle) as HTMLAnchorElement;
    link.href = `https://bsky.app/profile/${handle}`;
    link.target = '_blank';
    link.rel = 'noopener';
    row.append(link, el('span', 'chip', sourceLabel(m)));
    if (opts.onUnfollow !== undefined && primarySource(m) === 'added') {
      const onUnfollow = opts.onUnfollow;
      const unfollow = el('button', 'friend-unfollow', 'Unfollow') as HTMLButtonElement;
      unfollow.type = 'button';
      unfollow.dataset['testid'] = 'unfollow-cook';
      unfollow.setAttribute('aria-label', `Unfollow ${handle}`);
      unfollow.addEventListener('click', () => onUnfollow(m.did));
      row.append(unfollow);
    }
    list.append(row);
  }
  return list;
};

/** Resolve + render the members list (with the explainer, add panel, and D6
 *  publish offer) into `container`. The reusable mount Account uses. Cook follows
 *  are the `added` source: the add panel looks up a cook and follows them (local
 *  always; a public cookFollow record when a session is present), rows carry a
 *  per-row unfollow, and local-only follows are OFFERED for publish (D6), never
 *  pushed silently. Empty/error states degrade to a status line, never a blank. */
export const mountMembersList = async (
  container: HTMLElement,
  you: { did: string; pds: string },
  config?: ReachConfig,
  opts: {
    agent?: Agent;
    /** Injectable for hermetic tests (defaults: real fetch / handle resolver). */
    fetchFn?: typeof fetch;
    resolver?: (handle: string) => Promise<{ did: string; handle: string }>;
  } = {},
): Promise<void> => {
  const agent = opts.agent;
  const local = createCookFollowsLocal();
  const resolver = opts.resolver ?? createResolver();
  const fetchOpt = opts.fetchFn === undefined ? {} : { fetchFn: opts.fetchFn };

  const note = el(
    'p',
    'status',
    'Your starter cooks, the cooks you’ve followed, plus who you follow on Bluesky. Manage starters in Settings.',
  );
  const settingsLink = el('a', 'friend-link', 'Settings ↗') as HTMLAnchorElement;
  settingsLink.href = './settings.html';
  note.append(document.createTextNode(' '), settingsLink);

  // Add panel at the top of the listing (D8): look up a cook and follow them.
  const addPanel = renderAddCookPanel({
    buttonLabel: 'Follow',
    onSubmit: (handle) => void follow(handle),
  });
  const offerMount = el('div');
  const listMount = el('div');
  container.append(note, addPanel.element, offerMount, listMount);

  // Track which follows are already published (have a PDS cookFollow record), to
  // drive the D6 offer + know that an unfollow must also delete the record.
  let publishedDids = new Set<string>();

  const follow = async (handle: string): Promise<void> => {
    addPanel.setStatus('following…');
    try {
      const identity = await resolver(handle);
      local.add({ did: identity.did, handle: identity.handle });
      if (agent !== undefined) {
        try {
          await followCook(agent, identity.did);
          publishedDids.add(identity.did);
        } catch (err) {
          // A local add still stands; the D6 offer will surface it for retry.
          log.warn('cookbook-members', 'publish follow failed', { error: String(err) });
        }
      }
      addPanel.clear();
      addPanel.setStatus('');
      await render();
    } catch (err) {
      addPanel.setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const unfollow = async (did: string): Promise<void> => {
    local.remove(did);
    if (agent !== undefined && publishedDids.has(did)) {
      try {
        await unfollowCook(agent, did, you, fetchOpt);
        publishedDids.delete(did);
      } catch (err) {
        log.warn('cookbook-members', 'unpublish follow failed', { error: String(err) });
      }
    }
    await render();
  };

  const publishAll = async (dids: string[]): Promise<void> => {
    if (agent === undefined) return;
    for (const did of dids) {
      try {
        await followCook(agent, did);
        publishedDids.add(did);
      } catch (err) {
        log.warn('cookbook-members', 'publish-all follow failed', { did, error: String(err) });
      }
    }
    await render();
  };

  let offerDismissed = false;
  const renderOffer = (): void => {
    offerMount.replaceChildren();
    // D6: only when signed in and some local follow has no matching PDS record.
    if (agent === undefined || offerDismissed) return;
    const localOnly = local.list().filter((f) => !publishedDids.has(f.did));
    if (localOnly.length === 0) return;

    const offer = el('div', 'publish-offer');
    offer.dataset['testid'] = 'publish-offer';
    const n = localOnly.length;
    offer.append(
      el('p', 'status', `Publish ${n} saved cook${n === 1 ? '' : 's'} as public follows? ${localOnly.map((f) => f.handle).join(', ')}`),
    );
    const publishBtn = el('button', 'button button--primary', 'Publish') as HTMLButtonElement;
    publishBtn.type = 'button';
    publishBtn.dataset['testid'] = 'publish-follows';
    publishBtn.addEventListener('click', () => void publishAll(localOnly.map((f) => f.did)));
    const dismissBtn = el('button', 'button', 'Not now') as HTMLButtonElement;
    dismissBtn.type = 'button';
    dismissBtn.dataset['testid'] = 'publish-dismiss';
    dismissBtn.addEventListener('click', () => {
      offerDismissed = true;
      renderOffer();
    });
    offer.append(publishBtn, dismissBtn);
    offerMount.append(offer);
  };

  const render = async (): Promise<void> => {
    try {
      const members = await resolveCookbook({
        you,
        ...(config === undefined ? {} : { config }),
        ...fetchOpt,
      });
      const authors = await membersToAuthors(members);
      listMount.replaceChildren(renderMembersList(members, authors, { onUnfollow: (did) => void unfollow(did) }));
      renderOffer();
    } catch (err) {
      log.error('cookbook-members', 'members load failed', { error: String(err) });
      listMount.replaceChildren(el('p', 'status', `couldn’t load your cookbook members: ${String(err)}`));
    }
  };

  // Signed in: mirror PDS cook follows down into the local store (D5) and learn
  // which are published — both feed the `added` source and the D6 offer. A read
  // failure degrades: local-only state still renders.
  if (agent !== undefined) {
    try {
      const pds = await listCookFollows(you, fetchOpt);
      publishedDids = new Set(pds.map((f) => f.subject));
      await mirrorCookFollowsDown(local, you, fetchOpt);
    } catch (err) {
      log.warn('cookbook-members', 'cook-follow mirror-down failed', { error: String(err) });
    }
  }

  await render();
};
