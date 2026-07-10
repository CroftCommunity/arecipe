// Cookbook members view (Phase 6, extracted from cookbook.ts). The member list
// — your starter cooks + who you follow / your followers on Bluesky, each with a
// source badge — plus the "your starter cooks…" explainer and a Settings link.
// It renders on Account now (signed-in); Cookbook keeps just the recipe feed.
// `membersToAuthors` is exported because the Cookbook feed also maps members →
// authors before loading their recipes.

import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { resolveCookbook, type CookbookMember, type ReachConfig } from './cookbook.js';
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
  follow: 'following',
  follower: 'follower',
};
const SOURCE_ORDER = ['you', 'starter', 'follow', 'follower'] as const;
const sourceLabel = (m: CookbookMember): string => {
  const primary = SOURCE_ORDER.find((s) => m.sources.includes(s));
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

/** Render the member list with profile links + a source badge. */
export const renderMembersList = (
  members: CookbookMember[],
  authors: FeedAuthor[],
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
    list.append(row);
  }
  return list;
};

/** Resolve + render the members list (with the explainer + Settings link) into
 *  `container`. The reusable mount Account uses. Empty/error states are handled
 *  in place — a failing resolve degrades to a status line, never a blank panel. */
export const mountMembersList = async (
  container: HTMLElement,
  you: { did: string; pds: string },
  config?: ReachConfig,
): Promise<void> => {
  const note = el(
    'p',
    'status',
    'Your starter cooks plus who you follow on Bluesky. Follow more cooks on Bluesky, or manage starters in Settings.',
  );
  const settingsLink = el('a', 'friend-link', 'Settings ↗') as HTMLAnchorElement;
  settingsLink.href = './settings.html';
  note.append(document.createTextNode(' '), settingsLink);
  const listMount = el('div');
  container.append(note, listMount);

  try {
    const members = await resolveCookbook(config === undefined ? { you } : { you, config });
    const authors = await membersToAuthors(members);
    listMount.replaceChildren(renderMembersList(members, authors));
  } catch (err) {
    log.error('cookbook-members', 'members load failed', { error: String(err) });
    listMount.replaceChildren(el('p', 'status', `couldn’t load your cookbook members: ${String(err)}`));
  }
};
