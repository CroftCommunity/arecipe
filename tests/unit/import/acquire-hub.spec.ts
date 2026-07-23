// @vitest-environment happy-dom
// The Acquire hub composes the import engine with the extra 0→1 entries. It is
// the share-target landing page and the destination of Alchemy's Import button.
import { describe, expect, it, vi } from 'vitest';
import { renderAcquireHub, OCR_GUIDANCE } from '../../../src/import/acquire-hub.js';
import type { AcquireResult } from '../../../src/import/acquire.js';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const testid = (root: HTMLElement, id: string): HTMLElement | null =>
  root.querySelector(`[data-testid="${id}"]`);

const noAcquire = {
  acquireFromUrl: () => Promise.resolve<AcquireResult>({ kind: 'no-recipe', sourceUrl: '' }),
  acquireFromPaste: () => ({ kind: 'no-recipe', sourceUrl: '' }) as AcquireResult,
};

describe('renderAcquireHub', () => {
  it('offers the 0→1 entries: paste, from-a-link, scan-a-photo, build-from-scratch', () => {
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    expect(hub.dataset['testid']).toBe('acquire-hub');
    expect(testid(hub, 'import-paste-block')).not.toBeNull(); // paste
    expect(testid(hub, 'import-url')).not.toBeNull(); // from a link
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
      acquireFromUrl: noAcquire.acquireFromUrl,
      acquireFromPaste: () => res,
      onImported,
      shared: { url: 'https://x/r', pasteText: '1 cup flour\n1 cup milk\n1 tsp salt' },
      fromShare: true,
    });
    await tick();
    expect(onImported).toHaveBeenCalledWith(res);
  });

  it('scan-a-photo shows on-device OCR guidance when no in-app handler is wired', () => {
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' } });
    (testid(hub, 'acquire-photo') as HTMLButtonElement).click();
    const note = testid(hub, 'acquire-photo-note') as HTMLElement;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(OCR_GUIDANCE);
  });

  it('scan-a-photo delegates to the in-app handler when provided', () => {
    const onScanPhoto = vi.fn();
    const hub = renderAcquireHub({ ...noAcquire, onImported: () => {}, shared: { url: '' }, onScanPhoto });
    (testid(hub, 'acquire-photo') as HTMLButtonElement).click();
    expect(onScanPhoto).toHaveBeenCalled();
  });
});
