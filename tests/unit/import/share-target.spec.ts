// Web Share Target (recipe-import fast-follow): when a cook shares a page (or a
// text selection) from their phone into arecipe, the OS opens mine.html with the
// shared title/text/url as query params. interpretShare decides what to do with
// them — the honest split being: shared RECIPE TEXT imports with no fetch at all
// (sidesteps CORS), while a bare link only yields a URL to prefill (the page
// content still can't be read cross-origin).
import { describe, expect, it } from 'vitest';
import { interpretShare } from '../../../src/import/share-target.js';

describe('interpretShare', () => {
  it('uses the url param as provenance and treats text as content to import', () => {
    const s = interpretShare({ title: 'Pancakes', text: '1 cup flour\n1 cup milk', url: 'https://x/r' });
    expect(s.url).toBe('https://x/r');
    expect(s.pasteText).toBe('1 cup flour\n1 cup milk');
  });

  it('promotes a text that is itself just a URL to the url slot (no paste)', () => {
    const s = interpretShare({ text: 'https://cooking.example.com/soup' });
    expect(s.url).toBe('https://cooking.example.com/soup');
    expect(s.pasteText).toBeUndefined();
  });

  it('does not paste a text that merely duplicates the url', () => {
    const s = interpretShare({ text: 'https://x/r', url: 'https://x/r' });
    expect(s.url).toBe('https://x/r');
    expect(s.pasteText).toBeUndefined();
  });

  it('extracts a link embedded in a shared snippet, keeping the snippet as content', () => {
    const s = interpretShare({ text: 'Amazing cornbread https://x/cornbread check it out' });
    expect(s.url).toBe('https://x/cornbread');
    expect(s.pasteText).toBe('Amazing cornbread https://x/cornbread check it out');
  });

  it('ignores a non-http(s) url and empty fields', () => {
    const s = interpretShare({ url: 'javascript:alert(1)', text: '' });
    expect(s.url).toBe('');
    expect(s.pasteText).toBeUndefined();
  });

  it('handles a bare link share (url only, no text)', () => {
    const s = interpretShare({ title: 'A Recipe', url: 'https://x/r' });
    expect(s.url).toBe('https://x/r');
    expect(s.pasteText).toBeUndefined();
  });
});
