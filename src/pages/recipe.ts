// Recipe detail page (5d): recipe.html?u=<at-uri>[&by=<handle>] — a real,
// shareable document. Cache-first; a cold link (no prior cache) resolves the
// author's PDS from the DID, fetches the record, Tier 2-verifies it, and
// caches it like any other read.

import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache, type CachedRecipe } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { createRecordReader } from '../recipes/read.js';
import { renderRecipeDetail } from '../recipes/view.js';
import { registerServiceWorker } from '../sw-register.js';

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

const loadRecipe = async (uri: string): Promise<{ entry: CachedRecipe; author: string }> => {
  const { did, rkey } = parseAtUri(uri);
  const byParam = new URLSearchParams(window.location.search).get('by');
  const cache = createRecipeCache();

  const cached = await cache.get(uri);
  if (cached !== undefined) {
    log.debug('recipes', 'detail served from cache', { uri });
    return { entry: cached, author: byParam ?? did };
  }

  // Cold link: fetch, verify, cache — same trust path as any read.
  log.debug('recipes', 'cold link — fetching', { uri });
  const { pds, handle } = await resolveDidDoc(did);
  const record = await createRecordReader()({ pds, did, rkey });
  const entry = await cache.put(record);
  return { entry, author: byParam ?? handle ?? did };
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
    const { entry, author } = await loadRecipe(uri);
    const name = (entry.value as { name?: string }).name;
    if (name !== undefined) document.title = `${name} — arecipe`;
    content.replaceChildren(renderRecipeDetail(entry, { author }));
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
    log.debug('shell', 'mounted', { page: 'recipe', uri });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('recipes', 'detail load failed', { uri, error: message });
    status.textContent = message;
  }
};

void main();
