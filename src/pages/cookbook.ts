// Cookbook page (CB3, was the Friends page). Your Cookbook = your own recipes +
// a bounded, chosen reach: starter-pack cooks + who you follow on Bluesky + your
// Bluesky followers. There is NO arecipe-native friend record anymore — "adding
// a cook" means following on Bluesky or toggling a starter in Settings. Three
// states:
//   - ?did=<did>  : a shareable, public cold-view of any account's cookbook
//                   (no auth) — also the hermetic seam.
//   - signed in   : your cookbook members + their recipes feed.
//   - signed out  : the sign-in gate.
// Members + feed come from the shared scope module (src/social/cookbook.ts);
// the feed reuses the multi-author loader (src/social/feed.ts).

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { requestPersistence } from '../storage-persist.js';
import { resolveCookbook, type CookbookMember } from '../social/cookbook.js';
import { loadAuthorsFeed, type FeedAuthor } from '../social/feed.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

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
const membersToAuthors = async (members: CookbookMember[]): Promise<FeedAuthor[]> =>
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
const renderMembersList = (members: CookbookMember[], authors: FeedAuthor[]): HTMLElement => {
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

/** Load + render a set of cooks' recipes into the given container. */
const renderFeedInto = async (feedContainer: HTMLElement, authors: FeedAuthor[]): Promise<void> => {
  if (authors.length === 0) {
    feedContainer.replaceChildren(
      el('p', 'empty-state', 'When the cooks in your cookbook publish recipes, they show up here.'),
    );
    return;
  }
  const feed = await loadAuthorsFeed(authors);
  feedContainer.replaceChildren(renderRecipeList(feed.entries, { authorsByDid: feed.authorsByDid }));
  if (feed.failedAuthors.length > 0) {
    log.warn('cookbook', 'some cooks unavailable', { failed: feed.failedAuthors });
  }
};

/** Resolve a cookbook (members + feed) for the given account and render it. */
const showCookbook = async (
  container: HTMLElement,
  membersMount: HTMLElement,
  feedContainer: HTMLElement,
  you: { did: string; pds: string },
): Promise<void> => {
  const members = await resolveCookbook({ you });
  const authors = await membersToAuthors(members);
  membersMount.replaceChildren(renderMembersList(members, authors));
  container.insertBefore(membersMount, feedContainer);
  await renderFeedInto(feedContainer, authors);
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');
  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Cookbook'));

  const viewedDid = new URLSearchParams(window.location.search).get('did');
  const membersMount = el('div');
  const feedContainer = el('div');
  feedContainer.dataset['testid'] = 'cookbook-feed';

  if (viewedDid !== null && viewedDid !== '') {
    // Public cold-view: anyone's cookbook, no auth.
    content.append(el('p', 'status', `Cookbook of ${viewedDid}`), feedContainer);
    mountShell(app, content);
    void mountBuildStamp(app);
    try {
      const { pds } = await resolveDidDoc(viewedDid);
      await showCookbook(content, membersMount, feedContainer, { did: viewedDid, pds });
    } catch (err) {
      log.error('cookbook', 'cold-view load failed', { did: viewedDid, error: String(err) });
      feedContainer.replaceChildren(el('p', 'status', `couldn’t load cookbook: ${String(err)}`));
    }
    log.debug('shell', 'mounted', { page: 'cookbook', view: 'cold' });
    void registerServiceWorker();
    return;
  }

  const { agent } = await bootSession();
  void requestPersistence();

  if (agent === null || agent.did === undefined) {
    const gate = el(
      'p',
      'empty-state',
      'Sign in on My recipes to see your cookbook — your starter cooks plus who you follow on Bluesky.',
    );
    gate.dataset['testid'] = 'cookbook-signed-out';
    content.append(gate);
    mountShell(app, content);
    void mountBuildStamp(app);
    log.debug('shell', 'mounted', { page: 'cookbook', signedIn: false });
    void registerServiceWorker();
    return;
  }

  // Signed in: your cookbook. Membership is your starters + Bluesky graph —
  // managed by following on Bluesky / the starter toggles in Settings, not here.
  const note = el(
    'p',
    'status',
    'Your starter cooks plus who you follow on Bluesky. Follow more cooks on Bluesky, or manage starters in Settings.',
  );
  const settingsLink = el('a', 'friend-link', 'Settings ↗') as HTMLAnchorElement;
  settingsLink.href = './settings.html';
  note.append(document.createTextNode(' '), settingsLink);
  const status = el('p', 'status');
  status.dataset['testid'] = 'cookbook-status';
  content.append(note, status, membersMount, feedContainer);

  const did = agent.did;
  try {
    const { pds } = await retryOnce(() => resolveDidDoc(did));
    mountShell(app, content);
    void mountBuildStamp(app);
    await showCookbook(content, membersMount, feedContainer, { did, pds });
  } catch (err) {
    log.error('cookbook', 'cookbook load failed', { error: String(err) });
    status.textContent = `couldn’t load your cookbook: ${String(err)}`;
    mountShell(app, content);
    void mountBuildStamp(app);
  }
  log.debug('shell', 'mounted', { page: 'cookbook', signedIn: true });
  void registerServiceWorker();
};

void main();
