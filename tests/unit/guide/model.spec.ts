// @vitest-environment happy-dom
// RUN-GUIDE-HELPER Phase 1 (RED), index build — tests 1..5.
//
// D1: the index is GENERATED from the guide, never hand-maintained. The guide's
// source is src/pages/user-guide-view.ts (a DOM builder), so the generator walks
// the RENDERED guide DOM by headings and emits a GuideSection per anchor-bearing
// section. These tests pin: fixture sections → entries with correct anchors and
// breadcrumbs; nested headings → breadcrumb chains; a section's text excludes its
// child sections' text; the D2 anchor-validity gate; and byte-identical output on
// a rebuild (determinism).
import { describe, expect, it } from 'vitest';
import {
  assertValidAnchors,
  buildGuideIndex,
  collectAnchorIds,
  serializeGuideIndex,
} from '../../../src/guide/model.js';
import { renderUserGuide } from '../../../src/pages/user-guide-view.js';

/** Parse an HTML string into a detached root element for the indexer. */
const rootFrom = (html: string): HTMLElement => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

describe('buildGuideIndex — fixtures', () => {
  it('a guide with three sections produces three entries with correct anchors', () => {
    const root = rootFrom(`
      <section id="alpha"><h2>Alpha</h2><p>All about alpha.</p></section>
      <section id="beta"><h2>Beta</h2><p>All about beta.</p></section>
      <section id="gamma"><h2>Gamma</h2><p>All about gamma.</p></section>
    `);
    const sections = buildGuideIndex(root);
    expect(sections.map((s) => s.anchor)).toEqual(['alpha', 'beta', 'gamma']);
    expect(sections.map((s) => s.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sections[0]!.text).toContain('All about alpha');
    // Each section is flat here, so the breadcrumb is empty.
    expect(sections.every((s) => s.breadcrumb.length === 0)).toBe(true);
  });

  it('nested headings produce correct breadcrumb chains', () => {
    const root = rootFrom(`
      <section id="start"><h1>Getting started</h1><p>intro prose</p>
        <section id="signin"><h2>Signing in</h2><p>sign in prose</p>
          <section id="oauth"><h3>OAuth handshake</h3><p>handshake prose</p></section>
        </section>
      </section>
    `);
    const byAnchor = Object.fromEntries(buildGuideIndex(root).map((s) => [s.anchor, s]));
    expect(byAnchor['start']!.breadcrumb).toEqual([]);
    expect(byAnchor['signin']!.breadcrumb).toEqual(['Getting started']);
    expect(byAnchor['oauth']!.breadcrumb).toEqual(['Getting started', 'Signing in']);
  });

  it("a section's text excludes its child sections' text (no double counting)", () => {
    const root = rootFrom(`
      <section id="parent"><h1>Parent</h1><p>PARENT_OWN_TEXT</p>
        <section id="child"><h2>Child</h2><p>CHILD_OWN_TEXT</p></section>
      </section>
    `);
    const byAnchor = Object.fromEntries(buildGuideIndex(root).map((s) => [s.anchor, s]));
    expect(byAnchor['parent']!.text).toContain('PARENT_OWN_TEXT');
    expect(byAnchor['parent']!.text).not.toContain('CHILD_OWN_TEXT');
    expect(byAnchor['child']!.text).toContain('CHILD_OWN_TEXT');
    // The heading's own words are the title, not the body.
    expect(byAnchor['parent']!.text).not.toContain('Parent');
  });

  it('the section title is not folded into the body text', () => {
    const root = rootFrom(`<section id="x"><h2>Unique Title Words</h2><p>body words</p></section>`);
    const [s] = buildGuideIndex(root);
    expect(s!.text).toBe('body words');
  });
});

describe('buildGuideIndex — the real guide', () => {
  const root = renderUserGuide();
  const sections = buildGuideIndex(root);

  it('emits one section per guide entry, with the entry testids as anchors', () => {
    // The real guide is a flat list; every anchor is a guide-entry testid.
    expect(sections.length).toBeGreaterThanOrEqual(14);
    expect(sections.every((s) => s.anchor.startsWith('guide-entry-'))).toBe(true);
    expect(sections.map((s) => s.anchor)).toContain('guide-entry-bluesky');
    expect(sections.map((s) => s.anchor)).toContain('guide-entry-shopping');
  });

  it('every emitted anchor is a real id present in the rendered guide', () => {
    const ids = collectAnchorIds(root);
    for (const s of sections) expect(ids.has(s.anchor)).toBe(true);
    // The D2 gate accepts the honestly-generated index.
    expect(() => assertValidAnchors(sections, ids)).not.toThrow();
  });

  it('each section carries non-empty title and text', () => {
    for (const s of sections) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('every section carries 3–6 curated Layer B phrasings (Phase 3)', () => {
    for (const s of sections) {
      expect(s.phrasings.length, `${s.anchor} phrasings`).toBeGreaterThanOrEqual(3);
      expect(s.phrasings.length, `${s.anchor} phrasings`).toBeLessThanOrEqual(6);
      expect(s.phrasings.every((p) => p.trim().length > 0)).toBe(true);
    }
  });
});

describe('assertValidAnchors — the D2 build gate', () => {
  it('throws when an emitted anchor is absent from the rendered HTML', () => {
    const sections = [
      { anchor: 'real', title: 'Real', breadcrumb: [], text: 'x', phrasings: [] },
      { anchor: 'ghost', title: 'Ghost', breadcrumb: [], text: 'y', phrasings: [] },
    ];
    const ids = new Set(['real']);
    expect(() => assertValidAnchors(sections, ids)).toThrow(/ghost/);
  });
});

describe('serializeGuideIndex — determinism (test 5)', () => {
  it('building twice from identical input produces byte-identical output', () => {
    const a = serializeGuideIndex(buildGuideIndex(renderUserGuide()));
    const b = serializeGuideIndex(buildGuideIndex(renderUserGuide()));
    expect(a).toBe(b);
  });

  it('serialization is stable regardless of object identity', () => {
    const sections = buildGuideIndex(renderUserGuide());
    const copy = JSON.parse(JSON.stringify(sections));
    expect(serializeGuideIndex(sections)).toBe(serializeGuideIndex(copy));
  });
});
