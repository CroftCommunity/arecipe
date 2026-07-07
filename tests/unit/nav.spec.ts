// @vitest-environment happy-dom
// Phase 5b: the shared nav shell. Behaviors:
// - the wordmark is a home link (differentiated "a" preserved)
// - the top bar carries the settings gear link
// - the tab bar renders Browse + My recipes as real links, with the active
//   tab derived from the current pathname (both / and /index.html = Browse)
import { describe, expect, it } from 'vitest';
import { renderTabs, renderTopbar } from '../../src/nav.js';

describe('renderTopbar', () => {
  it('wordmark links home and keeps the differentiated "a"', () => {
    const bar = renderTopbar();
    const home = bar.querySelector<HTMLAnchorElement>('a.wordmark-link');
    expect(home?.getAttribute('href')).toBe('./index.html');
    expect(home?.querySelector('.wordmark-a')?.textContent).toBe('a');
    expect(home?.textContent).toBe('arecipe');
  });

  it('carries the settings gear link', () => {
    const bar = renderTopbar();
    const gear = bar.querySelector<HTMLAnchorElement>('[data-testid=nav-settings]');
    expect(gear?.getAttribute('href')).toBe('./settings.html');
  });
});

describe('renderTabs', () => {
  it('renders Browse and My recipes as links', () => {
    const tabs = renderTabs('/index.html');
    expect(tabs.querySelector('[data-testid=tab-browse]')?.getAttribute('href')).toBe(
      './index.html',
    );
    expect(tabs.querySelector('[data-testid=tab-mine]')?.getAttribute('href')).toBe('./mine.html');
  });

  it.each([
    ['/', 'tab-browse'],
    ['/index.html', 'tab-browse'],
    ['/arecipe/', 'tab-browse'],
    ['/mine.html', 'tab-mine'],
    ['/arecipe/mine.html', 'tab-mine'],
  ])('marks the active tab for %s', (pathname, expected) => {
    const tabs = renderTabs(pathname);
    const active = tabs.querySelector('.tab--active');
    expect(active?.getAttribute('data-testid')).toBe(expected);
  });
});
