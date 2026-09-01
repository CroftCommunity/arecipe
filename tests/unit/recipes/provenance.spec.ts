// @vitest-environment happy-dom
// The editor's provenance surfaces for a record that carries a sourceUrl. A
// small "Imported from <link>" line shows the source; near publish, ONE gentle
// etiquette line encourages writing instructions in your own words. Both render
// ONLY when the record carries a sourceUrl — hand-authored recipes show neither.
import { describe, expect, it } from 'vitest';
import {
  ETIQUETTE_COPY,
  renderEtiquetteLine,
  renderProvenanceLine,
} from '../../../src/recipes/provenance.js';

describe('renderProvenanceLine', () => {
  it('links to the source URL and shows its host', () => {
    const line = renderProvenanceLine('https://cooking.example.com/recipes/pancakes');
    expect(line.dataset['testid']).toBe('editor-provenance');
    const link = line.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://cooking.example.com/recipes/pancakes');
    expect(link.textContent).toContain('cooking.example.com');
    expect(line.textContent?.toLowerCase()).toContain('imported');
  });

  it('falls back to the raw string when the URL does not parse', () => {
    const line = renderProvenanceLine('not a url');
    const link = line.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('not a url');
  });
});

describe('renderEtiquetteLine', () => {
  it('encourages the cook to use their own words', () => {
    const line = renderEtiquetteLine();
    expect(line.dataset['testid']).toBe('editor-etiquette');
    expect(line.textContent).toBe(ETIQUETTE_COPY);
    expect(ETIQUETTE_COPY.toLowerCase()).toMatch(/your own words/);
  });
});
