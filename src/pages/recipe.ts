// Recipe detail page (5d): recipe.html?u=<at-uri>[&by=<handle>] — a real,
// shareable document. Cache-first; a cold link (no prior cache) resolves the
// author's PDS from the DID, fetches the record, Tier 2-verifies it, and
// caches it like any other read.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { createRecordReader } from '../recipes/read.js';
import { isStale, strongRefOf } from '../recipes/refs.js';
import { retryOnce } from '../retry.js';
import { renderRecipeDetail } from '../recipes/view.js';
import { addComment, buildThread, loadRecipeComments, type CommentRepo } from '../social/comments.js';
import { renderComments } from '../social/comments-view.js';
import { listFriends } from '../social/friends.js';
import { createSocialPrefs } from '../social/prefs.js';
import { registerServiceWorker } from '../sw-register.js';
import type { Agent } from '@atproto/api';

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

/** Comment section (Phase 9b): friends-scoped discovery — read comments from
 * the recipe author + (signed in) you + your friends; thread + render; compose
 * + reply when signed in. Honors the Hide Comments social pref. */
const mountComments = async (
  content: HTMLElement,
  entry: CachedRecipe,
  uri: string,
  agent: Agent | null,
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

  // Discovery set: the recipe author always; you + your friends when signed in.
  await addRepo(parseAtUri(uri).did);
  if (agent?.did !== undefined) {
    const me = agent.did;
    await addRepo(me);
    try {
      const { pds } = await resolveDidDoc(me);
      const friends = await listFriends({ pds, did: me });
      for (const friend of friends) await addRepo(friend.subject);
    } catch (err) {
      log.warn('comments', 'could not load friends for comment discovery', { error: String(err) });
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
      void addComment(agent, { recipe: strongRefOf(entry), text, parent })
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
  } else {
    const note = el('p', 'status', 'Sign in on My recipes to join the conversation.');
    note.dataset['testid'] = 'comment-signed-out';
    box.append(note);
  }

  await refresh();
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
  // Session is optional here: reading is public; commenting (9b) needs it.
  const { agent } = await bootSession();
  try {
    const { entry, author, fromCache } = await loadRecipe(uri);
    const name = (entry.value as { name?: string }).name;
    if (name !== undefined) document.title = `${name} — arecipe`;
    content.replaceChildren(renderRecipeDetail(entry, { author }));
    if (fromCache) {
      // Background revision check against the live record (quiet on match).
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
          void refresh().then((fresh) => {
            content.replaceChildren(renderRecipeDetail(fresh, { author }));
          });
        });
        note.append(refreshLink);
        content.prepend(note);
      }).catch((err: unknown) => {
        log.debug('recipes', 'revision check failed', { error: String(err) });
      });
    }
    // Exclusion (mute-lite): quiet, reversible in Settings.
    const exclusions = createExclusions();
    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'button';
    hideButton.dataset['testid'] = 'hide-recipe';
    hideButton.textContent = exclusions.isHidden(uri) ? 'Unhide this recipe' : 'Hide this recipe';
    hideButton.addEventListener('click', () => {
      if (exclusions.isHidden(uri)) exclusions.unhide(uri);
      else exclusions.hide(uri);
      hideButton.textContent = exclusions.isHidden(uri) ? 'Unhide this recipe' : 'Hide this recipe';
      log.info('exclusions', 'toggled', { uri, hidden: exclusions.isHidden(uri) });
    });
    content.append(hideButton);

    // Comments (9b): friends-scoped, below the recipe.
    void mountComments(content, entry, uri, agent).catch((err: unknown) => {
      log.error('comments', 'comment section failed', { uri, error: String(err) });
    });
    log.debug('shell', 'mounted', { page: 'recipe', uri, signedIn: agent !== null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('recipes', 'detail load failed', { uri, error: message });
    status.textContent = message;
  }
};

void main();
