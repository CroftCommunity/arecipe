// Dish compare page (recipe-model-extensions Phase 4b): dish.html?key=<dishKey>&did=<did>[&by=<handle>]
// — the "View All" target reached from a recipe's version bar. Lists every
// version of a dish (records in the author's repo sharing the dishKey) as
// compare cards, with the pooled fun facts on top. Read-only, light path (no
// auth client) — same public listRecords read as Browse.
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache } from '../recipes/cache.js';
import { isPrimaryVersion, siblingsOf } from '../recipes/model.js';
import { createRecipeReader } from '../recipes/read.js';
import { renderDishCompare } from '../recipes/view.js';
import { createSocialPrefs } from '../social/prefs.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Title-case a dishKey slug for the header ("banana-bread" → "Banana Bread"). */
const dishNameFromKey = (key: string): string =>
  key
    .split('-')
    .filter((w) => w !== '')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const status = el('p', 'status', 'loading…');
  content.append(status);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  const did = params.get('did');
  const by = params.get('by') ?? undefined;
  if (key === null || did === null) {
    status.textContent = 'No dish given — open a recipe and choose “View All”.';
    return;
  }

  try {
    document.title = `${dishNameFromKey(key)} — versions — arecipe`;
    const { pds, handle } = await resolveDidDoc(did);
    const records = await createRecipeReader()({ pds, did });
    const siblings = siblingsOf(key, records);
    if (siblings.length === 0) {
      status.textContent = 'No versions found for this dish.';
      return;
    }
    // Stable default order: primary version first, then published (rkey) order.
    // (Most-liked-first ordering is a deferred TODO.)
    siblings.sort(
      (a, b) =>
        Number(isPrimaryVersion(b.value)) - Number(isPrimaryVersion(a.value)) ||
        a.uri.localeCompare(b.uri),
    );
    const cache = createRecipeCache();
    const entries = await Promise.all(siblings.map((record) => cache.put(record)));
    content.replaceChildren(
      renderDishCompare(entries, {
        dishName: dishNameFromKey(key),
        author: by ?? handle ?? did,
        showFunFacts: createSocialPrefs().includeFunFacts(),
      }),
    );
    log.debug('shell', 'mounted', { page: 'dish', key, versions: entries.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('recipes', 'dish compare load failed', { key, error: message });
    status.textContent = message;
  }
};

void main();
