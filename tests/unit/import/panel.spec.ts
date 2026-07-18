// @vitest-environment happy-dom
// Phase 3: the Alchemy "Import from link" panel (house inline-panel idiom, like
// the account danger zone). Pure DOM builder with injected acquire fns + an
// onImported handoff, so the flow is unit-testable without a page/session. It
// expands the paste fallback on a fetch failure and surfaces the error taxonomy
// honestly.
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

describe('renderImportPanel', () => {
  it('is collapsed until opened, then reveals the URL field and Import button', () => {
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve({ kind: 'no-recipe', sourceUrl: '' }),
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported: () => {},
    });
    expect(testid(panel, 'import-body').hidden).toBe(true);
    testid(panel, 'import-open').click();
    expect(testid(panel, 'import-body').hidden).toBe(false);
    expect(testid(panel, 'import-url')).toBeTruthy();
    expect(testid(panel, 'import-run')).toBeTruthy();
  });

  it('imports on a successful URL fetch and hands the result off', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = { kind: 'imported', recipe: recipe(), sourceUrl: 'u', missing: 'none' };
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve(res),
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported,
    });
    testid(panel, 'import-open').click();
    (testid(panel, 'import-url') as HTMLInputElement).value = 'https://x/r';
    testid(panel, 'import-run').click();
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
  });

  it('expands the paste flow with honest copy when the fetch fails (CORS)', async () => {
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve({ kind: 'could-not-fetch', sourceUrl: 'u' }),
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported: () => {},
    });
    testid(panel, 'import-open').click();
    (testid(panel, 'import-url') as HTMLInputElement).value = 'https://x/r';
    expect(testid(panel, 'import-paste-block').hidden).toBe(true);
    testid(panel, 'import-run').click();
    await tick();
    expect(testid(panel, 'import-paste-block').hidden).toBe(false);
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.couldNotFetch);
  });

  it('imports pasted content and hands it off', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = { kind: 'imported', recipe: recipe(), sourceUrl: 'u', missing: 'none' };
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve({ kind: 'could-not-fetch', sourceUrl: 'u' }),
      acquireFromPaste: () => res,
      onImported,
    });
    testid(panel, 'import-open').click();
    (testid(panel, 'import-url') as HTMLInputElement).value = 'https://x/r';
    testid(panel, 'import-run').click();
    await tick();
    (testid(panel, 'import-paste') as HTMLTextAreaElement).value = 'some pasted text';
    testid(panel, 'import-paste-run').click();
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
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
      acquireFromUrl: () => Promise.resolve(res),
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported,
    });
    testid(panel, 'import-open').click();
    (testid(panel, 'import-url') as HTMLInputElement).value = 'https://x/r';
    testid(panel, 'import-run').click();
    await tick();
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.partialInstructions);
    expect(onImported).toHaveBeenCalled();
  });

  it('reports no-recipe honestly and reveals paste (fetched but nothing found)', async () => {
    const panel = renderImportPanel({
      acquireFromUrl: () => Promise.resolve({ kind: 'no-recipe', sourceUrl: 'u' }),
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported: () => {},
    });
    testid(panel, 'import-open').click();
    (testid(panel, 'import-url') as HTMLInputElement).value = 'https://x/r';
    testid(panel, 'import-run').click();
    await tick();
    expect(testid(panel, 'import-status').textContent).toBe(IMPORT_COPY.noRecipe);
    expect(testid(panel, 'import-paste-block').hidden).toBe(false);
  });

  it('guards an empty URL without calling acquire', async () => {
    const acquireFromUrl = vi.fn(() => Promise.resolve<AcquireResult>({ kind: 'no-recipe', sourceUrl: '' }));
    const panel = renderImportPanel({
      acquireFromUrl,
      acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }),
      onImported: () => {},
    });
    testid(panel, 'import-open').click();
    testid(panel, 'import-run').click();
    await tick();
    expect(acquireFromUrl).not.toHaveBeenCalled();
    expect(testid(panel, 'import-status').textContent).toMatch(/link/i);
  });
});
