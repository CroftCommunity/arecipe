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
import { loadAuthorsFeed } from '../social/feed.js';
import { type CachedRecipe } from '../recipes/cache.js';
import { availableFacets, createBrowsePrefs, matchesFilter, type BrowseState } from './browse-state.js';
import { renderToolbar } from '../recipes/toolbar.js';
import { renderRecipeDetailsList, renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Toolbar-driven view over the loaded cookbook feed: the shared Tiles/Details
 * toggle + Meal/Cuisine facets + a count, filtering the entries client-side with
 * the same browse-state primitives as Browse. Cookbook persists its OWN
 * view/facet prefs (OQ11 — `createBrowsePrefs('cookbook')`) so a choice here
 * doesn't bleed into Browse, and shows no diet link (diet is a Browse/Settings
 * concern, so the cookbook filter ignores it). */
const renderFeedView = (
  container: HTMLElement,
  feedContainer: HTMLElement,
  entries: CachedRecipe[],
  authorsByDid: Record<string, string>,
): void => {
  const prefs = createBrowsePrefs({ prefix: 'cookbook' });
  let state = prefs.load();

  // Selected facets absent from this feed are kept in state but inert here.
  const effectiveState = (): BrowseState => {
    const available = availableFacets(entries);
    return {
      view: state.view,
      photosOnly: state.photosOnly,
      facets: {
        cuisine: state.facets.cuisine.filter((c) => available.cuisine.includes(c)),
        category: state.facets.category.filter((c) => available.category.includes(c)),
      },
    };
  };
  const hasFilters = (s: BrowseState): boolean =>
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0;

  const renderCurrent = (): void => {
    const effective = effectiveState();
    const shown = entries.filter((e) => matchesFilter(e.value, { state: effective, diet: [] }));
    toolbar.setStatus(
      hasFilters(effective)
        ? `${shown.length} of ${entries.length} shown`
        : `${entries.length} ${entries.length === 1 ? 'recipe' : 'recipes'}`,
    );
    toolbar.setResetVisible(hasFilters(effective));
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    feedContainer.replaceChildren(render(shown, { authorsByDid }));
  };
  const showCurrent = (): void => {
    toolbar.rebuildFacets(availableFacets(entries), state.facets);
    renderCurrent();
  };

  const toolbar = renderToolbar({
    showDietLink: false,
    callbacks: {
      onViewChange: (view) => {
        if (state.view === view) return;
        state = { ...state, view };
        prefs.save(state);
        toolbar.reflectView(view);
        renderCurrent();
      },
      onPhotosToggle: (photosOnly) => {
        state = { ...state, photosOnly };
        prefs.save(state);
        renderCurrent();
      },
      onFacetChange: (dimension, value, checked) => {
        const selected = new Set(state.facets[dimension]);
        if (checked) selected.add(value);
        else selected.delete(value);
        state = { ...state, facets: { ...state.facets, [dimension]: [...selected] } };
        prefs.save(state);
        renderCurrent();
      },
      onReset: () => {
        state = { ...state, photosOnly: false, facets: { cuisine: [], category: [] } };
        prefs.save(state);
        toolbar.setPhotos(false);
        showCurrent();
      },
    },
  });
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);
  container.insertBefore(toolbar.element, feedContainer);
  showCurrent();
};

/** Resolve a cookbook's members → authors, load their recipes, and mount the
 * toolbar-driven feed view. The members LIST is rendered on Account now; here we
 * only need the authors to build the feed. Cold-view passes no config →
 * resolveCookbook's all-on default; the signed-in path passes your reach prefs. */
const showFeed = async (
  container: HTMLElement,
  feedContainer: HTMLElement,
  you: { did: string; pds: string },
  config?: ReachConfig,
): Promise<void> => {
  const members = await resolveCookbook(config === undefined ? { you } : { you, config });
  const authors = await membersToAuthors(members);
  if (authors.length === 0) {
    feedContainer.replaceChildren(
      el('p', 'empty-state', 'When the cooks in your cookbook publish recipes, they show up here.'),
    );
    return;
  }
  const feed = await loadAuthorsFeed(authors);
  if (feed.failedAuthors.length > 0) {
    log.warn('cookbook', 'some cooks unavailable', { failed: feed.failedAuthors });
  }
  renderFeedView(container, feedContainer, feed.entries, feed.authorsByDid);
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
      await showFeed(content, feedContainer, { did: viewedDid, pds });
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
    await showFeed(content, feedContainer, { did, pds }, createReachPrefs().load());
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
