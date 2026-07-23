// Acquire hub page (import.html): the "pull a recipe in" surface. Reached from
// Alchemy's Import button and as the Web Share Target landing page. Every path
// produces a LOCAL draft and opens it in the editor — nothing publishes here.

import { mountBuildStamp } from '../build-stamp.js';
import { mountShell } from '../nav.js';
import { acquireFromPaste, acquireFromUrl } from '../import/acquire.js';
import { renderAcquireHub } from '../import/acquire-hub.js';
import { interpretShare } from '../import/share-target.js';
import { mapImportedToFields } from '../import/to-fields.js';
import { createDraftStore } from '../recipes/drafts-local.js';
import { requestPersistence } from '../storage-persist.js';
import { registerServiceWorker } from '../sw-register.js';

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = document.createElement('section');
  content.className = 'panel';

  const drafts = createDraftStore();
  void requestPersistence();

  // Web Share Target: a share arrives as ?title=&text=&url=. interpretShare
  // splits it (shared text imports with no fetch; a bare link falls back to
  // paste). Strip the query so a reload doesn't re-import.
  const params = new URLSearchParams(window.location.search);
  const shared = interpretShare({
    title: params.get('title') ?? undefined,
    text: params.get('text') ?? undefined,
    url: params.get('url') ?? undefined,
  });
  const fromShare = shared.url !== '' || shared.pasteText !== undefined;
  if (fromShare) {
    try {
      window.history.replaceState(null, '', './import.html');
    } catch {
      /* replaceState can throw in exotic embeddings — the import still runs */
    }
  }

  const hub = renderAcquireHub({
    acquireFromUrl: (url) => acquireFromUrl(url),
    acquireFromPaste: (pasted, sourceUrl) => acquireFromPaste(pasted, sourceUrl),
    onImported: async (result) => {
      const fields = mapImportedToFields(result.recipe, result.sourceUrl, shared.title);
      const draft = await drafts.save(fields, undefined, 'draft');
      window.location.href = `./editor.html?draft=${encodeURIComponent(draft.id)}`;
    },
    shared,
    fromShare,
  });
  content.append(hub);

  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();
};

main();
