// Cookbook page (CB3). Your Cookbook = your own recipes + a bounded, chosen
// reach: starter-pack cooks + who you follow on Bluesky + your Bluesky
// followers. The MEMBERS LIST moved to Account (Phase 6); this page is the
// recipe feed. Three states:
//   - ?did=<did>  : a shareable, public cold-view of any account's recipe feed
//                   (no auth) — also the hermetic seam.
//   - signed in   : your cookbook feed.
//   - signed out  : redirect to Browse — the cookbook is a signed-in surface,
//                   and "who's in your cookbook" now lives on Account (OQ10).
// Members + feed scope come from the shared module (src/social/cookbook.js); the
// feed reuses the multi-author loader (src/social/feed.js).

import { bootSession } from '../auth/boot.js';
import { hasSessionHint } from '../auth/session-hint.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { requestPersistence } from '../storage-persist.js';
import { resolveCookbook, type ReachConfig } from '../social/cookbook.js';
import { membersToAuthors } from '../social/cookbook-members-view.js';
import { createReachPrefs } from '../social/reach.js';
import { loadAuthorsFeed, type FeedAuthor } from '../social/feed.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

/** Resolve a cookbook's members → authors and render their recipe feed. The
 * members LIST is rendered on Account now; here we only need the authors to
 * build the feed. Cold-view passes no config → resolveCookbook's all-on default;
 * the signed-in path passes your reach prefs. */
const showFeed = async (
  feedContainer: HTMLElement,
  you: { did: string; pds: string },
  config?: ReachConfig,
): Promise<void> => {
  const members = await resolveCookbook(config === undefined ? { you } : { you, config });
  const authors = await membersToAuthors(members);
  await renderFeedInto(feedContainer, authors);
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');
  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Cookbook'));

  const viewedDid = new URLSearchParams(window.location.search).get('did');
  const feedContainer = el('div');
  feedContainer.dataset['testid'] = 'cookbook-feed';

  if (viewedDid !== null && viewedDid !== '') {
    // Public cold-view: anyone's recipe feed, no auth. Members live on Account,
    // so the cold-view is feed-only.
    content.append(el('p', 'status', `Cookbook of ${viewedDid}`), feedContainer);
    mountShell(app, content);
    void mountBuildStamp(app);
    try {
      const { pds } = await resolveDidDoc(viewedDid);
      await showFeed(feedContainer, { did: viewedDid, pds });
    } catch (err) {
      log.error('cookbook', 'cold-view load failed', { did: viewedDid, error: String(err) });
      feedContainer.replaceChildren(el('p', 'status', `couldn’t load cookbook: ${String(err)}`));
    }
    log.debug('shell', 'mounted', { page: 'cookbook', view: 'cold' });
    void registerServiceWorker();
    return;
  }

  // Anonymous (no session hint) → Browse: the cookbook is a signed-in surface
  // and "who's in your cookbook" lives on Account (OQ10). Gate on the SAME
  // zero-auth hint index.html uses to route signed-in visitors here, so a
  // signed-in user whose OAuth session is still restoring is never bounced.
  // `replace` so the cookbook URL doesn't sit in history and loop the back button.
  if (!hasSessionHint()) {
    log.info('cookbook', 'no session hint → redirecting to Browse');
    window.location.replace('./index.html');
    return;
  }

  const { agent } = await bootSession();
  void requestPersistence();

  if (agent === null || agent.did === undefined) {
    // Hint present but the OAuth session didn't restore (stale/expired hint) →
    // send to sign-in to re-authenticate, not to Browse (the hint says signed-in).
    log.info('cookbook', 'session hint but no live agent → redirecting to sign-in');
    window.location.replace('./signin.html');
    return;
  }

  // Signed in: your cookbook feed. (The members list + explainer live on Account.)
  const status = el('p', 'status');
  status.dataset['testid'] = 'cookbook-status';
  content.append(status, feedContainer);

  const did = agent.did;
  try {
    const { pds } = await retryOnce(() => resolveDidDoc(did));
    mountShell(app, content);
    void mountBuildStamp(app);
    await showFeed(feedContainer, { did, pds }, createReachPrefs().load());
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
