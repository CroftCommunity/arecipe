// Friends page (Phase 9a). Three states:
//   - ?did=<did>  : a shareable, public cold-view of any account's friends
//                   feed (no auth). This is also what makes the read path
//                   hermetically testable.
//   - signed in   : add/remove friends (writes to your repo) + your feed.
//   - signed out  : the "sign in to add friends" gate.
// The read feed reuses the shared multi-author loader (src/social/feed.ts)
// via loadFriendsFeed; writes go through the session-provider Agent.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { requestPersistence } from '../storage-persist.js';
import {
  addFriend,
  listFriends,
  loadFriendsFeed,
  removeFriend,
  type FriendRecord,
} from '../social/friends.js';
import { type FeedAuthor } from '../social/feed.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Resolve each friend's subject DID to a feed author (handle for the card). */
const friendsToAuthors = async (friends: FriendRecord[]): Promise<FeedAuthor[]> =>
  Promise.all(
    friends.map(async (f) => {
      try {
        const { handle } = await resolveDidDoc(f.subject);
        return { handle: handle ?? f.subject, did: f.subject };
      } catch {
        return { handle: f.subject, did: f.subject };
      }
    }),
  );

/** Render a friends list with profile links + optional remove buttons. */
const renderFriendsList = (
  authors: FeedAuthor[],
  onRemove: ((subject: string) => void) | null,
): HTMLElement => {
  const list = el('div', 'friends-list');
  list.dataset['testid'] = 'friends-list';
  if (authors.length === 0) {
    list.append(el('p', 'status', 'no friends yet'));
    return list;
  }
  for (const author of authors) {
    const row = el('div', 'friend-row');
    row.dataset['testid'] = 'friend-row';
    const link = el('a', 'friend-link', author.handle) as HTMLAnchorElement;
    link.href = `https://bsky.app/profile/${author.handle}`;
    link.target = '_blank';
    link.rel = 'noopener';
    row.append(link);
    if (onRemove !== null) {
      const remove = el('button', 'button', 'Remove') as HTMLButtonElement;
      remove.type = 'button';
      remove.dataset['testid'] = 'friend-remove';
      remove.addEventListener('click', () => onRemove(author.did));
      row.append(remove);
    }
    list.append(row);
  }
  return list;
};

/** Load + render a set of friends' recipes into the given container. */
const renderFeedInto = async (feedContainer: HTMLElement, authors: FeedAuthor[]): Promise<void> => {
  if (authors.length === 0) {
    feedContainer.replaceChildren(
      el('p', 'empty-state', 'When your friends publish recipes, they show up here.'),
    );
    return;
  }
  const feed = await loadFriendsFeed(authors);
  feedContainer.replaceChildren(renderRecipeList(feed.entries, { authorsByDid: feed.authorsByDid }));
  if (feed.failedAuthors.length > 0) {
    log.warn('friends', 'some friends unavailable', { failed: feed.failedAuthors });
  }
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');
  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Friends'));

  const viewedDid = new URLSearchParams(window.location.search).get('did');
  const feedContainer = el('div');
  feedContainer.dataset['testid'] = 'friends-feed';

  if (viewedDid !== null && viewedDid !== '') {
    // Public cold-view: anyone's friends feed, no auth.
    content.append(el('p', 'status', `Friends of ${viewedDid}`));
    content.append(feedContainer);
    mountShell(app, content);
    void mountBuildStamp(app);
    try {
      const { pds } = await resolveDidDoc(viewedDid);
      const friends = await listFriends({ pds, did: viewedDid });
      const authors = await friendsToAuthors(friends);
      content.insertBefore(renderFriendsList(authors, null), feedContainer);
      await renderFeedInto(feedContainer, authors);
    } catch (err) {
      log.error('friends', 'cold-view load failed', { did: viewedDid, error: String(err) });
      feedContainer.replaceChildren(el('p', 'status', `couldn’t load friends: ${String(err)}`));
    }
    log.debug('shell', 'mounted', { page: 'friends', view: 'cold' });
    void registerServiceWorker();
    return;
  }

  const { agent } = await bootSession();
  void requestPersistence();

  if (agent === null) {
    const gate = el(
      'p',
      'empty-state',
      'Sign in on My recipes to add friends and see their recipes here.',
    );
    gate.dataset['testid'] = 'friends-signed-out';
    content.append(gate);
    mountShell(app, content);
    void mountBuildStamp(app);
    log.debug('shell', 'mounted', { page: 'friends', signedIn: false });
    void registerServiceWorker();
    return;
  }

  // Signed in: add-by-handle form + your friends + your feed.
  const form = el('form', 'lookup') as HTMLFormElement;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'friend.handle (e.g. name.bsky.social)';
  input.dataset['testid'] = 'friend-handle-input';
  const addButton = el('button', 'button button--primary', 'Add friend') as HTMLButtonElement;
  addButton.type = 'submit';
  addButton.dataset['testid'] = 'friend-add';
  const status = el('p', 'status');
  status.dataset['testid'] = 'friends-status';
  form.append(input, addButton);
  const listContainer = el('div');
  content.append(form, status, listContainer, feedContainer);

  const did = agent.did;
  const refresh = async (): Promise<void> => {
    if (did === undefined) return;
    const { pds } = await retryOnce(() => resolveDidDoc(did));
    const friends = await listFriends({ pds, did });
    const authors = await friendsToAuthors(friends);
    listContainer.replaceChildren(
      renderFriendsList(authors, (subject) => {
        void removeFriend(agent, subject)
          .then(refresh)
          .catch((err: unknown) => {
            log.error('friends', 'remove failed', { subject, error: String(err) });
            status.textContent = `remove failed: ${String(err)}`;
          });
      }),
    );
    await renderFeedInto(feedContainer, authors);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const handle = input.value.trim();
    if (handle === '') return;
    status.textContent = `adding ${handle}…`;
    void addFriend(agent, handle)
      .then(async () => {
        status.textContent = `added ${handle}`;
        input.value = '';
        await refresh();
      })
      .catch((err: unknown) => {
        log.error('friends', 'add failed', { handle, error: String(err) });
        status.textContent = `couldn’t add ${handle}: ${String(err)}`;
      });
  });

  mountShell(app, content);
  void mountBuildStamp(app);
  void refresh().catch((err: unknown) => {
    log.error('friends', 'friends load failed', { error: String(err) });
    status.textContent = `couldn’t load friends: ${String(err)}`;
  });
  log.debug('shell', 'mounted', { page: 'friends', signedIn: true });
  void registerServiceWorker();
};

void main();
