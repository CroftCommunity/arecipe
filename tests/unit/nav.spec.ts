// @vitest-environment happy-dom
// Phase 5b: the shared nav shell. Behaviors:
// - the wordmark is a home link (differentiated "a" preserved)
// - the top bar carries the settings gear link
// - the tab bar renders Browse + Alchemy as real links, with the active
//   tab derived from the current pathname (both / and /index.html = Browse)
import { describe, expect, it } from 'vitest';
import { renderTabs, renderTopbar } from '../../src/nav.js';

describe('renderTopbar', () => {
  it('carries the butterfly-spatula logo (decorative, theme-variant pair)', () => {
    const bar = renderTopbar();
    const light = bar.querySelector<HTMLImageElement>('img.logo--light');
    const dark = bar.querySelector<HTMLImageElement>('img.logo--dark');
    expect(light?.getAttribute('src')).toBe('./assets/logo-light.png');
    expect(dark?.getAttribute('src')).toBe('./assets/logo-dark.png');
    // Decorative: the wordmark right beside it carries the name.
    expect(light?.getAttribute('alt')).toBe('');
    expect(dark?.getAttribute('alt')).toBe('');
  });

  const stubHint = (value: string | null): void => {
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: (k: string) => (k === 'arecipe-session' ? value : null) },
      configurable: true,
    });
  };

  it('shows a Sign in link to the dedicated sign-in page when there is no session hint', () => {
    stubHint(null);
    const bar = renderTopbar();
    expect(bar.querySelector('[data-testid=nav-signin]')?.getAttribute('href')).toBe(
      './signin.html',
    );
    expect(bar.querySelector('[data-testid=nav-account]')).toBeNull();
  });

  it('shows an Account link when the session hint is set (zero-auth)', () => {
    stubHint('1');
    const bar = renderTopbar();
    expect(bar.querySelector('[data-testid=nav-account]')?.getAttribute('href')).toBe(
      './account.html',
    );
    expect(bar.querySelector('[data-testid=nav-signin]')).toBeNull();
    stubHint(null);
  });

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
  it('renders Browse, Cookbook, Alchemy, Meals, and Reference as links', () => {
    const tabs = renderTabs('/index.html');
    expect(tabs.querySelector('[data-testid=tab-browse]')?.getAttribute('href')).toBe(
      './index.html',
    );
    expect(tabs.querySelector('[data-testid=tab-cookbook]')?.getAttribute('href')).toBe(
      './cookbook.html',
    );
    expect(tabs.querySelector('[data-testid=tab-mine]')?.getAttribute('href')).toBe('./mine.html');
    expect(tabs.querySelector('[data-testid=tab-meals]')?.getAttribute('href')).toBe(
      './meals.html',
    );
    expect(tabs.querySelector('[data-testid=tab-reference]')?.getAttribute('href')).toBe(
      './reference.html',
    );
  });

  it('orders the tabs Browse · Cookbook · Alchemy · Meals · Reference · Timers (confirmed Q1)', () => {
    const tabs = renderTabs('/index.html');
    const order = [...tabs.querySelectorAll('a.tab')].map((a) => a.getAttribute('data-testid'));
    expect(order).toEqual([
      'tab-browse',
      'tab-cookbook',
      'tab-mine',
      'tab-meals',
      'tab-reference',
      // Timers joins as a desktop tab (Feature A), off the mobile thumb row.
      'tab-timers',
    ]);
  });

  it('marks Reference and Timers desktop-only (hidden from the mobile bottom bar via CSS)', () => {
    const tabs = renderTabs('/index.html');
    expect(tabs.querySelector('[data-testid=tab-timers]')?.getAttribute('href')).toBe(
      './timers.html',
    );
    for (const id of ['tab-reference', 'tab-timers']) {
      expect(
        tabs.querySelector(`[data-testid=${id}]`)?.classList.contains('tab--desktop-only'),
      ).toBe(true);
    }
    // The four primary destinations stay in the mobile bottom bar.
    for (const id of ['tab-browse', 'tab-cookbook', 'tab-mine', 'tab-meals']) {
      expect(
        tabs.querySelector(`[data-testid=${id}]`)?.classList.contains('tab--desktop-only'),
      ).toBe(false);
    }
  });

  it.each([
    ['/', 'tab-browse'],
    ['/index.html', 'tab-browse'],
    ['/arecipe/', 'tab-browse'],
    ['/cookbook.html', 'tab-cookbook'],
    ['/arecipe/cookbook.html', 'tab-cookbook'],
    ['/mine.html', 'tab-mine'],
    ['/arecipe/mine.html', 'tab-mine'],
    ['/meals.html', 'tab-meals'],
    ['/arecipe/meals.html', 'tab-meals'],
    ['/reference.html', 'tab-reference'],
    ['/arecipe/reference.html', 'tab-reference'],
  ])('marks the active tab for %s', (pathname, expected) => {
    const tabs = renderTabs(pathname);
    const active = tabs.querySelector('.tab--active');
    expect(active?.getAttribute('data-testid')).toBe(expected);
  });
});
