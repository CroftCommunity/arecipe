// @vitest-environment happy-dom
// The changelog page renders entries fetched from ./changelog.json. The pure
// list renderer is unit-tested here (red first); the async fetch wrapper is
// covered by the e2e. Behaviors:
// - empty list -> an explicit empty-state, not a blank page;
// - entries group by date (newest-first, as given);
// - each entry shows a category badge, the text, a commit link (shortSha), and
//   a PR link only when a PR is present.
import { describe, expect, it } from 'vitest';
import { type ChangelogEntry, renderChangelogList } from '../../../src/pages/changelog-view.js';

const entry = (over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  date: '2026-07-20',
  category: 'added',
  text: 'Added a shopping list you can check off',
  sha: '1a2b3c4d5e6f',
  shortSha: '1a2b3c4',
  commitUrl: 'https://github.com/CroftCommunity/arecipe/commit/1a2b3c4d5e6f',
  pr: 40,
  prUrl: 'https://github.com/CroftCommunity/arecipe/pull/40',
  ...over,
});

describe('renderChangelogList', () => {
  it('shows an empty-state when there are no entries', () => {
    const node = renderChangelogList([]);
    const empty = node.querySelector('[data-testid="changelog-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent ?? '').toMatch(/no changes/i);
    expect(node.querySelectorAll('[data-testid="changelog-entry"]')).toHaveLength(0);
  });

  it('renders an entry with a category badge, text, and a commit link', () => {
    const node = renderChangelogList([entry()]);
    const li = node.querySelector('[data-testid="changelog-entry"]');
    expect(li).not.toBeNull();
    expect(node.querySelector('[data-testid="cl-category"]')?.textContent).toBe('added');
    expect(li?.textContent).toContain('Added a shopping list you can check off');
    const commit = node.querySelector('[data-testid="cl-commit"]') as HTMLAnchorElement | null;
    expect(commit?.getAttribute('href')).toBe('https://github.com/CroftCommunity/arecipe/commit/1a2b3c4d5e6f');
    expect(commit?.textContent).toBe('1a2b3c4');
  });

  it('links to the PR when present and omits the link when absent', () => {
    const withPr = renderChangelogList([entry()]);
    const pr = withPr.querySelector('[data-testid="cl-pr"]') as HTMLAnchorElement | null;
    expect(pr?.getAttribute('href')).toBe('https://github.com/CroftCommunity/arecipe/pull/40');
    expect(pr?.textContent).toBe('#40');

    const noPr = renderChangelogList([entry({ pr: undefined, prUrl: undefined })]);
    expect(noPr.querySelector('[data-testid="cl-pr"]')).toBeNull();
  });

  it('groups entries by date, newest-first as given', () => {
    const node = renderChangelogList([
      entry({ date: '2026-07-22', text: 'newer' }),
      entry({ date: '2026-07-20', text: 'older-a' }),
      entry({ date: '2026-07-20', text: 'older-b' }),
    ]);
    const dates = [...node.querySelectorAll('[data-testid="changelog-date"]')].map((h) => h.textContent);
    expect(dates).toEqual(['2026-07-22', '2026-07-20']);
    // the 2026-07-20 group holds both older entries
    expect(node.querySelectorAll('[data-testid="changelog-entry"]')).toHaveLength(3);
  });
});
