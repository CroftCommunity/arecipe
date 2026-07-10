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
import { createSourcePref, type CookbookSource } from '../social/cookbook-source-pref.js';
import { loadAuthorsFeed } from '../social/feed.js';
import { listInteractionsFor } from '../social/interactions.js';
import { loadLikedFeed } from '../social/liked-feed.js';
import { readFeedMeta, relativeFreshness, writeFeedMeta } from '../social/cookbook-feed-cache.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { availableFacets, createBrowsePrefs, matchesFilter, recipeFacets, type BrowseState } from './browse-state.js';
import { createTastePreference, matchesTaste } from '../recipes/taste-preference.js';
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
const didOf = (uri: string): string => uri.split('/')[2] ?? '';

type FeedViewController = {
  /** Swap the feed data + freshness stamp in place (background revalidate). */
  update: (entries: CachedRecipe[], authorsByDid: Record<string, string>, fetchedAt: string) => void;
};

const renderFeedView = (
  container: HTMLElement,
  feedContainer: HTMLElement,
  header: HTMLElement,
  initialEntries: CachedRecipe[],
  initialAuthorsByDid: Record<string, string>,
  viewer?: { did: string; pds: string },
  initialFetchedAt?: string | null,
): FeedViewController => {
  // Cookbook opens on Details (the reading-oriented view); Browse keeps its
  // tiles-first default. Persisted per-consumer, so a choice here is sticky.
  const prefs = createBrowsePrefs({ prefix: 'cookbook', defaultView: 'details' });
  const tastePreference = createTastePreference();
  let state = prefs.load();
  // Feed data is mutable so a background revalidate can swap it in place without
  // rebuilding the toolbar/source-control chrome (built once below).
  let entries = initialEntries;
  let authorsByDid = initialAuthorsByDid;
  let fetchedAt: string | null = initialFetchedAt ?? null;

  // Source filter (OQ6, own signed-in cookbook only): All = the loaded
  // members+you feed; Mine = that feed filtered to your DID; Liked = a SEPARATE
  // lazy fetch of your hearted recipes (OQ12 — not loaded until selected).
  type Source = CookbookSource;
  // Default to Mine on your own cookbook (your recipes are what you came for),
  // but REMEMBER the last-chosen source so it's sticky across visits. The
  // anonymous cold-view has no "mine" and no persistence — it opens on All.
  const defaultSource: Source = 'mine';
  const sourcePref = createSourcePref();
  let source: Source = viewer === undefined ? 'all' : sourcePref.load(defaultSource);
  let likedEntries: CachedRecipe[] | null = null; // lazy cache
  let likedLoading = false;
  // Set by the source control (own cookbook only) so the shared reset can also
  // clear the source line back to the default.
  let resetSource: (() => void) | null = null;

  const activeEntries = (): CachedRecipe[] => {
    if (source === 'mine') return viewer === undefined ? [] : entries.filter((e) => didOf(e.uri) === viewer.did);
    if (source === 'liked') return likedEntries ?? [];
    return entries;
  };
  const emptyMessage = (): string =>
    source === 'liked'
      ? 'No liked recipes yet — tap the heart on a recipe to collect it here.'
      : source === 'mine'
        ? 'You haven’t published any recipes yet.'
        : 'When the cooks in your cookbook publish recipes, they show up here.';

  // Selected facets absent from the active source are kept in state but inert.
  const effectiveState = (): BrowseState => {
    const available = availableFacets(activeEntries());
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
    if (source === 'liked' && likedLoading) {
      feedContainer.replaceChildren(el('p', 'status', 'loading your liked recipes…'));
      return;
    }
    const base = activeEntries();
    const effective = effectiveState();
    const taste = tastePreference.load();
    const shown = base.filter(
      (e) => matchesFilter(e.value, { state: effective, diet: [] }) && matchesTaste(recipeFacets(e.value), taste),
    );
    toolbar.setStatus(
      hasFilters(effective)
        ? `${shown.length} of ${base.length} shown`
        : `${base.length} ${base.length === 1 ? 'recipe' : 'recipes'}`,
    );
    // The reset (next to the count) clears the whole filter line — facets,
    // photos, AND the source — so it shows whenever any of those is off-default.
    toolbar.setResetVisible(hasFilters(effective) || (viewer !== undefined && source !== defaultSource));
    if (shown.length === 0) {
      feedContainer.replaceChildren(el('p', 'empty-state', emptyMessage()));
      return;
    }
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    feedContainer.replaceChildren(render(shown, { authorsByDid }));
  };
  const showCurrent = (): void => {
    toolbar.rebuildFacets(availableFacets(activeEntries()), state.facets);
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
        if (resetSource !== null) resetSource(); // also clear the source line
        showCurrent();
      },
    },
  });
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);
  container.insertBefore(toolbar.element, feedContainer);

  // Source control — only on the viewer's OWN signed-in cookbook (Mine/Liked are
  // viewer-relative; the anonymous cold-view has no "my liked").
  if (viewer !== undefined) {
    const seg = el('div', 'segmented cookbook-source');
    const buttons: [HTMLButtonElement, Source][] = [];
    const mk = (label: string, key: Source, testid: string): HTMLButtonElement => {
      const btn = el('button', 'segmented-option', label) as HTMLButtonElement;
      btn.type = 'button';
      btn.dataset['testid'] = testid;
      btn.addEventListener('click', () => selectSource(key));
      buttons.push([btn, key]);
      return btn;
    };
    const reflectSource = (): void => {
      for (const [btn, key] of buttons) {
        const active = source === key;
        btn.classList.toggle('segmented-option--active', active);
        btn.setAttribute('aria-pressed', String(active));
      }
    };
    // Lazy-load the liked feed (OQ12): a separate cross-PDS fetch of your
    // hearted recipes, cached after the first load. Kicked off both on selecting
    // Liked AND on mount when Liked is the remembered source (else a persisted
    // "liked" would render the empty state without ever fetching).
    const loadLiked = (): void => {
      likedLoading = true;
      void (async () => {
        try {
          const liked = await listInteractionsFor({ pds: viewer.pds, did: viewer.did, kind: 'liked' });
          likedEntries = await loadLikedFeed(liked);
        } catch (err) {
          log.warn('cookbook', 'liked feed load failed', { error: String(err) });
          likedEntries = [];
        }
        likedLoading = false;
        showCurrent();
      })();
    };
    const selectSource = (key: Source): void => {
      if (source === key) return;
      source = key;
      sourcePref.save(source); // remember the choice across visits
      reflectSource();
      if (key === 'liked' && likedEntries === null) {
        loadLiked(); // sets likedLoading = true
        renderCurrent(); // show the loading line immediately
        return;
      }
      showCurrent();
    };
    // Let the shared reset clear the source line back to the default (Mine is
    // already loaded, so no lazy fetch — just reset + reflect; the caller
    // re-renders).
    resetSource = (): void => {
      if (source === defaultSource) return;
      source = defaultSource;
      sourcePref.save(source);
      reflectSource();
    };
    seg.append(
      mk('Mine', 'mine', 'source-mine'),
      mk('Liked', 'liked', 'source-liked'),
      mk('All', 'all', 'source-all'),
    );
    reflectSource();
    // The source control sits inline with the toolbar controls (Tiles/Details/
    // Meal/Cuisine) — one filter row — by prepending into the toolbar's controls.
    const controlsEl = toolbar.element.querySelector('.browse-controls');
    if (controlsEl !== null) controlsEl.prepend(seg);
    else container.insertBefore(seg, toolbar.element);
    // "New Recipe" builder link rides the title row, right-aligned (own cookbook
    // only — mirrors Alchemy's own new-recipe button).
    const newRecipe = el('a', 'button button--primary new-recipe', 'New Recipe') as HTMLAnchorElement;
    newRecipe.href = './editor.html';
    newRecipe.dataset['testid'] = 'cookbook-new-recipe';
    header.append(newRecipe);
    // Remembered as Liked? Kick off the lazy load now so the initial paint shows
    // the loading line (then the feed) rather than the "no liked recipes" empty.
    if (source === 'liked' && likedEntries === null) loadLiked();
  }

  // Content-freshness note at the bottom (SWR): a cache-first paint shows the
  // stale time ("as of 2 hr ago"); the silent background revalidate updates it.
  const freshness = el('p', 'status content-freshness');
  freshness.dataset['testid'] = 'cookbook-freshness';
  const updateFreshness = (): void => {
    freshness.textContent = fetchedAt === null ? '' : `Cookbook · as of ${relativeFreshness(fetchedAt, Date.now())}`;
  };
  container.append(freshness);
  updateFreshness();

  showCurrent();

  return {
    update: (nextEntries, nextAuthorsByDid, nextFetchedAt) => {
      entries = nextEntries;
      authorsByDid = nextAuthorsByDid;
      fetchedAt = nextFetchedAt;
      updateFreshness();
      showCurrent();
    },
  };
};

/** Resolve a cookbook's members → authors, load their recipes, and mount the
 * toolbar-driven feed view. The members LIST is rendered on Account now; here we
 * only need the authors to build the feed. Cold-view passes no config →
 * resolveCookbook's all-on default; the signed-in path passes your reach prefs. */
const showFeed = async (
  container: HTMLElement,
  feedContainer: HTMLElement,
  header: HTMLElement,
  you: { did: string; pds: string },
  opts: { config?: ReachConfig; isOwn?: boolean } = {},
): Promise<void> => {
  const viewer = opts.isOwn === true ? you : undefined;
  let controller: FeedViewController | null = null;

  // 1) Cache-first paint: if we've resolved this cookbook before, render the
  //    persisted authors' recipes straight from the IndexedDB cache — instant,
  //    no network. The freshness note shows how stale it is.
  const meta = readFeedMeta(you.did);
  if (meta !== null && meta.authors.length > 0) {
    try {
      const memberDids = new Set(meta.authors.map((a) => a.did));
      const cachedEntries = (await createRecipeCache().list()).filter((e) =>
        memberDids.has(didOf(e.uri)),
      );
      const authorsByDid = Object.fromEntries(meta.authors.map((a) => [a.did, a.handle]));
      controller = renderFeedView(container, feedContainer, header, cachedEntries, authorsByDid, viewer, meta.fetchedAt);
    } catch (err) {
      log.warn('cookbook', 'cache-first paint failed', { error: String(err) });
    }
  }

  // 2) Revalidate in the background (or the foreground on a cold first visit).
  try {
    const members = await resolveCookbook(opts.config === undefined ? { you } : { you, config: opts.config });
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
    const now = new Date().toISOString();
    writeFeedMeta(you.did, authors, now);
    if (controller !== null) controller.update(feed.entries, feed.authorsByDid, now);
    else renderFeedView(container, feedContainer, header, feed.entries, feed.authorsByDid, viewer, now);
  } catch (err) {
    // Revalidate failed. If we already painted from cache, keep that stale view
    // (offline resilience — the freshness note still shows how old it is);
    // otherwise there's nothing to show.
    log.warn('cookbook', 'feed revalidate failed', { error: String(err) });
    if (controller === null) {
      feedContainer.replaceChildren(el('p', 'status', `couldn’t load your cookbook: ${String(err)}`));
    }
  }
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');
  const content = el('section', 'panel');
  // Title row: "Cookbook" on the left; the own-cookbook "New Recipe" link is
  // added to the right of it by renderFeedView (viewer-only).
  const header = el('div', 'cookbook-header');
  header.append(el('h2', 'section-title', 'Cookbook'));
  content.append(header);

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
      await showFeed(content, feedContainer, header, { did: viewedDid, pds });
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
    await showFeed(content, feedContainer, header, { did, pds }, {
      config: createReachPrefs().load(),
      isOwn: true,
    });
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
