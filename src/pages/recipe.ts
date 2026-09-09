// Recipe detail page (5d): recipe.html?u=<at-uri>[&by=<handle>] — a real,
// shareable document. Cache-first; a cold link (no prior cache) resolves the
// author's PDS from the DID, fetches the record, Tier 2-verifies it, and
// caches it like any other read.

// NOTE: bootSession (and its heavy @atproto/api dependency) is imported
// DYNAMICALLY inside mountComments — the shareable recipe page renders its
// detail from the light read path, and the auth client loads only after, as a
// split chunk. Do not add a static `import ... boot.js` here (it would pull
// @atproto/api back into the recipe entry bundle).
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { dishKeyOf, isPrimaryVersion, siblingsOf } from '../recipes/model.js';
import { createRecipeReader, createRecordReader } from '../recipes/read.js';
import { describePlanned } from '../recipes/planned-index.js';
import { createPlannedIndexCache } from '../recipes/planned-index-local.js';
import { isStale, strongRefOf } from '../recipes/refs.js';
import { retryOnce } from '../retry.js';
import { renderFocusView, renderRecipeDetail, renderVersionBar } from '../recipes/view.js';
import { addComment, buildThread, loadRecipeComments, type CommentRepo } from '../social/comments.js';
import { renderComments } from '../social/comments-view.js';
import { resolveCookbook } from '../social/cookbook.js';
import { createReachPrefs } from '../social/reach.js';
import {
  addInteraction,
  loadRecipeInteractions,
  removeInteraction,
  summarize,
  withOwnInteraction,
  type Interaction,
  type InteractionRepo,
} from '../social/interactions.js';
import { createShoppingPrefs } from '../recipes/shopping-prefs.js';
import { createSocialPrefs } from '../social/prefs.js';
import { renderShareButton, shareOrigin } from '../share/button.js';
import { buildRecipeShareUrl } from '../share/urls.js';
import { registerServiceWorker } from '../sw-register.js';
import { mountTimerStrip } from '../timers/timer-strip.js';
import { createScreenWakeLock } from '../ui/wake-lock.js';
import type { Agent } from '@atproto/api';

/** Memoized loader for the deferred auth client — comments + interactions
 * share one load so @atproto/api is fetched (as a split chunk) at most once. */
type AgentLoader = () => Promise<Agent | null>;

// Per-recipe cookbook-discovery fan-out bound (CB1 open-question resolution):
// read at most this many cookbook members per recipe view. Members arrive in
// source priority (you → starter → follow → follower), so the cap favors the
// high-signal sources over a potentially-large followers set. Applied with a
// log line — never a silent truncation. The Cookbook feed (CB5) reads all
// members; only per-recipe discovery caps.
const COOKBOOK_DISCOVERY_CAP = 50;

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

type ParsedAtUri = { did: string; collection: string; rkey: string };

const parseAtUri = (uri: string): ParsedAtUri => {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (match === null) throw new Error(`not a valid at:// URI: ${uri}`);
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
};

const loadRecipe = async (
  uri: string,
): Promise<{ entry: CachedRecipe; author: string; fromCache: boolean }> => {
  const { did, rkey } = parseAtUri(uri);
  const byParam = new URLSearchParams(window.location.search).get('by');
  const cache = createRecipeCache();

  const cached = await cache.get(uri);
  if (cached !== undefined) {
    log.debug('recipes', 'detail served from cache', { uri });
    return { entry: cached, author: byParam ?? did, fromCache: true };
  }

  // Cold link: fetch, verify, cache — same trust path as any read.
  log.debug('recipes', 'cold link — fetching', { uri });
  const { pds, handle } = await resolveDidDoc(did);
  const record = await createRecordReader()({ pds, did, rkey });
  const entry = await cache.put(record);
  return { entry, author: byParam ?? handle ?? did, fromCache: false };
};

/** Versioning (Phase 8): a cached view pins a CID; if the live record moved
 * on, offer a quiet refresh. Both edges matter: same CID → no indicator. */
const checkForNewerRevision = async (
  uri: string,
  pinnedCid: string,
  onStale: (refresh: () => Promise<CachedRecipe>) => void,
): Promise<void> => {
  const { did, rkey } = parseAtUri(uri);
  try {
    // retryOnce: best-effort, tolerant of a transient first failure; the
    // final warn keeps a missed staleness diagnosable from the console.
    await retryOnce(async () => {
      const { pds } = await resolveDidDoc(did);
      const record = await createRecordReader()({ pds, did, rkey });
      if (!isStale({ pinnedCid, currentCid: record.cid })) return;
      log.info('recipes', 'newer revision available', { uri, pinnedCid, currentCid: record.cid });
      onStale(async () => createRecipeCache().put(record));
    });
  } catch (err) {
    log.warn('recipes', 'revision check failed', { uri, error: String(err) });
  }
};

/** Comment section (Phase 9b): cookbook-scoped discovery — read comments from
 * the recipe author + (signed in) you + your cookbook; thread + render; compose
 * + reply when signed in. Honors the Hide Comments social pref. */
const mountComments = async (
  content: HTMLElement,
  entry: CachedRecipe,
  uri: string,
  getAgent: AgentLoader,
): Promise<void> => {
  if (createSocialPrefs().hideComments()) {
    log.debug('comments', 'comment section hidden by social pref');
    return;
  }

  const box = el('section', 'comments');
  box.append(el('h3', 'section-title', 'Comments'));
  const threadMount = el('div');
  threadMount.dataset['testid'] = 'comments-thread-mount';
  box.append(threadMount);
  content.append(box);

  const authorsByDid: Record<string, string> = {};
  const repos: CommentRepo[] = [];
  const addRepo = async (did: string): Promise<void> => {
    if (repos.some((r) => r.did === did)) return;
    try {
      const { pds, handle } = await resolveDidDoc(did);
      repos.push({ did, pds });
      if (handle !== null) authorsByDid[did] = handle;
    } catch (err) {
      log.warn('comments', 'could not resolve a comment repo', { did, error: String(err) });
    }
  };

  let agent: Agent | null = null;
  let replyParent: string | null = null;
  let replyingNote: HTMLElement | null = null;
  let textarea: HTMLTextAreaElement | null = null;
  const beginReply = (parentUri: string): void => {
    replyParent = parentUri;
    if (replyingNote !== null) replyingNote.hidden = false;
    textarea?.focus();
  };

  const refresh = async (): Promise<void> => {
    const comments = await loadRecipeComments(uri, repos);
    const tree = buildThread(comments);
    threadMount.replaceChildren(
      renderComments(tree, {
        recipeCid: entry.cid,
        authorsByDid,
        onReply: agent === null ? undefined : beginReply,
      }),
    );
  };

  // Render the recipe author's comments FIRST with no auth loaded — the
  // shareable page stays light; the recipe detail is already on screen.
  await addRepo(parseAtUri(uri).did);
  await refresh();

  // Load the auth client (shared, deferred split chunk — see getAgent in main).
  // Signed in → add you + your cookbook to discovery and enable composing;
  // signed out → a sign-in pointer.
  agent = await getAgent();

  const signedInAgent = agent;
  if (signedInAgent?.did !== undefined) {
    const me = signedInAgent.did;
    await addRepo(me);
    try {
      const { pds } = await resolveDidDoc(me);
      // Cookbook-scoped discovery (CB1): comments come from repos we know — the
      // recipe author (added above) + you + your cookbook (starters + Bluesky
      // follows + followers). Replaces the dropped app.arecipe.friend graph.
      const members = await resolveCookbook({ you: { did: me, pds }, config: createReachPrefs().load() });
      const capped = members.slice(0, COOKBOOK_DISCOVERY_CAP);
      if (capped.length < members.length) {
        log.info('comments', 'cookbook discovery capped', {
          reading: capped.length,
          of: members.length,
        });
      }
      for (const member of capped) await addRepo(member.did);
    } catch (err) {
      log.warn('comments', 'could not load cookbook for comment discovery', {
        error: String(err),
      });
    }

    const form = el('form', 'comment-compose') as HTMLFormElement;
    form.dataset['testid'] = 'comment-compose';
    textarea = document.createElement('textarea');
    textarea.dataset['testid'] = 'comment-text';
    textarea.placeholder = 'Add a comment…';
    replyingNote = el('p', 'status', 'replying to a comment · ');
    replyingNote.dataset['testid'] = 'comment-replying';
    replyingNote.hidden = true;
    const cancelReply = el('button', 'button', 'cancel') as HTMLButtonElement;
    cancelReply.type = 'button';
    cancelReply.addEventListener('click', () => {
      replyParent = null;
      if (replyingNote !== null) replyingNote.hidden = true;
    });
    replyingNote.append(cancelReply);
    const post = el('button', 'button button--primary comment-post', 'Post comment') as HTMLButtonElement;
    post.type = 'submit';
    post.dataset['testid'] = 'comment-post';
    const status = el('p', 'status');
    status.dataset['testid'] = 'comment-status';
    form.append(replyingNote, textarea, post, status);
    box.append(form);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = textarea?.value.trim() ?? '';
      if (text === '') return;
      status.textContent = 'posting…';
      const parent = replyParent ?? undefined;
      void addComment(signedInAgent, { recipe: strongRefOf(entry), text, parent })
        .then(async () => {
          if (textarea !== null) textarea.value = '';
          replyParent = null;
          if (replyingNote !== null) replyingNote.hidden = true;
          status.textContent = '';
          await refresh();
        })
        .catch((err: unknown) => {
          log.error('comments', 'post failed', { error: String(err) });
          status.textContent = `couldn’t post: ${String(err)}`;
        });
    });
    // Re-render with the enriched discovery set (you + cookbook) + reply buttons.
    await refresh();
  } else {
    const note = el('p', 'status', 'Sign in on Alchemy to join the conversation.');
    note.dataset['testid'] = 'comment-signed-out';
    box.append(note);
  }
};

/** Interactions (Phase 9c): a cookbook-scoped like count + a heart on the recipe
 * page — like is the single interaction (the private `saved` toggle was removed).
 * Reading is public (author + you + cookbook); liking needs a session (deferred,
 * shared auth). Liking lives here, not on Browse — Browse stays zero-auth. Honors
 * the Hide Likes social pref. */
const mountInteractions = async (
  content: HTMLElement,
  entry: CachedRecipe,
  uri: string,
  getAgent: AgentLoader,
): Promise<void> => {
  if (createSocialPrefs().hideLikes()) {
    log.debug('interactions', 'interactions hidden by social pref');
    return;
  }

  const overlay = el('div', 'like-overlay');
  overlay.dataset['testid'] = 'interactions';
  const likeBtn = el('button', 'button like-btn') as HTMLButtonElement;
  likeBtn.type = 'button';
  likeBtn.dataset['testid'] = 'like-button';
  // Start disabled: the button is only enabled once we're signed in AND the
  // click handler is attached (see below). Without this, the freshly-created
  // button is momentarily enabled with no listener — a click in that window
  // (fast test, or fast user) is silently lost.
  likeBtn.disabled = true;
  const likeCount = el('span', 'like-count');
  likeCount.dataset['testid'] = 'like-count';
  // The heart is glyph-only (♡ → ♥ on like); the count lives in the bottom
  // credit line, not beside the heart.
  overlay.append(likeBtn);
  // Mount the heart as an overlay in the banner's upper-right; the count goes in
  // the bottom-right, after the image-source credit (or its own corner element
  // when the image has no credit). `.photo-wrap--banner` exists in `content`
  // because renderRecipeDetail ran before mountInteractions; the placeholder
  // banner renders too, so both keep their spots (OQ7). Missing banner is logged.
  const banner = content.querySelector('.photo-wrap--banner');
  if (banner !== null) {
    banner.append(overlay);
    const credit = banner.querySelector('.photo-credit');
    if (credit !== null) {
      credit.append(document.createTextNode(' · '), likeCount); // "<source> · N likes"
    } else {
      const countCredit = el('span', 'photo-credit');
      countCredit.dataset['testid'] = 'like-count-credit';
      countCredit.append(likeCount);
      banner.append(countCredit);
    }
  } else {
    log.warn('interactions', 'banner node missing for like overlay — appending to content');
    overlay.append(likeCount);
    content.append(overlay);
  }

  const repos: InteractionRepo[] = [];
  const addRepo = async (did: string): Promise<void> => {
    if (repos.some((r) => r.did === did)) return;
    try {
      const { pds } = await resolveDidDoc(did);
      repos.push({ did, pds });
    } catch (err) {
      log.warn('interactions', 'could not resolve an interaction repo', { did, error: String(err) });
    }
  };

  let agent: Agent | null = null;
  let viewerDid: string | null = null;
  let interactions: Interaction[] = [];
  const strong = strongRefOf(entry);

  const render = (): void => {
    const { likeCount: n, youLiked } = summarize(interactions, viewerDid);
    likeCount.textContent = n === 1 ? '1 like' : `${n} likes`;
    // Glyph-only heart: outline ♡ → filled ♥ on like. Label carries the meaning
    // for screen readers since there's no visible text.
    likeBtn.textContent = youLiked ? '♥' : '♡';
    likeBtn.setAttribute('aria-label', youLiked ? 'Liked' : 'Like');
    likeBtn.setAttribute('aria-pressed', String(youLiked));
    likeBtn.classList.toggle('is-active', youLiked);
    likeBtn.disabled = agent === null; // signed-out: count is read-only
  };
  const refresh = async (): Promise<void> => {
    interactions = await loadRecipeInteractions(uri, repos);
    render();
  };

  // Author's counts first — read-only, no auth (keeps the page light).
  await addRepo(parseAtUri(uri).did);
  await refresh();

  agent = await getAgent();
  const signedInAgent = agent;
  if (signedInAgent?.did !== undefined) {
    viewerDid = signedInAgent.did;
    const me = signedInAgent.did;
    const toggle = (kind: 'liked', has: () => boolean) => (): void => {
      void (async () => {
        try {
          if (has()) {
            await removeInteraction(signedInAgent, { recipeUri: uri, kind });
            interactions = withOwnInteraction(interactions, me, uri, kind, null);
          } else {
            const res = await addInteraction(signedInAgent, { kind, recipe: strong });
            interactions = withOwnInteraction(interactions, me, uri, kind, {
              uri: res.uri,
              cid: res.cid,
              kind,
              recipe: strong,
              author: me,
              createdAt: new Date().toISOString(),
            });
          }
          // Reflect the viewer's OWN toggle immediately from the write result —
          // do NOT re-read here (an immediate listRecords can race the PDS's
          // read-after-write and blank the count). Others' interactions were
          // loaded above; a later page load reconciles.
          render();
        } catch (err) {
          log.error('interactions', 'toggle failed', { kind, error: String(err) });
        }
      })();
    };
    // Attach the handler + enable the button BEFORE the (slow) cookbook
    // discovery — the discovery only enriches others' counts; toggling your own
    // like needs just your session. This closes the enabled-without-listener
    // race that dropped the first like click.
    likeBtn.addEventListener('click', toggle('liked', () => summarize(interactions, viewerDid).youLiked));
    await addRepo(viewerDid);
    render(); // agent is set + listener live → enable the control now

    try {
      const { pds } = await resolveDidDoc(viewerDid);
      // Cookbook-scoped like discovery (CB2): counts come from repos we know —
      // the recipe author (added above) + you + your cookbook. Same capped,
      // priority-ordered scope as comment discovery.
      const members = await resolveCookbook({ you: { did: viewerDid, pds }, config: createReachPrefs().load() });
      const capped = members.slice(0, COOKBOOK_DISCOVERY_CAP);
      if (capped.length < members.length) {
        log.info('interactions', 'cookbook discovery capped', {
          reading: capped.length,
          of: members.length,
        });
      }
      for (const member of capped) await addRepo(member.did);
    } catch (err) {
      log.warn('interactions', 'could not load cookbook for interaction discovery', {
        error: String(err),
      });
    }
    await refresh(); // re-render with your state + cookbook counts
  }
};

/** Shared deferred auth loader — comments + interactions fetch @atproto/api (a
 * split chunk) at most once, only after the detail is on screen. */
const makeAgentLoader = (): AgentLoader => {
  let agentPromise: Promise<Agent | null> | null = null;
  return () => {
    agentPromise ??= (async () => {
      try {
        const boot = await import('../auth/boot.js');
        return (await boot.bootSession()).agent;
      } catch (err) {
        log.warn('recipes', 'auth client load failed', { error: String(err) });
        return null;
      }
    })();
    return agentPromise;
  };
};

/** ⛶ Focus mode: full-screen, distraction-free cook view of one version. Uses
 * the Fullscreen API when available (we're inside the button's click gesture),
 * with a full-viewport overlay as the fallback; Esc or Exit closes it. Holds a
 * screen wake lock for the duration (silent where unsupported) so the phone
 * doesn't sleep mid-recipe; exiting by any route releases it. */
const mountFocus = (entry: CachedRecipe): void => {
  const wakeLock = createScreenWakeLock();
  // Running-timers strip in the focus top bar (A-D6): read-only, silent when
  // idle. Its tick is stopped on every exit route alongside the wake lock.
  const timerStripHost = el('div', 'focus-timer-strip-host');
  const timerStrip = mountTimerStrip(timerStripHost);
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeFocus();
  };
  function closeFocus(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    timerStrip.stop();
    void wakeLock.release();
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
  }
  const overlay = renderFocusView(entry, { onExit: closeFocus, wakeLock, timerStripHost });
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  // On by default and visible (D2): acquire as we enter. acquire() never throws —
  // unsupported/denied resolve false and the wake status simply stays empty.
  void wakeLock.acquire();
  // The overlay IS the focus view; the Fullscreen API is a desktop enhancement.
  // Skip it on touch/coarse-pointer devices (iOS Safari has no element
  // fullscreen and can be hostile) and guard against a synchronous throw so a
  // fullscreen hiccup can never break the button. The overlay already shows.
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches === true;
    const request = coarse ? undefined : overlay.requestFullscreen?.bind(overlay);
    if (request !== undefined) void request().catch(() => undefined);
  } catch {
    /* fullscreen unavailable/blocked — the overlay stands on its own */
  }
};

/** Render one version into `host`: detail + (initial only) staleness check +
 * hide button + social sections. Called for the initial recipe and on every
 * version flip, so comments/interactions re-mount for the shown version. */
const paintVersion = (
  host: HTMLElement,
  entry: CachedRecipe,
  uri: string,
  author: string,
  getAgent: AgentLoader,
  opts: { checkStale: boolean },
): void => {
  const shoppingPrefs = createShoppingPrefs().load();
  host.replaceChildren(
    renderRecipeDetail(entry, {
      author,
      onFocus: () => mountFocus(entry),
      showFunFacts: createSocialPrefs().includeFunFacts(),
      // Ingredient substitutions (⇄): opt-in here, seeded on when the cook set
      // "Always apply substitutions" on the Account page.
      substitutions: shoppingPrefs.substitutions,
      applySubstitutions: shoppingPrefs.alwaysApplySubstitutions,
    }),
  );
  // Share affordance: a one-tap share ICON beside the title — the same icon-only
  // control the cookbook heading carries — wired to the canonical
  // recipe.html?u=…[&by=…] URL for the version currently shown (rebuilt per
  // version because paintVersion runs on every flip). URL is normalized from
  // the page's own u/by via buildRecipeShareUrl, not echoed raw.
  const titleRow = host.querySelector('.recipe-title-row');
  if (titleRow !== null) {
    const name = (entry.value as { name?: string }).name;
    titleRow.append(
      renderShareButton({
        url: buildRecipeShareUrl(shareOrigin(), uri, author),
        title: name ?? 'Recipe',
        label: 'Share',
        ariaLabel: 'Share this recipe',
        testid: 'share-recipe',
        icon: true,
      }),
    );
  }
  if (opts.checkStale) {
    void checkForNewerRevision(uri, entry.cid, (refresh) => {
      const note = document.createElement('p');
      note.className = 'status';
      note.dataset['testid'] = 'stale-indicator';
      note.textContent = 'this recipe was updated since you last viewed it · ';
      const refreshLink = document.createElement('button');
      refreshLink.type = 'button';
      refreshLink.className = 'button';
      refreshLink.dataset['testid'] = 'refresh-recipe';
      refreshLink.textContent = 'Show latest';
      refreshLink.addEventListener('click', () => {
        void refresh().then((fresh) => paintVersion(host, fresh, uri, author, getAgent, { checkStale: false }));
      });
      note.append(refreshLink);
      host.prepend(note);
    }).catch((err: unknown) => {
      log.debug('recipes', 'revision check failed', { error: String(err) });
    });
  }
  // Exclusion (mute-lite): quiet, reversible in Settings. Per-version. The
  // control sits at the bottom of the detail, right-aligned in line with the
  // provenance (view.ts's .detail-footer-control-slot). Hiding takes an inline
  // two-step confirm (OQ5 — no native dialog, testable in the hermetic tier);
  // unhiding is one-tap.
  const exclusions = createExclusions();
  const hideControl = el('div', 'hide-control');
  const renderHideControl = (): void => {
    hideControl.replaceChildren();
    const primary = el('button', 'button') as HTMLButtonElement;
    primary.type = 'button';
    primary.dataset['testid'] = 'hide-recipe';
    if (exclusions.isHidden(uri)) {
      // Hidden → one-tap Unhide (no confirm).
      primary.textContent = 'Unhide';
      primary.addEventListener('click', () => {
        exclusions.unhide(uri);
        log.info('exclusions', 'unhidden', { uri });
        renderHideControl();
      });
      hideControl.append(primary);
      return;
    }
    // Visible → Hide, which swaps the control in place to a confirm affordance.
    primary.textContent = 'Hide';
    primary.addEventListener('click', () => {
      hideControl.replaceChildren();
      const note = el('span', 'hide-confirm-note', 'Hide? ');
      const confirm = el('button', 'button', 'Confirm') as HTMLButtonElement;
      confirm.type = 'button';
      confirm.dataset['testid'] = 'hide-confirm';
      confirm.addEventListener('click', () => {
        exclusions.hide(uri);
        log.info('exclusions', 'hidden', { uri });
        renderHideControl();
      });
      const cancel = el('button', 'button', 'Cancel') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.dataset['testid'] = 'hide-cancel';
      cancel.addEventListener('click', () => renderHideControl());
      hideControl.append(note, confirm, cancel);
    });
    hideControl.append(primary);
  };
  renderHideControl();
  const slot = host.querySelector('.detail-footer-control-slot');
  const controlHost = slot ?? host;
  if (slot === null) {
    log.warn('exclusions', 'detail-footer-control-slot missing — appending hide control to host');
  }
  controlHost.append(hideControl);

  // RUN-LAST-PLANNED (D5): the viewer's OWN planning history for this recipe,
  // read from the local planned-index cache. Reads the cache only — never fetches
  // plan records, never touches the PDS, never imports auth. Absent from the
  // index (or no cache) → nothing renders. It shows the VIEWER's history, so on a
  // shared recipe.html?u= link a visitor sees their own or nothing, never the
  // owner's.
  void createPlannedIndexCache()
    .read()
    .then((index) => {
      const entry = index?.get(uri);
      if (entry === undefined || entry.count <= 0) return;
      const line = el('p', 'status last-planned', describePlanned(entry, new Date()));
      line.dataset['testid'] = 'last-planned';
      controlHost.append(line);
    })
    .catch((err: unknown) => log.debug('recipes', 'planned-index read failed', { error: String(err) }));

  // Edit affordance: when the signed-in viewer IS the recipe's author, offer an
  // Edit link (→ editor.html?edit=) beside Hide. The recipe page is where you
  // edit your own published recipe now — the Alchemy "Published" list (which
  // used to carry the edit links) was retired since Cookbook → "Mine" shows them.
  const authorDid = parseAtUri(uri).did;
  void getAgent()
    .then((agent) => {
      if (agent?.did !== authorDid) return; // not signed in, or not your recipe
      const editLink = el('a', 'button edit-recipe', 'Edit') as HTMLAnchorElement;
      editLink.href = `./editor.html?edit=${encodeURIComponent(uri)}`;
      editLink.dataset['testid'] = 'edit-recipe';
      controlHost.prepend(editLink); // sits left of Hide in the footer slot
    })
    .catch((err: unknown) => log.debug('recipes', 'author edit check failed', { error: String(err) }));

  void mountComments(host, entry, uri, getAgent).catch((err: unknown) => {
    log.error('comments', 'comment section failed', { uri, error: String(err) });
  });
  void mountInteractions(host, entry, uri, getAgent).catch((err: unknown) => {
    log.error('interactions', 'interaction section failed', { uri, error: String(err) });
  });
};

/** After the initial version renders, discover the dish's sibling versions and,
 * if there's more than one, add the flip bar above the detail. Flipping repaints
 * the host for the chosen version (per-version comments/interactions) and updates
 * the URL so the view stays shareable. Order: primaryVersion first, then rkey. */
const mountVersionFlip = async (
  content: HTMLElement,
  host: HTMLElement,
  uri: string,
  entry: CachedRecipe,
  author: string,
  getAgent: AgentLoader,
): Promise<void> => {
  const key = dishKeyOf(entry.value);
  if (key === undefined) return; // no dishKey → single, no bar (also skips the list fetch)
  const { did } = parseAtUri(uri);
  const { pds } = await resolveDidDoc(did);
  const all = await createRecipeReader()({ pds, did });
  const siblings = siblingsOf(key, all).sort(
    (a, b) =>
      Number(isPrimaryVersion(b.value)) - Number(isPrimaryVersion(a.value)) || a.uri.localeCompare(b.uri),
  );
  if (siblings.length < 2) return;

  const viewAllHref = `./dish.html?key=${encodeURIComponent(key)}&did=${encodeURIComponent(did)}&by=${encodeURIComponent(author)}`;
  const cache = createRecipeCache();
  let current = Math.max(0, siblings.findIndex((r) => r.uri === uri));
  let bar: HTMLElement | null = null;

  const mountBar = (): void => {
    const next = renderVersionBar({
      index: current,
      total: siblings.length,
      viewAllHref,
      onNav: (delta) => void flipTo((current + delta + siblings.length) % siblings.length),
    });
    if (bar === null) content.insertBefore(next, host);
    else bar.replaceWith(next);
    bar = next;
  };

  const flipTo = async (index: number): Promise<void> => {
    current = index;
    const record = siblings[index];
    if (record === undefined) return;
    const versionEntry = await cache.put(record);
    const name = (versionEntry.value as { name?: string }).name;
    if (name !== undefined) document.title = `${name} — arecipe`;
    window.history.replaceState(null, '', `?u=${encodeURIComponent(record.uri)}&by=${encodeURIComponent(author)}`);
    paintVersion(host, versionEntry, record.uri, author, getAgent, { checkStale: false });
    mountBar();
  };

  mountBar();
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const status = el('p', 'status', 'loading…');
  content.append(status);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  const uri = new URLSearchParams(window.location.search).get('u');
  if (uri === null) {
    status.textContent = 'No recipe given — pick one from Browse.';
    return;
  }
  try {
    const { entry, author, fromCache } = await loadRecipe(uri);
    const name = (entry.value as { name?: string }).name;
    if (name !== undefined) document.title = `${name} — arecipe`;
    const getAgent = makeAgentLoader();
    const host = el('section', 'version-host');
    content.replaceChildren(host);
    paintVersion(host, entry, uri, author, getAgent, { checkStale: fromCache });
    log.debug('shell', 'mounted', { page: 'recipe', uri });
    // Sibling discovery is a background enhancement — the detail is already up.
    void mountVersionFlip(content, host, uri, entry, author, getAgent).catch((err: unknown) => {
      log.debug('recipes', 'version flip setup failed', { uri, error: String(err) });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('recipes', 'detail load failed', { uri, error: message });
    status.textContent = message;
  }
};

void main();
