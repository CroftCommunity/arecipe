// Cookbook page (CB3). Your Cookbook = your own recipes + the ones you liked
// (Mine | Liked | Both — Both is the default). The whole-reach members feed is
// Browse's job, not a cookbook view. The MEMBERS LIST moved to Account
// (Phase 6); this page is the recipe feed. Three states:
//   - ?did=<did>  : the shareable, public SHARED view of that account's
//                   cookbook — EXACTLY their recipes + their likes (owner
//                   decision 2026-07-16; no member fan-out, no auth), with the
//                   same source control relabeled owner-relative
//                   (Created | Liked | Both, Created default) — also the
//                   hermetic seam.
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
import { createCookbookPrefs } from '../social/cookbook-prefs.js';
import { createReachPrefs } from '../social/reach.js';
import { createSourcePref, type CookbookSource } from '../social/cookbook-source-pref.js';
import { loadAuthorsFeed } from '../social/feed.js';
import { listInteractionsFor } from '../social/interactions.js';
import { loadLikedFeed } from '../social/liked-feed.js';
import { readFeedMeta, relativeFreshness, writeFeedMeta, type FeedMeta } from '../social/cookbook-feed-cache.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { availableFacets, createBrowsePrefs, matchesFilter, recipeFacets, type BrowseState } from './browse-state.js';
import { createSearchMemo, queryEntries } from '../recipes/search.js';
import { createTastePreference, matchesTaste } from '../recipes/taste-preference.js';
import { renderToolbar } from '../recipes/toolbar.js';
import { renderRecipeDetailsList, renderRecipeList } from '../recipes/view.js';
import { renderShareButton, shareOrigin } from '../share/button.js';
import { buildCookbookShareUrl } from '../share/urls.js';
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

/** Share affordance: a one-tap share ICON beside the "Cookbook" heading, wired
 * to the canonical cookbook.html?did=<did> URL for the cookbook being viewed —
 * the viewed DID on the cold-view, your own DID on the signed-in view. Native
 * share sheet on mobile, clipboard copy (+ "Copied" flash) on desktop. */
const mountCookbookShare = (titleGroup: HTMLElement, did: string): void => {
  // Hidden by default: the export button appears only when the viewer opts in
  // via Settings → Cookbook → "Show export" (localStorage-backed pref).
  if (!createCookbookPrefs().showExport()) return;
  titleGroup.append(
    renderShareButton({
      url: buildCookbookShareUrl(shareOrigin(), did),
      title: 'Cookbook',
      label: 'Share',
      ariaLabel: 'Share this cookbook',
      testid: 'share-cookbook',
      icon: true,
    }),
  );
};

/** Shared-cookbook banner (cold-view only): "Viewing <user>'s shared cookbook",
 * under the site banner. <user> paints as the DID and upgrades to the resolved
 * Bluesky handle (the caller feeds it in via the returned setter), linking to
 * the owner's Bluesky profile. Signed-in visitors (session hint) get a ✕ back
 * to their own cookbook — same page path, so closing IS navigating home;
 * anonymous visitors have no own cookbook, so no ✕. */
const renderSharedBanner = (did: string): { element: HTMLElement; setHandle: (handle: string) => void } => {
  const banner = el('div', 'shared-cookbook-banner');
  banner.dataset['testid'] = 'shared-cookbook-banner';
  const text = el('p', 'shared-cookbook-text');
  const user = el('a', 'shared-cookbook-user', did) as HTMLAnchorElement;
  user.dataset['testid'] = 'shared-cookbook-user';
  user.href = `https://bsky.app/profile/${encodeURIComponent(did)}`;
  user.target = '_blank';
  user.rel = 'noopener';
  text.append(document.createTextNode('Viewing '), user, document.createTextNode('’s shared cookbook'));
  banner.append(text);
  if (hasSessionHint()) {
    const close = el('a', 'shared-cookbook-close', '✕') as HTMLAnchorElement;
    close.dataset['testid'] = 'shared-cookbook-close';
    close.href = './cookbook.html';
    close.setAttribute('aria-label', 'Back to your cookbook');
    close.title = 'Back to your cookbook';
    banner.append(close);
  }
  return {
    element: banner,
    setHandle: (handle) => {
      user.textContent = handle;
      user.href = `https://bsky.app/profile/${encodeURIComponent(handle)}`;
    },
  };
};

type LikedSet = { entries: CachedRecipe[]; authorsByDid: Record<string, string> };

type FeedViewController = {
  /** Swap the feed data + freshness stamp in place (background revalidate).
   *  `liked` rides along on the shared view, whose liked set is caller-loaded. */
  update: (
    entries: CachedRecipe[],
    authorsByDid: Record<string, string>,
    fetchedAt: string,
    liked?: LikedSet,
  ) => void;
};

/** Whose cookbook the feed view shows, and how. Both views carry the same
 *  source control; the labels and default differ (Mine/Both on your own,
 *  Created on someone's shared cookbook). */
type FeedViewScope = {
  /** The cookbook's owner — "Mine"/"Created" filters to this DID; the lazy
   *  liked fetch reads this repo's interactions. */
  subject: { did: string; pds: string };
  /** Your own signed-in cookbook? Gates the sticky source pref, the Mine (vs
   *  Created) label, the Both (vs Created) default, and the New Recipe link. */
  isOwn: boolean;
  /** Shared view only: the subject's liked recipes, preloaded by the caller
   *  (showFeed loads them with the feed; the own view lazy-fetches instead). */
  liked?: LikedSet;
};

const renderFeedView = (
  container: HTMLElement,
  feedContainer: HTMLElement,
  header: HTMLElement,
  initialEntries: CachedRecipe[],
  initialAuthorsByDid: Record<string, string>,
  view: FeedViewScope,
  initialFetchedAt?: string | null,
): FeedViewController => {
  // Cookbook opens on Details (the reading-oriented view); Browse keeps its
  // tiles-first default. Persisted per-consumer, so a choice here is sticky.
  const prefs = createBrowsePrefs({ prefix: 'cookbook', defaultView: 'details' });
  const tastePreference = createTastePreference();
  let state = prefs.load();

  // Transient text-search query (D7): not persisted. The MiniSearch index is
  // memoized on the active source's array identity (D6) — facet toggles reuse it;
  // a source switch or a feed update() rebuilds.
  let query = '';
  const searchMemo = createSearchMemo();
  // Feed data is mutable so a background revalidate can swap it in place without
  // rebuilding the toolbar/source-control chrome (built once below).
  let entries = initialEntries;
  let authorsByDid = initialAuthorsByDid;
  let fetchedAt: string | null = initialFetchedAt ?? null;

  // Source filter (OQ6): Mine/Created = the loaded feed filtered to the
  // subject's DID; Liked = the subject's hearted recipes (a SEPARATE fetch —
  // lazy on the own view per OQ12, preloaded on the shared view); Both =
  // Mine + Liked, deduped. The whole members feed ("All") is not a cookbook
  // view — that's what Browse is for.
  type Source = CookbookSource;
  // Own view: default Both (your cookbook = what you made + what you
  // collected), sticky via the source pref. Shared view: default Created —
  // you open someone's cookbook for what THEY make; their likes are one tap
  // away (owner decision 2026-07-16). Not persisted (per-visit).
  const defaultSource: Source = view.isOwn ? 'both' : 'mine';
  const sourcePref = createSourcePref();
  let source: Source = view.isOwn ? sourcePref.load(defaultSource) : defaultSource;
  // null = not fetched yet (own-view lazy load); the shared view arrives with
  // its liked set (possibly empty) already loaded.
  let likedEntries: CachedRecipe[] | null = view.liked?.entries ?? null;
  // Liked recipes' author handles (resolved with each ref) — merged under the
  // feed's own map at render, so liked entries show a real author.
  let likedAuthorsByDid: Record<string, string> = view.liked?.authorsByDid ?? {};
  let likedLoading = false;
  // Set by the source control so the shared reset can also clear the source
  // line back to the default.
  let resetSource: (() => void) | null = null;

  const mineEntries = (): CachedRecipe[] => entries.filter((e) => didOf(e.uri) === view.subject.did);
  const activeEntries = (): CachedRecipe[] => {
    if (source === 'mine') return mineEntries();
    if (source === 'liked') return likedEntries ?? [];
    // Both: created + liked, deduped by uri (a self-liked recipe shows once).
    const mine = mineEntries();
    const seen = new Set(mine.map((e) => e.uri));
    return [...mine, ...(likedEntries ?? []).filter((e) => !seen.has(e.uri))];
  };
  const emptyMessage = (): string => {
    if (!view.isOwn) {
      return source === 'liked'
        ? 'They haven’t liked any recipes yet.'
        : source === 'mine'
          ? 'They haven’t published any recipes yet.'
          : 'This cookbook is empty — nothing published or liked yet.';
    }
    return source === 'liked'
      ? 'No liked recipes yet — tap the heart on a recipe to collect it here.'
      : source === 'mine'
        ? 'You haven’t published any recipes yet.'
        : 'Your cookbook is empty — publish a recipe, or tap the heart on one to collect it here.';
  };

  // The active source narrowed by the standing taste preference (Settings) —
  // the eligible pool behind the count, the facet dropdowns, and the shown
  // set, mirroring Browse.
  const eligibleEntries = (): CachedRecipe[] => {
    const taste = tastePreference.load();
    return activeEntries().filter((e) => matchesTaste(recipeFacets(e.value), taste));
  };

  // Selected facets absent from the eligible pool are kept in state but inert.
  const effectiveState = (): BrowseState => {
    const available = availableFacets(eligibleEntries());
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
    s.photosOnly || s.facets.cuisine.length > 0 || s.facets.category.length > 0 || query.trim() !== '';

  // The searcher indexes a superset of the active source — `entries` for Mine
  // (a subset, so the superset index covers it), the separately fetched
  // `likedEntries` for Liked, and their memoized concatenation for Both. Each
  // reference is stable across facet toggles; a source switch, liked load, or
  // feed update() hands a new array and rebuilds.
  let bothBase: { entries: CachedRecipe[]; liked: CachedRecipe[] | null; merged: CachedRecipe[] } | null = null;
  const indexBase = (): readonly CachedRecipe[] => {
    if (source === 'mine') return entries;
    if (source === 'liked') return likedEntries ?? [];
    if (bothBase === null || bothBase.entries !== entries || bothBase.liked !== likedEntries) {
      bothBase = { entries, liked: likedEntries, merged: [...entries, ...(likedEntries ?? [])] };
    }
    return bothBase.merged;
  };

  const renderCurrent = (): void => {
    if (source === 'liked' && likedLoading) {
      feedContainer.replaceChildren(el('p', 'status', 'loading your liked recipes…'));
      return;
    }
    const eligible = eligibleEntries();
    const effective = effectiveState();
    const facetFiltered = eligible.filter((e) => matchesFilter(e.value, { state: effective, diet: [] }));
    // Text search after the facet filter, before render (D5).
    const shown = queryEntries(searchMemo(indexBase()), query, facetFiltered);
    // Filtered: the honest "X of N recipes" — "X/N" at phone widths, where the
    // long form pushes the reset + count off the controls row.
    toolbar.setStatus(
      hasFilters(effective)
        ? `${shown.length} of ${eligible.length} recipes`
        : `${eligible.length} ${eligible.length === 1 ? 'recipe' : 'recipes'}`,
      hasFilters(effective) ? `${shown.length}/${eligible.length}` : undefined,
    );
    // The reset (in the count block) clears the whole filter line — facets,
    // photos, AND the source — so it shows whenever any is off-default.
    toolbar.setResetVisible(hasFilters(effective) || source !== defaultSource);
    // Filters ▾ badge = active browse filters (photos + facets); the query is a
    // separate row-1 control.
    toolbar.setFilterCount(
      (effective.photosOnly ? 1 : 0) + effective.facets.cuisine.length + effective.facets.category.length,
    );
    if (shown.length === 0) {
      // Both paints your own recipes while the liked fetch is in flight; with
      // nothing of yours to show, say "loading" rather than a premature empty.
      feedContainer.replaceChildren(
        source === 'both' && likedLoading
          ? el('p', 'status', 'loading your liked recipes…')
          : el('p', 'empty-state', emptyMessage()),
      );
      return;
    }
    const render = state.view === 'details' ? renderRecipeDetailsList : renderRecipeList;
    // Feed/member handles win on conflict (they're the page's primary source).
    feedContainer.replaceChildren(render(shown, { authorsByDid: { ...likedAuthorsByDid, ...authorsByDid } }));
  };
  const showCurrent = (): void => {
    toolbar.rebuildFacets(availableFacets(eligibleEntries()), state.facets);
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
      onQueryChange: (q) => {
        query = q;
        renderCurrent();
      },
      onReset: () => {
        state = { ...state, photosOnly: false, facets: { cuisine: [], category: [] } };
        prefs.save(state);
        query = '';
        toolbar.setSearch('');
        toolbar.setPhotos(false);
        if (resetSource !== null) resetSource(); // also clear the source line
        showCurrent();
      },
    },
  });
  toolbar.setPhotos(state.photosOnly);
  toolbar.reflectView(state.view);
  container.insertBefore(toolbar.element, feedContainer);

  // Source control — on every cookbook view, subject-relative: your own reads
  // Mine | Liked | Both; someone's shared cookbook reads Created | Liked | Both
  // (same keys + testids, only the first label differs).
  {
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
    // Lazy-load the liked feed (OQ12): a separate cross-PDS fetch of the
    // subject's hearted recipes, cached after the first load. Kicked off on
    // selecting a liked-bearing source (Liked or Both) AND on mount when one is
    // the active source. The shared view arrives with liked preloaded
    // (likedEntries !== null), so this never fires there.
    const loadLiked = (): void => {
      likedLoading = true;
      void (async () => {
        try {
          const interactions = await listInteractionsFor({
            pds: view.subject.pds,
            did: view.subject.did,
            kind: 'liked',
          });
          const liked = await loadLikedFeed(interactions);
          likedEntries = liked.entries;
          likedAuthorsByDid = liked.authorsByDid;
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
      if (view.isOwn) sourcePref.save(source); // sticky across visits (own only)
      reflectSource();
      if (key !== 'mine' && likedEntries === null) {
        loadLiked(); // sets likedLoading = true
        // Liked shows its loading line immediately; Both paints Mine now and
        // merges the liked recipes in when the fetch lands (showCurrent above).
        renderCurrent();
        return;
      }
      showCurrent();
    };
    // Let the shared reset clear the source line back to the default; the
    // caller re-renders. A liked-bearing default needs the liked feed, so kick
    // off the lazy fetch if it hasn't happened yet.
    resetSource = (): void => {
      if (source === defaultSource) return;
      source = defaultSource;
      if (view.isOwn) sourcePref.save(source);
      reflectSource();
      if (defaultSource !== 'mine' && likedEntries === null) loadLiked();
    };
    seg.append(
      mk(view.isOwn ? 'Mine' : 'Created', 'mine', 'source-mine'),
      mk('Liked', 'liked', 'source-liked'),
      mk('Both', 'both', 'source-both'),
    );
    reflectSource();
    // The source control leads the search row (toolbar row 1), before the
    // input — pick the context, then search it on the same line.
    toolbar.sourceSlot.append(seg);
    // Active source needs the liked feed (Liked, or the own-view default Both)?
    // Kick off the lazy load now so the initial paint isn't missing them.
    if (source !== 'mine' && likedEntries === null) loadLiked();
  }

  // "New Recipe" builder link rides the title row, right-aligned (own cookbook
  // only — mirrors Alchemy's own new-recipe button).
  if (view.isOwn) {
    const newRecipe = el('a', 'button button--primary new-recipe', 'New Recipe') as HTMLAnchorElement;
    newRecipe.href = './editor.html';
    newRecipe.dataset['testid'] = 'cookbook-new-recipe';
    header.append(newRecipe);
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
    update: (nextEntries, nextAuthorsByDid, nextFetchedAt, nextLiked) => {
      entries = nextEntries;
      authorsByDid = nextAuthorsByDid;
      if (nextLiked !== undefined) {
        likedEntries = nextLiked.entries;
        likedAuthorsByDid = nextLiked.authorsByDid;
      }
      fetchedAt = nextFetchedAt;
      updateFreshness();
      showCurrent();
    },
  };
};

/** Load a cookbook feed and mount the toolbar-driven view. Two scopes:
 *  - OWN view (isOwn): resolve your cookbook members (reach prefs) → their
 *    recipes; the Mine | Liked | Both control narrows client-side.
 *  - SHARED view (?did=): EXACTLY the owner's cookbook — their recipes + their
 *    likes, deduped, own first (owner decision 2026-07-16). No member fan-out;
 *    a liked-fetch failure degrades to own-only, never blanks the feed.
 *  Both paint cache-first from the persisted meta and revalidate after. */
const showFeed = async (
  container: HTMLElement,
  feedContainer: HTMLElement,
  header: HTMLElement,
  you: { did: string; pds: string },
  opts: { config?: ReachConfig; isOwn?: boolean; handle?: string } = {},
): Promise<void> => {
  const isOwn = opts.isOwn === true;
  let controller: FeedViewController | null = null;

  // 1) Cache-first paint: if we've resolved this cookbook before, render the
  //    persisted authors' recipes — plus, on the shared view, the recipes
  //    behind the persisted liked uris (liked recipes live on OTHER authors'
  //    repos, so the author filter alone can't cover them) — straight from the
  //    IndexedDB cache. Instant, no network; the freshness note shows the age.
  const meta = readFeedMeta(you.did);
  if (meta !== null && meta.authors.length > 0) {
    try {
      const memberDids = new Set(meta.authors.map((a) => a.did));
      const likedUris = new Set(meta.likedUris ?? []);
      const cachedAll = await createRecipeCache().list();
      const cachedEntries = cachedAll.filter((e) => memberDids.has(didOf(e.uri)));
      const authorsByDid = Object.fromEntries(meta.authors.map((a) => [a.did, a.handle]));
      const view: FeedViewScope = isOwn
        ? { subject: you, isOwn }
        : {
            subject: you,
            isOwn,
            // Cached liked bodies; the handles arrive with the revalidate.
            liked: { entries: cachedAll.filter((e) => likedUris.has(e.uri)), authorsByDid: {} },
          };
      controller = renderFeedView(container, feedContainer, header, cachedEntries, authorsByDid, view, meta.fetchedAt);
    } catch (err) {
      log.warn('cookbook', 'cache-first paint failed', { error: String(err) });
    }
  }

  // 2) Revalidate in the background (or the foreground on a cold first visit).
  try {
    let loaded: {
      entries: CachedRecipe[];
      authorsByDid: Record<string, string>;
      meta: FeedMeta;
      liked?: LikedSet;
    };
    const now = new Date().toISOString();
    if (isOwn) {
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
      loaded = { entries: feed.entries, authorsByDid: feed.authorsByDid, meta: { authors, fetchedAt: now } };
    } else {
      // Shared scope: the owner's own recipes + the recipes they liked. The
      // liked set stays separate — the feed view's Created | Liked | Both
      // control does the narrowing/merging.
      const authors = [{ did: you.did, handle: opts.handle ?? you.did }];
      const feed = await loadAuthorsFeed(authors);
      if (feed.failedAuthors.length > 0) {
        log.warn('cookbook', 'shared cookbook owner unavailable', { failed: feed.failedAuthors });
      }
      let liked: LikedSet = { entries: [], authorsByDid: {} };
      try {
        liked = await loadLikedFeed(await listInteractionsFor({ pds: you.pds, did: you.did, kind: 'liked' }));
      } catch (err) {
        log.warn('cookbook', 'shared liked load failed — showing published only', { error: String(err) });
      }
      loaded = {
        entries: feed.entries,
        authorsByDid: feed.authorsByDid,
        liked,
        meta: { authors, fetchedAt: now, likedUris: liked.entries.map((e) => e.uri) },
      };
    }
    writeFeedMeta(you.did, loaded.meta);
    if (controller !== null) controller.update(loaded.entries, loaded.authorsByDid, now, loaded.liked);
    else {
      const view: FeedViewScope = isOwn ? { subject: you, isOwn } : { subject: you, isOwn, liked: loaded.liked };
      renderFeedView(container, feedContainer, header, loaded.entries, loaded.authorsByDid, view, now);
    }
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
  // Title row: "Cookbook" + the share icon grouped on the left; the
  // own-cookbook "New Recipe" link is added to the right of the row by
  // renderFeedView (viewer-only).
  const header = el('div', 'cookbook-header');
  const titleGroup = el('div', 'cookbook-title-group');
  titleGroup.append(el('h2', 'section-title', 'Cookbook'));
  header.append(titleGroup);
  content.append(header);

  const viewedDid = new URLSearchParams(window.location.search).get('did');
  const feedContainer = el('div');
  feedContainer.dataset['testid'] = 'cookbook-feed';

  if (viewedDid !== null && viewedDid !== '') {
    // Public cold-view: anyone's recipe feed, no auth. Members live on Account,
    // so the cold-view is feed-only. The shared-cookbook banner labels whose
    // cookbook this is, at the top of the panel under the site banner.
    const banner = renderSharedBanner(viewedDid);
    content.prepend(banner.element);
    content.append(feedContainer);
    mountCookbookShare(titleGroup, viewedDid);
    mountShell(app, content);
    void mountBuildStamp(app);
    try {
      const { pds, handle } = await resolveDidDoc(viewedDid);
      if (handle !== null) banner.setHandle(handle);
      await showFeed(
        content,
        feedContainer,
        header,
        { did: viewedDid, pds },
        handle === null ? {} : { handle },
      );
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
  mountCookbookShare(titleGroup, did);
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
