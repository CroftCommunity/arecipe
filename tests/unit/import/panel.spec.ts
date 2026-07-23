// @vitest-environment happy-dom
// The import panel does NO network fetch: recipe sites block cross-origin reads
// from a backendless PWA (docs/EXP-IMPORT-EXTRACTION.md), so a link is never
// fetched. It imports shared/pasted TEXT via the ladder; a bare shared LINK is
// not fetched — it reveals the paste box with guidance, keeping the link as
// provenance. Pure DOM builder with injected deps.
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
const testid = (root: HTMLElement, id: string): HTMLElement | null =>
  root.querySelector(`[data-testid="${id}"]`);

const noPaste = { acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }) as AcquireResult };

describe('renderImportPanel (no fetch)', () => {
  it('offers no URL entry at all (fetch is not a path)', () => {
    const panel = renderImportPanel({ ...noPaste, onImported: () => {}, shared: { url: '' } });
    expect(testid(panel, 'import-url')).toBeNull();
    expect(testid(panel, 'import-run')).toBeNull();
    expect(testid(panel, 'import-open')).toBeNull();
  });

  it('imports shared TEXT with no network and hands it off', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = { kind: 'imported', recipe: recipe(), sourceUrl: 'https://x/r', missing: 'none' };
    renderImportPanel({
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 cup flour\n1 cup milk\n1 tsp salt' },
    });
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
  });

  it('a bare shared link is NOT fetched — it reveals paste with honest guidance', async () => {
    const acquireFromPaste = vi.fn(noPaste.acquireFromPaste);
    const panel = renderImportPanel({ acquireFromPaste, onImported: () => {}, shared: { url: 'https://x/r' } });
    await tick();
    expect(testid(panel, 'import-paste-block')?.hidden).toBe(false);
    expect(testid(panel, 'import-status')?.textContent).toBe(IMPORT_COPY.couldNotFetch);
    expect(acquireFromPaste).not.toHaveBeenCalled(); // nothing ran until the cook pastes
  });

  it('pasting after a bare link imports and keeps the shared url as provenance', async () => {
    const onImported = vi.fn();
    const acquireFromPaste = vi.fn(
      (): AcquireResult => ({ kind: 'imported', recipe: recipe(), sourceUrl: 'https://x/r', missing: 'none' }),
    );
    const panel = renderImportPanel({ acquireFromPaste, onImported, shared: { url: 'https://x/r' } });
    await tick();
    (testid(panel, 'import-paste') as HTMLTextAreaElement).value = 'pasted recipe text';
    (testid(panel, 'import-paste-run') as HTMLElement).click();
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
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 apple\n2 tbsp pb\n1 tsp honey' },
    });
    await tick();
    expect(testid(panel, 'import-status')?.textContent).toBe(IMPORT_COPY.partialInstructions);
    expect(onImported).toHaveBeenCalled();
  });

  it('reports no-recipe honestly for shared text with nothing to import', async () => {
    const panel = renderImportPanel({
      ...noPaste,
      onImported: () => {},
      shared: { url: 'https://x/r', pasteText: 'just a story about the sea' },
    });
    await tick();
    expect(testid(panel, 'import-status')?.textContent).toBe(IMPORT_COPY.noRecipe);
  });

  it('reveals the paste box from the start when revealPasteInitially is set', () => {
    const panel = renderImportPanel({
      ...noPaste,
      onImported: () => {},
      shared: { url: '' },
      revealPasteInitially: true,
    });
    expect(testid(panel, 'import-paste-block')?.hidden).toBe(false);
  });
});
