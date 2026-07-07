// Shared nav shell (Phase 5b). Page-per-destination: these are real links
// between real documents — native back button, no router, no tab state.
// Top bar: wordmark = home, theme toggle (5c), settings gear. Tab bar:
// primary destinations, rendered at the bottom on small screens (thumb
// reach), top on wide.

import { initThemeToggle } from './theme.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const logoImg = (variant: 'light' | 'dark'): HTMLImageElement => {
  const img = document.createElement('img');
  img.className = `logo logo--${variant}`;
  img.src = `./assets/logo-${variant}.png`;
  img.alt = ''; // decorative — the wordmark beside it carries the name
  return img;
};

export const renderTopbar = (): HTMLElement => {
  const bar = el('header', 'topbar');
  const wordmark = el('h1', 'wordmark');
  const home = el('a', 'wordmark-link') as HTMLAnchorElement;
  home.href = './index.html';
  // Butterfly-spatula mark: theme-variant pair, CSS shows the right one.
  home.append(
    logoImg('light'),
    logoImg('dark'),
    el('span', 'wordmark-a', 'a'),
    document.createTextNode('recipe'),
  );
  wordmark.append(home);
  const controls = el('div', 'auth-area');
  const themeToggle = el('button', 'nav-gear') as HTMLButtonElement;
  themeToggle.type = 'button';
  themeToggle.dataset['testid'] = 'theme-toggle';
  initThemeToggle(themeToggle);
  const gear = el('a', 'nav-gear', '⚙') as HTMLAnchorElement;
  gear.href = './settings.html';
  gear.dataset['testid'] = 'nav-settings';
  gear.setAttribute('aria-label', 'Settings');
  controls.append(themeToggle, gear);
  bar.append(wordmark, controls);
  return bar;
};

const DESTINATIONS = [
  { label: 'Browse', href: './index.html', testid: 'tab-browse', match: /(^|\/)(index\.html)?$/ },
  { label: 'My recipes', href: './mine.html', testid: 'tab-mine', match: /\/mine\.html$/ },
] as const;

export const renderTabs = (pathname: string): HTMLElement => {
  const tabs = el('nav', 'tabs');
  for (const dest of DESTINATIONS) {
    const link = el('a', 'tab', dest.label) as HTMLAnchorElement;
    link.href = dest.href;
    link.dataset['testid'] = dest.testid;
    if (dest.match.test(pathname)) link.classList.add('tab--active');
    tabs.append(link);
  }
  return tabs;
};

/** Mount the shared shell chrome around a page's own content element. */
export const mountShell = (app: HTMLElement, content: HTMLElement): void => {
  app.replaceChildren(renderTopbar(), renderTabs(window.location.pathname), content);
};
