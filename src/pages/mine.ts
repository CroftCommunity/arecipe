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
import { createRecipeReader } from '../recipes/read.js';
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
      const { pds, handle } = await resolveDidDoc(did);
      const records = await createRecipeReader()({ pds, did });
      if (records.length === 0) {
        const none = el('p', 'empty-state', 'Nothing published yet — your first recipe is one Publish away.');
        none.dataset['testid'] = 'mine-empty';
        publishedList.append(none);
        return;
      }
      const cache = createRecipeCache();
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      publishedList.replaceChildren(renderRecipeList(entries, { author: handle ?? did }));
    })().catch((err: unknown) => {
      log.error('recipes', 'own recipes load failed', { error: String(err) });
      publishedList.append(el('p', 'status', `couldn’t load your recipes: ${String(err)}`));
    });
  } else if (provider !== null) {
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
    const empty = el('p', 'empty-state', 'Sign in to keep your recipes here.');
    empty.dataset['testid'] = 'mine-empty';
    content.append(form, status, empty);
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
