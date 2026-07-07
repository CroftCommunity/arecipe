// Browse page: handle in, verified recipe cards out. This document ships
// ZERO auth code (enforced by the bundle-split e2e test) — the public read
// path needs no session (D2).

import { mountBuildStamp } from '../build-stamp.js';
import { createResolver, type ResolvedIdentity } from '../identity/resolve.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache } from '../recipes/cache.js';
import { createRecipeReader } from '../recipes/read.js';
import { renderRecipeList } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const form = el('form', 'lookup') as HTMLFormElement;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'a cook’s handle — try rdur.dev';
  input.dataset['testid'] = 'handle-input';
  const findButton = el('button', 'button button--primary', 'Find recipes') as HTMLButtonElement;
  findButton.type = 'submit';
  findButton.dataset['testid'] = 'find-recipes';
  const recipesStatus = el('p', 'status');
  recipesStatus.dataset['testid'] = 'recipes-status';
  const listContainer = el('div');
  form.append(input, findButton);
  content.append(form, recipesStatus, listContainer);

  const resolve = createResolver();
  const readRecipes = createRecipeReader();
  const cache = createRecipeCache();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    recipesStatus.textContent = 'finding…';
    void (async () => {
      const identity: ResolvedIdentity = await resolve(input.value.trim());
      const records = await readRecipes({ pds: identity.pds, did: identity.did });
      const entries = await Promise.all(records.map((r) => cache.put(r)));
      const verified = entries.filter((e) => e.verified).length;
      recipesStatus.textContent = `${records.length} recipes cached (${verified} verified)`;
      listContainer.replaceChildren(renderRecipeList(entries, { author: identity.handle }));
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error('recipes', 'find failed', { error: message });
      recipesStatus.textContent = message;
    });
  });

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'browse' });
  void registerServiceWorker();
};

main();
