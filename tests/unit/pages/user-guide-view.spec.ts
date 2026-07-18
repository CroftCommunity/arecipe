// @vitest-environment happy-dom
// The user guide (user-guide.html) content is a pure builder so its copy can be
// asserted. First entry: the share-to-import walkthrough — and it must be HONEST
// about the constraints (installed Android/Chromium PWA; selected-text is the
// no-fetch path; nothing publishes automatically; own-words etiquette).
import { describe, expect, it } from 'vitest';
import { renderUserGuide } from '../../../src/pages/user-guide-view.js';

const text = (root: HTMLElement, id: string): string =>
  (root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.textContent ?? '';

describe('renderUserGuide', () => {
  const guide = renderUserGuide();

  it('is titled as the user guide', () => {
    expect(text(guide, 'user-guide-title').toLowerCase()).toContain('guide');
  });

  it('leads with the share-to-import entry', () => {
    const entries = guide.querySelectorAll('.guide-entry');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const first = entries[0] as HTMLElement;
    expect(first.dataset['testid']).toBe('guide-entry-share');
    expect((first.querySelector('h3')?.textContent ?? '').toLowerCase()).toMatch(/shar(e|ing)/);
  });

  it('states the honest constraints and the no-fetch selected-text tip', () => {
    const body = text(guide, 'guide-entry-share').toLowerCase();
    expect(body).toMatch(/android|chromium/); // installed-PWA platform
    expect(body).toContain('select'); // selecting the recipe text is the good path
    expect(body).toMatch(/paste/); // link share falls back to paste
    expect(body).toMatch(/publish/); // nothing publishes automatically
    expect(body).toMatch(/your own words/); // etiquette
  });
});
