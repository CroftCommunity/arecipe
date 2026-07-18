// @vitest-environment happy-dom
// The import panel is SHARE-ONLY: there is no manual "Import from link" button.
// It is mounted only when Alchemy is opened via the Web Share Target, and it
// acts on the shared payload immediately — shared TEXT runs the ladder with no
// fetch; a bare shared LINK is attempted and falls back to a paste box (the page
// content can't be read cross-origin). Pure DOM builder with injected deps.
import { describe, expect, it, vi } from 'vitest';
import { renderImportPanel } from '../../../src/import/panel.js';
import { IMPORT_COPY, type AcquireResult } from '../../../src/import/acquire.js';
import type { ImportedRecipe } from '../../../src/import/recipe-jsonld.js';

const recipe = (over: Partial<ImportedRecipe> = {}): ImportedRecipe => ({
  name: 'X',
  ingredients: ['a', 'b'],
  instructions: ['do it'],
  ...over,
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const testid = (root: HTMLElement, id: string): HTMLElement =>
  root.querySelector(`[data-testid="${id}"]`) as HTMLElement;

const noAcquire = {
  acquireFromUrl: () => Promise.resolve<AcquireResult>({ kind: 'no-recipe', sourceUrl: '' }),
  acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }) as AcquireResult,
};

describe('renderImportPanel (share-only)', () => {
  it('exposes no manual URL entry (no toggle, no url input, no Import button)', () => {
    const panel = renderImportPanel({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    expect(testid(panel, 'import-open')).toBeNull();
    expect(testid(panel, 'import-url')).toBeNull();
    expect(testid(panel, 'import-run')).toBeNull();
  });

  it('imports shared TEXT with no fetch and hands it off', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = { kind: 'imported', recipe: recipe(), sourceUrl: 'u', missing: 'none' };
    const acquireFromUrl = vi.fn(() => Promise.resolve<AcquireResult>({ kind: 'no-recipe', sourceUrl: '' }));
    const panel = renderImportPanel({
      acquireFromUrl,
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 cup flour\n1 cup milk\n1 tsp salt' },
    });
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
    expect(acquireFromUrl).not.toHaveBeenCalled(); // shared text never hits the network
    void panel;
  });

  it('attempts the fetch for a bare shared link, then imports on success', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = { kind: 'imported', recipe: recipe(), sourceUrl: 'https://x/r', missing: 'none' };
    const acquireFromUrl = vi.fn(() => Promise.resolve(res));
    renderImportPanel({
      acquireFromUrl,
      acquireFromPaste: noAcquire.acquireFromPaste,
      onImported,
      shared: { url: 'https://x/r' },
    });
    await tick();
    expect(acquireFromUrl).toHaveBeenCalledWith('https://x/r');
    expect(onImported).toHaveBeenCalledWith(res);
  });

  it('reveals the paste box with honest copy when a bare link cannot be fetched (CORS)', async () => {
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve<AcquireResult>({ kind: 'could-not-fetch', sourceUrl: 'https://x/r' }),
      acquireFromPaste: noAcquire.acquireFromPaste,
      onImported: () => {},
      shared: { url: 'https://x/r' },
    });
    await tick();
    expect(testid(panel, 'import-paste-block').hidden).toBe(false);
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.couldNotFetch);
  });

  it('imports pasted content (bare-link fallback), retaining the shared url as provenance', async () => {
    const onImported = vi.fn();
    const acquireFromPaste = vi.fn(
      (): AcquireResult => ({ kind: 'imported', recipe: recipe(), sourceUrl: 'https://x/r', missing: 'none' }),
    );
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve<AcquireResult>({ kind: 'could-not-fetch', sourceUrl: 'https://x/r' }),
      acquireFromPaste,
      onImported,
      shared: { url: 'https://x/r' },
    });
    await tick();
    (testid(panel, 'import-paste') as HTMLTextAreaElement).value = 'pasted recipe text';
    testid(panel, 'import-paste-run').click();
    await tick();
    expect(acquireFromPaste).toHaveBeenCalledWith('pasted recipe text', 'https://x/r');
    expect(onImported).toHaveBeenCalled();
  });

  it('flags a partial import in the status', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = {
      kind: 'imported',
      recipe: recipe({ instructions: [] }),
      sourceUrl: 'u',
      missing: 'instructions',
    };
    const panel = renderImportPanel({
      acquireFromUrl: noAcquire.acquireFromUrl,
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 apple\n2 tbsp pb\n1 tsp honey' },
    });
    await tick();
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.partialInstructions);
    expect(onImported).toHaveBeenCalled();
  });

  it('reports no-recipe honestly for shared text with nothing to import', async () => {
    const panel = renderImportPanel({
      ...noAcquire,
      onImported: () => {},
      shared: { url: 'https://x/r', pasteText: 'just a story about the sea' },
    });
    await tick();
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.noRecipe);
  });
});
