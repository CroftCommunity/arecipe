// Light/dark (Phase 5c, revised to a 2-state toggle). First load follows
// `prefers-color-scheme`; the top-bar toggle then flips whatever you see and
// remembers it. No "auto" in the cycle — with auto, one tap looked like a
// no-op whenever the system matched (real user feedback). A tiny inline
// script in each document's <head> applies the resolved theme before first
// paint (no flash); this module owns everything after that.

import { log } from './log.js';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Explicit stored choice wins; otherwise follow the system preference. */
export const resolveInitial = (stored: Theme | null, prefersDark: boolean): Theme =>
  stored ?? (prefersDark ? 'dark' : 'light');

export const nextTheme = (current: Theme): Theme => (current === 'dark' ? 'light' : 'dark');

/** The glyph shows what a tap switches TO (moon = go dark, sun = go light). */
export const toggleGlyph = (current: Theme): string => (current === 'dark' ? '☀' : '☾');

// Storage access is defensive: Safari private mode throws; degrade to
// system-follow, never crash.
const storedTheme = (): Theme | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
};

const persistTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: choice lives for this page only */
  }
};

const prefersDark = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

const apply = (theme: Theme): void => {
  document.documentElement.dataset['theme'] = theme;
  log.debug('theme', 'applied', { theme });
};

/** Wire the top-bar toggle: shows the target glyph, flips on tap. */
export const initThemeToggle = (button: HTMLButtonElement): void => {
  let current = resolveInitial(storedTheme(), prefersDark());
  const render = (): void => {
    button.textContent = toggleGlyph(current);
    const target = nextTheme(current);
    button.title = `Switch to ${target} mode`;
    button.setAttribute('aria-label', `Switch to ${target} mode`);
  };
  apply(current);
  render();
  button.addEventListener('click', () => {
    current = nextTheme(current);
    persistTheme(current);
    apply(current);
    render();
  });
};
