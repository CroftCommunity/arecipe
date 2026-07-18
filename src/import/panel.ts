// The Alchemy "Import from link" panel (import Phase 3, D1). House inline-panel
// idiom (mirrors src/account/danger-zone.ts): a pure DOM builder whose deps are
// injected, so the whole flow is unit-testable without a page or session. The
// panel keeps Alchemy uncluttered behind a toggle, attempts a direct fetch, and
// — when that fails, as it usually will for a static PWA — expands a paste flow
// with copy that states the serverless tradeoff plainly rather than hiding it.

import { IMPORT_COPY, type AcquireResult } from './acquire.js';
import { log } from '../log.js';

type ImportedResult = Extract<AcquireResult, { kind: 'imported' }>;

export type ImportPanelDeps = {
  acquireFromUrl: (url: string) => Promise<AcquireResult>;
  acquireFromPaste: (pasted: string, sourceUrl: string) => AcquireResult;
  /** Hand a successful import off to the draft store + editor (Phase 4). */
  onImported: (result: ImportedResult) => Promise<void> | void;
  /** Web Share Target: when the page opened from a share, open the panel and run
   *  the import immediately — pasteText (shared content) goes straight through
   *  the ladder; a bare url is attempted (and falls back to paste). */
  autoStart?: { url: string; pasteText?: string };
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const renderImportPanel = (deps: ImportPanelDeps): HTMLElement => {
  const section = el('section', 'import-panel');
  section.dataset['testid'] = 'import-panel';

  // Toggle: keeps the affordance one tap away without crowding the drafts list.
  const toggle = el('button', 'button', 'Import from link') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.dataset['testid'] = 'import-open';
  toggle.setAttribute('aria-expanded', 'false');
  section.append(toggle);

  const body = el('div', 'import-body');
  body.dataset['testid'] = 'import-body';
  body.hidden = true;
  section.append(body);

  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
  });

  // --- URL row ---------------------------------------------------------------
  const urlRow = el('div', 'import-url-row');
  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'import-url-input';
  url.placeholder = 'https://… a recipe link';
  url.dataset['testid'] = 'import-url';
  url.autocomplete = 'off';
  const runBtn = el('button', 'button button--primary', 'Import') as HTMLButtonElement;
  runBtn.type = 'button';
  runBtn.dataset['testid'] = 'import-run';
  urlRow.append(url, runBtn);
  body.append(urlRow);

  // --- Paste fallback (hidden until a fetch fails or nothing is found) --------
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
  body.append(pasteBlock);

  const status = el('p', 'status');
  status.dataset['testid'] = 'import-status';
  body.append(status);

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

  const runUrl = async (): Promise<void> => {
    const value = url.value.trim();
    if (value === '') {
      status.textContent = 'Enter a recipe link to import.';
      return;
    }
    status.textContent = 'Fetching…';
    runBtn.disabled = true;
    try {
      handle(await deps.acquireFromUrl(value));
    } catch (err) {
      log.warn('import', 'url import failed', { error: String(err) });
      status.textContent = `Import failed: ${String(err)}`;
    } finally {
      runBtn.disabled = false;
    }
  };

  const runPaste = (): void => {
    const pasted = paste.value.trim();
    if (pasted === '') {
      status.textContent = 'Paste the page or recipe text first.';
      return;
    }
    handle(deps.acquireFromPaste(pasted, url.value.trim()));
  };

  runBtn.addEventListener('click', () => void runUrl());
  pasteRun.addEventListener('click', () => runPaste());

  // Web Share Target: opened from a share — expand and import straight away.
  if (deps.autoStart !== undefined) {
    const { url: sharedUrl, pasteText } = deps.autoStart;
    body.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    if (sharedUrl !== '') url.value = sharedUrl;
    if (pasteText !== undefined && pasteText !== '') {
      revealPaste();
      paste.value = pasteText;
      runPaste(); // shared content → straight through the ladder, no fetch
    } else if (sharedUrl !== '') {
      void runUrl(); // bare link → attempt fetch, fall back to paste
    }
  }

  return section;
};
