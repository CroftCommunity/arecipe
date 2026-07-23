// The recipe-import surface (recipe-import). SHARE-ONLY: there is no manual
// "Import from link" button — import is initiated entirely from the phone's
// share sheet (Web Share Target), so this panel is mounted only when Alchemy is
// opened from a share, and it acts on the shared payload immediately.
//
// Honest split: shared TEXT (a selection / article body) runs the ladder with
// NO fetch — the path that truly sidesteps CORS. A bare shared LINK is attempted
// once and, when the site blocks cross-origin reads (the common case), falls
// back to a paste box with copy that says so plainly. Pure DOM builder; deps
// injected for testability.

import { IMPORT_COPY, type AcquireResult } from './acquire.js';
import { log } from '../log.js';

type ImportedResult = Extract<AcquireResult, { kind: 'imported' }>;

export type ImportPanelDeps = {
  acquireFromUrl: (url: string) => Promise<AcquireResult>;
  acquireFromPaste: (pasted: string, sourceUrl: string) => AcquireResult;
  /** Hand a successful import off to the draft store + editor. */
  onImported: (result: ImportedResult) => Promise<void> | void;
  /** The shared payload that opened this panel: a provenance url (possibly
   *  empty) and, when the share carried content, the text to import. */
  shared: { url: string; pasteText?: string };
  /** Acquire-hub affordances (opt-in; the default share-only panel sets neither).
   *  `manualUrl` adds a "From a link" URL entry; `revealPasteInitially` shows the
   *  paste box from mount so a manual visit has an obvious way in. */
  manualUrl?: boolean;
  revealPasteInitially?: boolean;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const renderImportPanel = (deps: ImportPanelDeps): HTMLElement => {
  const sourceUrl = deps.shared.url;

  const section = el('section', 'import-panel');
  section.dataset['testid'] = 'import-panel';
  section.append(el('h3', 'section-title', 'Import shared recipe'));

  // Manual "From a link" entry (hub only). Best-effort: most sites block
  // cross-origin reads, so this honestly falls back to paste like a shared link.
  if (deps.manualUrl === true) {
    const urlRow = el('div', 'import-url-row');
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'import-url';
    urlInput.placeholder = 'https://…';
    urlInput.dataset['testid'] = 'import-url';
    const urlRun = el('button', 'button', 'Import from link') as HTMLButtonElement;
    urlRun.type = 'button';
    urlRun.dataset['testid'] = 'import-run';
    urlRow.append(urlInput, urlRun);
    section.append(urlRow);
    urlRun.addEventListener('click', () => {
      const u = urlInput.value.trim();
      if (u === '') {
        status.textContent = 'Enter a recipe link first.';
        return;
      }
      status.textContent = 'Reading the recipe…';
      void deps
        .acquireFromUrl(u)
        .then(handle)
        .catch((err: unknown) => {
          log.warn('import', 'manual url import failed', { error: String(err) });
          status.textContent = IMPORT_COPY.couldNotFetch;
          revealPaste();
        });
    });
  }

  // Paste fallback — hidden until a bare link can't be read (or shared text
  // needs correcting). This is the only text entry the panel offers.
  const pasteBlock = el('div', 'import-paste-block');
  pasteBlock.dataset['testid'] = 'import-paste-block';
  pasteBlock.hidden = true;
  const paste = document.createElement('textarea');
  paste.className = 'import-paste-area';
  paste.rows = 8;
  paste.placeholder = 'Paste the page source or the visible recipe text';
  paste.dataset['testid'] = 'import-paste';
  const pasteRun = el('button', 'button button--primary', 'Import pasted text') as HTMLButtonElement;
  pasteRun.type = 'button';
  pasteRun.dataset['testid'] = 'import-paste-run';
  pasteBlock.append(paste, pasteRun);
  section.append(pasteBlock);

  const status = el('p', 'status');
  status.dataset['testid'] = 'import-status';
  section.append(status);

  const revealPaste = (): void => {
    pasteBlock.hidden = false;
  };

  const handle = (result: AcquireResult): void => {
    switch (result.kind) {
      case 'imported': {
        status.textContent =
          result.missing === 'ingredients'
            ? IMPORT_COPY.partialIngredients
            : result.missing === 'instructions'
              ? IMPORT_COPY.partialInstructions
              : 'Imported — opening the editor…';
        void Promise.resolve(deps.onImported(result)).catch((err: unknown) => {
          log.error('import', 'handoff failed', { error: String(err) });
          status.textContent = `Couldn’t open the draft: ${String(err)}`;
        });
        return;
      }
      case 'could-not-fetch': {
        status.textContent = IMPORT_COPY.couldNotFetch;
        revealPaste();
        return;
      }
      case 'no-recipe': {
        status.textContent = IMPORT_COPY.noRecipe;
        revealPaste();
        return;
      }
    }
  };

  const runPaste = (): void => {
    const pasted = paste.value.trim();
    if (pasted === '') {
      status.textContent = 'Paste the page or recipe text first.';
      return;
    }
    handle(deps.acquireFromPaste(pasted, sourceUrl));
  };

  const runShared = async (): Promise<void> => {
    const pasteText = deps.shared.pasteText;
    if (pasteText !== undefined && pasteText !== '') {
      // Shared content → straight through the ladder, no network.
      revealPaste();
      paste.value = pasteText;
      runPaste();
      return;
    }
    if (sourceUrl !== '') {
      // Bare shared link → attempt the fetch; CORS failure expands paste below.
      status.textContent = 'Reading the shared recipe…';
      try {
        handle(await deps.acquireFromUrl(sourceUrl));
      } catch (err) {
        log.warn('import', 'shared url import failed', { error: String(err) });
        status.textContent = IMPORT_COPY.couldNotFetch;
        revealPaste();
      }
      return;
    }
    // Nothing usable in the share — offer the paste box.
    revealPaste();
    status.textContent = 'Paste the recipe text to import.';
  };

  pasteRun.addEventListener('click', () => runPaste());
  if (deps.revealPasteInitially === true) revealPaste();
  void runShared();

  return section;
};
