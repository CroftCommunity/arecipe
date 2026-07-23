// @vitest-environment happy-dom
// RUN-GUIDE-HELPER Phase 1 (RED), the question box UI — tests 11 (+ the unit
// half of 13). D3: every result is a link (breadcrumb, title, excerpt, deep
// link). D4: below threshold the helper says no section covers the question and
// routes to the table of contents — it never improvises. D6/D8: no model copy,
// no query logging.
import { describe, expect, it } from 'vitest';
import { buildGuideIndex } from '../../../src/guide/model.js';
import { mountGuideHelper } from '../../../src/guide/question-box.js';
import { renderUserGuide } from '../../../src/pages/user-guide-view.js';

const sections = buildGuideIndex(renderUserGuide());

/** Mount the helper into a fresh container and return the query-runner. */
const mount = () => {
  const container = document.createElement('div');
  document.body.append(container);
  mountGuideHelper(container, sections);
  const input = container.querySelector<HTMLInputElement>('[data-testid="guide-helper-input"]')!;
  const form = container.querySelector<HTMLFormElement>('[data-testid="guide-helper"]')!;
  const ask = (q: string): void => {
    input.value = q;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  return { container, input, form, ask };
};

describe('mountGuideHelper — asking a question', () => {
  it('renders a question box with an input and a submit control', () => {
    const { container } = mount();
    expect(container.querySelector('[data-testid="guide-helper-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="guide-helper-submit"]')).not.toBeNull();
  });

  it('shows ranked results as deep links with breadcrumb, title, and excerpt (test 13)', () => {
    const { container, ask } = mount();
    ask('how do I make a shopping list from my plan');
    const results = container.querySelectorAll('[data-testid="guide-result"]');
    expect(results.length).toBeGreaterThan(0);
    const top = results[0] as HTMLAnchorElement;
    // A working deep link to the answering section.
    expect(top.getAttribute('href')).toBe('#guide-entry-shopping');
    // Breadcrumb + title + a one-line excerpt are all present.
    expect(top.textContent).toContain('Shopping lists');
    expect((top.textContent ?? '').length).toBeGreaterThan(20);
  });

  it('below threshold shows the no-match state with a route to the table of contents (test 11)', () => {
    const { container, ask } = mount();
    ask('what is the current price of bitcoin');
    expect(container.querySelectorAll('[data-testid="guide-result"]').length).toBe(0);
    const nomatch = container.querySelector('[data-testid="guide-helper-nomatch"]');
    expect(nomatch).not.toBeNull();
    // A route onward, never an improvised answer.
    const tocLink = nomatch!.querySelector('a[href="#guide-toc"]');
    expect(tocLink).not.toBeNull();
  });

  it('says nothing about a model when none is available (tests 15, D6)', () => {
    const { container, ask } = mount();
    ask('how do I plan my meals for the week');
    const copy = (container.textContent ?? '').toLowerCase();
    expect(copy).not.toMatch(/\b(ai|model|unavailable|assistant)\b/);
  });

  it('an empty submission does not render results or throw', () => {
    const { container, ask } = mount();
    expect(() => ask('   ')).not.toThrow();
    expect(container.querySelectorAll('[data-testid="guide-result"]').length).toBe(0);
    expect(container.querySelector('[data-testid="guide-helper-nomatch"]')).toBeNull();
  });
});
