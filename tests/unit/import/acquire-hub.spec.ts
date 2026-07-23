// @vitest-environment happy-dom
// The Acquire hub composes the import engine with the extra 0→1 entries. It is
// the share-target landing page and the destination of Alchemy's Import button.
import { describe, expect, it, vi } from 'vitest';
import { renderAcquireHub, runPhotoOcr } from '../../../src/import/acquire-hub.js';
import { OCR_GUIDANCE, type OcrEngine } from '../../../src/import/ocr.js';
import type { AcquireResult } from '../../../src/import/acquire.js';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const testid = (root: HTMLElement, id: string): HTMLElement | null =>
  root.querySelector(`[data-testid="${id}"]`);

const noAcquire = {
  acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }) as AcquireResult,
};

describe('renderAcquireHub', () => {
  it('offers the 0→1 entries: paste, scan-a-photo, build-from-scratch (no fetch)', () => {
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    expect(hub.dataset['testid']).toBe('acquire-hub');
    expect(testid(hub, 'import-paste-block')).not.toBeNull(); // paste
    expect(testid(hub, 'import-url')).toBeNull(); // fetch is not a path
    expect(testid(hub, 'acquire-photo')).not.toBeNull(); // scan a photo
    const scratch = testid(hub, 'acquire-scratch') as HTMLAnchorElement;
    expect(scratch.getAttribute('href')).toMatch(/editor\.html$/);
  });

  it('pre-reveals the paste box on a manual visit (no share)', () => {
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    expect((testid(hub, 'import-paste-block') as HTMLElement).hidden).toBe(false);
  });

  it('auto-imports shared content when opened from a share', async () => {
    const onImported = vi.fn();
    const res: AcquireResult = {
      kind: 'imported',
      recipe: { name: 'X', ingredients: ['a'], instructions: ['b'] },
      sourceUrl: 'https://x/r',
      missing: 'none',
    };
    renderAcquireHub({
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 cup flour\n1 cup milk\n1 tsp salt' },
    });
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
  });

  it('scan-a-photo shows on-device OCR guidance when no in-app engine is wired', () => {
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    expect(testid(hub, 'acquire-photo-input')).toBeNull(); // no file picker without an engine
    (testid(hub, 'acquire-photo') as HTMLButtonElement).click();
    const note = testid(hub, 'acquire-photo-note') as HTMLElement;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(OCR_GUIDANCE);
  });

  it('renders a camera/file picker when an OCR loader is wired', () => {
    const engine: OcrEngine = { recognize: async () => '' };
    const hub = renderAcquireHub({
      ...noAcquire,
      onImported: () => {},
      shared: { url: '' },
      loadOcrEngine: async () => engine,
    });
    const input = testid(hub, 'acquire-photo-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute('accept')).toBe('image/*');
  });

  it('loads the OCR engine only on first tap (not on page load)', async () => {
    const engine: OcrEngine = { recognize: async () => '' };
    const loadOcrEngine = vi.fn(async () => engine);
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' }, loadOcrEngine });
    expect(loadOcrEngine).not.toHaveBeenCalled(); // nothing downloads on render
    (testid(hub, 'acquire-photo') as HTMLButtonElement).click();
    await tick();
    expect(loadOcrEngine).toHaveBeenCalledTimes(1);
  });

  it('OCR of a photo drops the recognized text into the paste box for review (human in the loop)', async () => {
    const engine: OcrEngine = { recognize: async () => '2 cups flour\n1 tsp salt\nMix and bake.' };
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' }, loadOcrEngine: async () => engine });
    const note = testid(hub, 'acquire-photo-note') as HTMLElement;
    await runPhotoOcr(new Blob(['img'], { type: 'image/jpeg' }), engine, hub, note);
    const paste = testid(hub, 'import-paste') as HTMLTextAreaElement;
    expect(paste.value).toContain('2 cups flour');
    expect((testid(hub, 'import-paste-block') as HTMLElement).hidden).toBe(false);
    expect(note.textContent).toMatch(/check the text/i);
  });

  it('reports an unreadable photo honestly rather than importing nothing', async () => {
    const engine: OcrEngine = { recognize: async () => '   ' };
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' }, loadOcrEngine: async () => engine });
    const note = testid(hub, 'acquire-photo-note') as HTMLElement;
    await runPhotoOcr(new Blob(['img']), engine, hub, note);
    expect(note.textContent).toMatch(/couldn’t read any text/i);
  });
});
