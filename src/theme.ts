// Native light/dark (Phase 5c). Auto follows prefers-color-scheme; the
// top-bar toggle cycles auto → light → dark, persisted in localStorage.
// A tiny inline script in each document's <head> applies the resolved theme
// before first paint (no flash); this module owns everything after that.

import { log } from './log.js';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export const cycleMode = (mode: ThemeMode): ThemeMode =>
  mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';

export const resolveTheme = (mode: ThemeMode, prefersDark: boolean): ResolvedTheme =>
  mode === 'dark' || (mode === 'auto' && prefersDark) ? 'dark' : 'light';

export const modeGlyph = (mode: ThemeMode): string =>
  mode === 'auto' ? '◑' : mode === 'light' ? '☀' : '☾';

// Storage access is defensive: Safari private mode (and some test DOMs)
// throw or stub localStorage — theming must degrade to auto, never crash.
const storedMode = (): ThemeMode => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'auto';
  } catch {
    return 'auto';
  }
};

const persistMode = (mode: ThemeMode): void => {
  try {
    if (mode === 'auto') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode: theme lives for this page only */
  }
};

const prefersDarkQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

const apply = (mode: ThemeMode): void => {
  const resolved = resolveTheme(mode, prefersDarkQuery().matches);
  document.documentElement.dataset['theme'] = resolved;
  log.debug('theme', 'applied', { mode, resolved });
};

/** Wire the top-bar toggle: shows the current mode, cycles on tap. */
export const initThemeToggle = (button: HTMLButtonElement): void => {
  let mode = storedMode();
  const render = (): void => {
    button.textContent = modeGlyph(mode);
    button.title = `Theme: ${mode} (tap to change)`;
    button.setAttribute('aria-label', `Theme: ${mode}`);
  };
  apply(mode);
  render();
  button.addEventListener('click', () => {
    mode = cycleMode(mode);
    persistMode(mode);
    apply(mode);
    render();
  });
  // In auto, follow live system changes (best-effort — old test DOMs lack it).
  try {
    prefersDarkQuery().addEventListener('change', () => {
      if (mode === 'auto') apply(mode);
    });
  } catch {
    /* no live media-query events available */
  }
};
