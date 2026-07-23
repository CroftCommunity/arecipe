// @vitest-environment happy-dom
// RUN-GUIDE-HELPER Phase 1 (RED), retrieval + invariants — tests 6..10, 12.
//
// The deep link is the product: retrieval must put the answering section at the
// top for a real question, refuse to answer when nothing fits (D4), and never
// return a result without a valid in-index anchor (D3/D5). Quality is MEASURED
// against the committed 25-question fixture, not asserted at a wished-for level.
import { describe, expect, it } from 'vitest';
import { buildGuideIndex } from '../../../src/guide/model.js';
import {
  createGuideSearch,
  fuseLayerC,
  validateLayerCAnchors,
} from '../../../src/guide/search.js';
import { renderUserGuide } from '../../../src/pages/user-guide-view.js';
import { FIXTURE_QUESTIONS } from './questions.fixture.js';

// Measured baselines (Phase 2). The test records the actual numbers to the run
// summary; these are the floor the ranker must not regress below.
const BASELINE_TOP1 = 22; // of 25 (measured, Phase 2)
const BASELINE_TOP3 = 25; // of 25 (measured, Phase 2)

const sections = buildGuideIndex(renderUserGuide());
const anchors = new Set(sections.map((s) => s.anchor));
const search = createGuideSearch(sections);

describe('retrieval quality against the 25-question fixture (test 6)', () => {
  it('ranks the correct section at #1 and within top-3 at the recorded rates', () => {
    let top1 = 0;
    let top3 = 0;
    const misses: string[] = [];
    for (const { q, anchor } of FIXTURE_QUESTIONS) {
      const results = search.search(q);
      if (results[0]?.section.anchor === anchor) top1 += 1;
      if (results.slice(0, 3).some((r) => r.section.anchor === anchor)) top3 += 1;
      else misses.push(`${q} → wanted ${anchor}, got ${results[0]?.section.anchor ?? '(none)'}`);
    }
    // Surfaced so the measured numbers land in the run log/summary.
    console.log(`[guide-helper] top-1 ${top1}/25, top-3 ${top3}/25`, misses);
    expect(top1).toBeGreaterThanOrEqual(BASELINE_TOP1);
    expect(top3).toBeGreaterThanOrEqual(BASELINE_TOP3);
  });
});

describe('threshold and empty query (tests 7, 8)', () => {
  it('a question with no relevant section returns nothing above threshold', () => {
    for (const q of [
      'how do I train my dog to sit',
      'what is the current price of bitcoin',
      'zzzzz qwerty asdfgh',
    ]) {
      expect(search.search(q)).toEqual([]);
    }
  });

  it('an empty or whitespace query returns no results and does not throw', () => {
    expect(() => search.search('')).not.toThrow();
    expect(search.search('')).toEqual([]);
    expect(search.search('   ')).toEqual([]);
  });
});

describe('stability and result shape (tests 9, 10)', () => {
  it('is deterministic: the same query and index give the same ordering', () => {
    const q = 'how do I share my whole cookbook with a friend';
    const a = search.search(q).map((r) => r.section.anchor);
    const b = search.search(q).map((r) => r.section.anchor);
    expect(a).toEqual(b);
    // A freshly-built searcher over the same sections agrees too.
    const c = createGuideSearch(sections)
      .search(q)
      .map((r) => r.section.anchor);
    expect(c).toEqual(a);
  });

  it('every returned result carries a non-empty anchor present in the index', () => {
    for (const { q } of FIXTURE_QUESTIONS) {
      for (const r of search.search(q)) {
        expect(r.section.anchor.length).toBeGreaterThan(0);
        expect(anchors.has(r.section.anchor)).toBe(true);
        expect(r.excerpt.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Layer C anchor guard (test 12, D5)', () => {
  it('accepts only anchors that exist in the index', () => {
    expect(validateLayerCAnchors(['guide-entry-meals'], anchors)).toBe(true);
    expect(validateLayerCAnchors(['guide-entry-meals', 'made-up'], anchors)).toBe(false);
  });

  it('a Layer C response citing an unknown anchor is rejected wholesale; Layer A stands', () => {
    const layerA = search.search('how do I plan my meals for the week');
    expect(layerA.length).toBeGreaterThan(0);
    const bogus = { anchor: 'totally-invented', summary: 'A confident but ungrounded answer.' };
    const fused = fuseLayerC(layerA, bogus, anchors);
    // Rejected: the summary is dropped and the Layer A results are returned as-is.
    expect(fused.summary).toBeUndefined();
    expect(fused.results).toEqual(layerA);
  });

  it('a Layer C response citing a valid anchor may contribute its summary below the links', () => {
    const layerA = search.search('how do I plan my meals for the week');
    const good = { anchor: 'guide-entry-meals', summary: 'Grounded summary of the meals section.' };
    const fused = fuseLayerC(layerA, good, anchors);
    expect(fused.summary).toBe('Grounded summary of the meals section.');
    expect(fused.results).toEqual(layerA); // links unchanged, summary is additive (D7)
  });
});
