// Shared nav shell (Phase 5b). Page-per-destination: these are real links
// between real documents — native back button, no router, no tab state.
// Top bar: wordmark = home, theme toggle (5c), settings gear. Tab bar:
// primary destinations, rendered at the bottom on small screens (thumb
// reach), top on wide.

import { mountPreviewDemoBanner } from './auth/preview-session.js';
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
  // Sign-in affordance (zero-auth): the nav ships no auth client, so it reads
  // only the localStorage session hint (written by the auth boot flow) to point
  // at the dedicated sign-in page or the account page. A visible top-right entry
  // so sign-in is discoverable without hunting through the tabs.
  let signedIn = false;
  try {
    signedIn = window.localStorage.getItem('arecipe-session') === '1';
  } catch {
    /* storage blocked → treat as signed-out (points at sign-in) */
  }
  const authLink = el('a', 'nav-auth', signedIn ? 'Account' : 'Sign in') as HTMLAnchorElement;
  authLink.href = signedIn ? './account.html' : './signin.html';
  authLink.dataset['testid'] = signedIn ? 'nav-account' : 'nav-signin';
  const themeToggle = el('button', 'nav-gear') as HTMLButtonElement;
  themeToggle.type = 'button';
  themeToggle.dataset['testid'] = 'theme-toggle';
  initThemeToggle(themeToggle);
  const gear = el('a', 'nav-gear', '⚙') as HTMLAnchorElement;
  gear.href = './settings.html';
  gear.dataset['testid'] = 'nav-settings';
  gear.setAttribute('aria-label', 'Settings');
  controls.append(authLink, themeToggle, gear);
  bar.append(wordmark, controls);
  return bar;
};

const DESTINATIONS = [
  { label: 'Browse', href: './index.html', testid: 'tab-browse', match: /(^|\/)(index\.html)?$/ },
  { label: 'Cookbook', href: './cookbook.html', testid: 'tab-cookbook', match: /\/cookbook\.html$/ },
  { label: 'Alchemy', href: './mine.html', testid: 'tab-mine', match: /\/mine\.html$/ },
  { label: 'Meals', href: './meals.html', testid: 'tab-meals', match: /\/meals\.html$/ },
  {
    label: 'Reference',
    href: './reference.html',
    testid: 'tab-reference',
    match: /\/reference\.html$/,
  },
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
  // No-op unless this is a /pr-preview/ build (production + tests never match).
  mountPreviewDemoBanner(app);
};
