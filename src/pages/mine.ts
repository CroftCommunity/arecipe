// My recipes page: sign-in lives here (the OAuth callback round-trips back
// to /mine.html — the loopback client_id derives its redirect_uri from this
// page's location). Authoring arrives in Phase 6.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache } from '../recipes/cache.js';
import { createDraftStore } from '../recipes/drafts-local.js';
import { listPdsDrafts } from '../recipes/drafts-sync.js';
import { createRecipeReader } from '../recipes/read.js';
import { retryOnce } from '../retry.js';
import { requestPersistence } from '../storage-persist.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const { provider, agent } = await bootSession();
  void requestPersistence();

  // Authoring entry + local drafts are for everyone — drafting needs no
  // account; publishing (in the editor) does.
  const newRecipe = el('a', 'button button--primary', 'New recipe') as HTMLAnchorElement;
  newRecipe.href = './editor.html';
  newRecipe.dataset['testid'] = 'new-recipe';
  content.append(newRecipe);

  const draftsSection = el('section');
  draftsSection.append(el('h3', 'section-title', 'Drafts'));
  const draftsList = el('div');
  draftsSection.append(draftsList);
  content.append(draftsSection);
  const drafts = createDraftStore();
  const renderDrafts = async (): Promise<void> => {
    const all = await drafts.list();
    draftsList.replaceChildren();
    if (all.length === 0) {
      const none = el('p', 'status', 'no drafts — nothing here leaves this device');
      draftsList.append(none);
      return;
    }
    for (const draft of all) {
      const row = el('div', 'draft-row');
      row.dataset['testid'] = 'draft-row';
      const open = el('a', 'draft-link', draft.fields.name.trim() === '' ? '(untitled)' : draft.fields.name) as HTMLAnchorElement;
      open.href = `./editor.html?draft=${encodeURIComponent(draft.id)}`;
      const remove = el('button', 'button', 'Delete') as HTMLButtonElement;
      remove.type = 'button';
      remove.dataset['testid'] = 'draft-delete';
      remove.addEventListener('click', () => {
        void drafts.remove(draft.id).then(renderDrafts);
      });
      row.append(open, remove);
      draftsList.append(row);
    }
  };
  void renderDrafts().catch((err: unknown) => {
    log.warn('drafts', 'list failed', { error: String(err) });
  });

  if (agent !== null) {
    const who = el('p', 'status');
    who.dataset['testid'] = 'signed-in-did';
    who.textContent = `Signed in: ${agent.did ?? 'unknown'}`;
    content.prepend(who);

    // Published: the account's own recipes via the public read path.
    const published = el('section');
    published.append(el('h3', 'section-title', 'Published'));
    const publishedList = el('div');
    published.append(publishedList);
    content.append(published);
    void (async () => {
      const did = agent.did;
      if (did === undefined) return;
      // Retry once: these fire right after the OAuth redirect settles, where
      // the first fetch can transiently fail (observed at the M3 demo).
      const { pds, handle } = await retryOnce(() => resolveDidDoc(did));
      // Eviction recovery (Phase 8): import PDS-backed drafts missing locally.
      try {
        const remote = await listPdsDrafts(pds, did);
        let recovered = 0;
        for (const draft of remote) {
          if ((await drafts.get(draft.id)) === undefined) {
            await drafts.save(draft.fields, draft.id);
            recovered += 1;
          }
        }
        if (recovered > 0) {
          log.info('drafts', 'recovered from PDS', { count: recovered });
          await renderDrafts();
        }
      } catch (err) {
        log.warn('drafts', 'PDS draft recovery failed', { error: String(err) });
      }
      const records = await retryOnce(() => createRecipeReader()({ pds, did }));
      if (records.length === 0) {
        const none = el('p', 'empty-state', 'Nothing published yet — your first recipe is one Publish away.');
        none.dataset['testid'] = 'mine-empty';
        publishedList.append(none);
        return;
      }
      const cache = createRecipeCache();
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      publishedList.replaceChildren(renderRecipeList(entries, { author: handle ?? did }));
      // Edit affordance (Phase 8): plain rows (cards are links; no nesting).
      for (const entry of entries) {
        const row = el('div', 'draft-row');
        row.dataset['testid'] = 'edit-row';
        const editLink = el(
          'a',
          'draft-link',
          `Edit: ${(entry.value as { name?: string }).name ?? '(untitled)'}`,
        ) as HTMLAnchorElement;
        editLink.href = `./editor.html?edit=${encodeURIComponent(entry.uri)}`;
        row.append(editLink);
        publishedList.append(row);
      }
    })().catch((err: unknown) => {
      log.error('recipes', 'own recipes load failed', { error: String(err) });
      publishedList.append(el('p', 'status', `couldn’t load your recipes: ${String(err)}`));
    });
  } else if (provider !== null) {
    // Signed out: LEAD with a clear Sign in section, above New recipe / Drafts —
    // signing in shouldn't feel like "logging in for a draft." Drafting needs no
    // account (that's what the New recipe / Drafts below are for); signing in is
    // for saving recipes to your account and seeing your Cookbook.
    const signin = el('section', 'signin-lead');
    signin.dataset['testid'] = 'signin-section';
    signin.append(el('h3', 'section-title', 'Sign in'));
    const intro = el(
      'p',
      'status',
      'Sign in with your Bluesky handle to save recipes to your account and see your Cookbook. Browsing and drafting work without an account.',
    );
    const form = el('form', 'lookup') as HTMLFormElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'your.handle (e.g. name.bsky.social)';
    input.dataset['testid'] = 'handle-input';
    const signInButton = el('button', 'button button--primary', 'Sign in') as HTMLButtonElement;
    signInButton.type = 'submit';
    signInButton.dataset['testid'] = 'oauth-signin';
    const status = el('p', 'status');
    status.dataset['testid'] = 'signin-status';
    form.append(input, signInButton);
    signin.append(intro, form, status);
    content.prepend(signin); // lead the page with sign-in, before New recipe / Drafts
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = 'redirecting to sign-in…';
      // Resolves only on failure/abort — success navigates away.
      void provider.signIn(input.value.trim()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('auth', 'sign-in failed', { error: message });
        status.textContent = `sign-in failed: ${message}`;
      });
    });
  } else {
    const empty = el(
      'p',
      'empty-state',
      'Sign in arrives here once the hosted client ships — browse works everywhere today.',
    );
    empty.dataset['testid'] = 'mine-empty';
    content.append(empty);
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'mine', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
