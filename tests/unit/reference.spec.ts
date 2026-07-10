// @vitest-environment happy-dom
// Reference page: static kitchen charts transcribed from the scanned reference
// cards, rendered as tables for reading while cooking. Behaviors:
// - one section per card, each with a stable id so it is directly linkable
// - each section carries an in-page anchor link (href="#<id>") for grabbing a
//   direct link to that chart
// - the transcribed data renders into real tables (spot-checked content)
import { describe, expect, it } from 'vitest';
import { REFERENCE_SECTIONS, renderReference } from '../../src/pages/reference-view.js';

describe('REFERENCE_SECTIONS', () => {
  it('covers the five reference cards with unique, url-safe ids', () => {
    const ids = REFERENCE_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      'weights-and-measures',
      'substitutions',
      'can-sizes',
      'roasting-meat',
      'roasting-poultry',
    ]);
    // ids double as URL fragments — no spaces/uppercase, all unique.
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('renderReference', () => {
  it('renders one anchored section per card, each directly linkable', () => {
    const root = renderReference();
    const sections = root.querySelectorAll('section.ref-card');
    expect(sections.length).toBe(REFERENCE_SECTIONS.length);
    for (const s of REFERENCE_SECTIONS) {
      const section = root.querySelector(`section#${s.id}`);
      expect(section, `section ${s.id} exists`).not.toBeNull();
      // The heading exposes the human title.
      expect(section?.querySelector('h2')?.textContent).toContain(s.title);
      // A copyable in-page anchor points at this section's fragment.
      const anchor = section?.querySelector<HTMLAnchorElement>('a.ref-anchor');
      expect(anchor?.getAttribute('href')).toBe(`#${s.id}`);
    }
  });

  it('renders each section as a table with a row per entry', () => {
    const root = renderReference();
    // Every section owns at least one table with body rows.
    for (const s of REFERENCE_SECTIONS) {
      const rows = root.querySelectorAll(`section#${s.id} table tbody tr`);
      expect(rows.length, `${s.id} has rows`).toBeGreaterThan(0);
    }
  });

  it('wraps wide grid tables in a horizontal-scroll container (mobile-safe)', () => {
    const root = renderReference();
    // Grid charts (Roasting — Meat/Poultry, Can Sizes) have many columns; each
    // sits in a .ref-scroll wrapper so a narrow viewport scrolls it instead of
    // crushing the layout.
    const gridTable = root.querySelector('section#roasting-meat table.ref');
    expect(gridTable?.parentElement).not.toBeNull();
    expect(gridTable?.parentElement?.classList.contains('ref-scroll')).toBe(true);
    // Pair tables (two narrow columns) are NOT wrapped — they wrap naturally.
    const pairTable = root.querySelector('section#weights-and-measures table.ref.pairs');
    expect(pairTable?.parentElement?.classList.contains('ref-scroll')).toBe(false);
  });

  it('transcribes key equivalences and chart values accurately', () => {
    const text = renderReference().textContent ?? '';
    // Weights & measures
    expect(text).toContain('3 teaspoons');
    expect(text).toContain('16 tablespoons');
    expect(text).toContain('28.3 grams');
    // Substitutions
    expect(text).toContain('1 tablespoon cornstarch');
    // Can sizes
    expect(text).toContain('No. 10');
    expect(text).toContain('12 to 13 c.');
    // Roasting — meat + poultry
    expect(text).toContain('Well-Done');
    expect(text).toContain('Chicken / Capon');
    expect(text).toContain('Add 5 min. per pound if bird is stuffed.');
  });
});
