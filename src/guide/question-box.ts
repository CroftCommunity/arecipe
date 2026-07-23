// The question box on the user guide (RUN-GUIDE-HELPER, D3/D4/D6/D7/D8).
//
// Ask a question, get ranked DEEP LINKS — the deep link is the product; any
// prose is decoration. Each result is a link (breadcrumb, title, one-line
// excerpt, `#anchor`); clicking scrolls the target in and highlights it so the
// user can SEE they landed right (D3). Below threshold the helper says no
// section covers the question and routes to the table of contents — it never
// improvises (D4). No model here (Layer A), and it says nothing about a missing
// one (D6). Nothing is logged, stored, or sent anywhere (D8).
import { createGuideSearch, type GuideResult, type GuideSearch } from './search.js';
import type { GuideSection } from './model.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Render one result as a deep link: breadcrumb, title, excerpt → `#anchor`. */
const resultCard = (r: GuideResult): HTMLAnchorElement => {
  const a = el('a', 'guide-result') as HTMLAnchorElement;
  a.href = `#${r.section.anchor}`;
  a.dataset['testid'] = 'guide-result';
  if (r.section.breadcrumb.length > 0) {
    a.append(el('span', 'guide-result-crumb', r.section.breadcrumb.join(' › ')));
  }
  a.append(el('span', 'guide-result-title', r.section.title));
  a.append(el('span', 'guide-result-excerpt', r.excerpt));
  return a;
};

/** The no-match state (D4): honest that nothing covers the question, plus a
 *  route onward to the table of contents. Never an improvised answer. */
const noMatch = (): HTMLElement => {
  const box = el('div', 'guide-helper-nomatch');
  box.dataset['testid'] = 'guide-helper-nomatch';
  box.append(
    el(
      'p',
      undefined,
      'No section covers that question. Browse the topics instead:',
    ),
  );
  const link = el('a', undefined, 'the table of contents') as HTMLAnchorElement;
  link.href = '#guide-toc';
  box.append(link);
  return box;
};

/**
 * Mount the question box into `container`, searching the given sections. The
 * caller owns highlight-on-arrival (wireGuideHighlight) so a deep link opened
 * cold highlights too, not only clicks from here.
 */
export const mountGuideHelper = (
  container: HTMLElement,
  sections: readonly GuideSection[],
  searcher: GuideSearch = createGuideSearch(sections),
): void => {
  const form = el('form', 'guide-helper') as HTMLFormElement;
  form.dataset['testid'] = 'guide-helper';
  form.setAttribute('role', 'search');

  const label = el('label', 'guide-helper-label', 'Ask the guide a question');
  const inputId = 'guide-helper-q';
  label.setAttribute('for', inputId);

  const row = el('div', 'guide-helper-row');
  const input = el('input', 'guide-helper-input') as HTMLInputElement;
  input.id = inputId;
  input.type = 'search';
  input.autocomplete = 'off';
  input.placeholder = 'e.g. can other people see my recipes';
  input.dataset['testid'] = 'guide-helper-input';

  const submit = el('button', 'button button--primary', 'Ask') as HTMLButtonElement;
  submit.type = 'submit';
  submit.dataset['testid'] = 'guide-helper-submit';

  row.append(input, submit);

  const results = el('div', 'guide-helper-results');
  results.dataset['testid'] = 'guide-helper-results';
  results.setAttribute('aria-live', 'polite');

  form.append(label, row, results);
  container.append(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    results.replaceChildren();
    const query = input.value;
    if (query.trim() === '') return; // an empty ask is not a no-match (D4)
    const found = searcher.search(query);
    if (found.length === 0) {
      results.append(noMatch());
      return;
    }
    const list = el('div', 'guide-result-list');
    for (const r of found) list.append(resultCard(r));
    results.append(list);
  });
};

/** Highlight (and scroll to) the guide section named by the current URL hash, so
 *  arriving at `#anchor` — by clicking a result or opening a deep link cold —
 *  visibly lands on the right section (D3). No-op for non-section hashes. */
export const highlightFromHash = (): void => {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (id === '') return;
  const target = document.getElementById(id);
  if (target === null || !target.classList.contains('guide-entry')) return;
  for (const prev of document.querySelectorAll('.guide-target')) prev.classList.remove('guide-target');
  target.classList.add('guide-target');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Wire highlight-on-arrival: once now (cold deep link) and on every hash
 *  change (result clicks, TOC clicks). */
export const wireGuideHighlight = (): void => {
  highlightFromHash();
  window.addEventListener('hashchange', highlightFromHash);
};
