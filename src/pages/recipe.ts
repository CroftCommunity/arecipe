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
import { createSocialPrefs } from '../social/prefs.js';
import { registerServiceWorker } from '../sw-register.js';
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
    const post = el('button', 'button button--primary', 'Post comment') as HTMLButtonElement;
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
    const note = el('p', 'status', 'Sign in on My recipes to join the conversation.');
    note.dataset['testid'] = 'comment-signed-out';
    box.append(note);
  }
};

/** Interactions (Phase 9c): a cookbook-scoped like count + a heart, plus a
 * save toggle, on the recipe page. Reading is public (author + you + cookbook);
 * liking/saving needs a session (deferred, shared auth). Liking lives here, not
 * on Browse — Browse stays zero-auth. Honors the Hide Likes social pref. */
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

  const box = el('section', 'interactions');
  box.dataset['testid'] = 'interactions';
  const likeBtn = el('button', 'button like-btn') as HTMLButtonElement;
  likeBtn.type = 'button';
  likeBtn.dataset['testid'] = 'like-button';
  const likeCount = el('span', 'like-count');
  likeCount.dataset['testid'] = 'like-count';
  const saveBtn = el('button', 'button save-btn') as HTMLButtonElement;
  saveBtn.type = 'button';
  saveBtn.dataset['testid'] = 'save-button';
  box.append(likeBtn, likeCount, saveBtn);
  content.append(box);

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
    const { likeCount: n, youLiked, youSaved } = summarize(interactions, viewerDid);
    likeCount.textContent = n === 1 ? '1 like' : `${n} likes`;
    likeBtn.textContent = youLiked ? '♥ Liked' : '♡ Like';
    likeBtn.classList.toggle('is-active', youLiked);
    likeBtn.disabled = agent === null; // signed-out: count is read-only
    saveBtn.textContent = youSaved ? 'Saved' : 'Save';
    saveBtn.hidden = agent === null; // saving is a private action
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
    await addRepo(viewerDid);
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
    const me = signedInAgent.did;
    const toggle = (kind: 'liked' | 'saved', has: () => boolean) => (): void => {
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
    likeBtn.addEventListener('click', toggle('liked', () => summarize(interactions, viewerDid).youLiked));
    saveBtn.addEventListener('click', toggle('saved', () => summarize(interactions, viewerDid).youSaved));
    await refresh(); // re-render with your state + cookbook counts + live controls
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
 * with a full-viewport overlay as the fallback; Esc or Exit closes it. */
const mountFocus = (entry: CachedRecipe): void => {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeFocus();
  };
  function closeFocus(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
  }
  const overlay = renderFocusView(entry, { onExit: closeFocus });
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  const request = overlay.requestFullscreen?.bind(overlay);
  if (request !== undefined) void request().catch(() => undefined);
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
  host.replaceChildren(
    renderRecipeDetail(entry, {
      author,
      onFocus: () => mountFocus(entry),
      showFunFacts: createSocialPrefs().includeFunFacts(),
    }),
  );
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
  // Exclusion (mute-lite): quiet, reversible in Settings. Per-version.
  const exclusions = createExclusions();
  const hideButton = document.createElement('button');
  hideButton.type = 'button';
  hideButton.className = 'button';
  hideButton.dataset['testid'] = 'hide-recipe';
  const label = (): string => (exclusions.isHidden(uri) ? 'Unhide this recipe' : 'Hide this recipe');
  hideButton.textContent = label();
  hideButton.addEventListener('click', () => {
    if (exclusions.isHidden(uri)) exclusions.unhide(uri);
    else exclusions.hide(uri);
    hideButton.textContent = label();
    log.info('exclusions', 'toggled', { uri, hidden: exclusions.isHidden(uri) });
  });
  host.append(hideButton);

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
