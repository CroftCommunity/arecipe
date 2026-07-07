// Settings page: APP MANAGEMENT (blockdoku split) — which build is running,
// how the integrity check works, About. Domain/account settings live on
// account.html. The update-check control arrives with Phase 8b.

import { formatBuildStamp, mountBuildStamp, type BuildInfo } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createExclusions } from '../recipes/exclusions.js';
import { createStarterPrefs, STARTER_AUTHORS } from '../recipes/starter.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const section = (title: string, testid: string): HTMLElement => {
  const box = el('section', 'settings-section');
  box.dataset['testid'] = testid;
  box.append(el('h3', undefined, title));
  return box;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  content.append(el('h2', 'page-title', 'Settings'));

  const build = section('This build', 'build-facts');
  try {
    const res = await fetch('./build-info.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = (await res.json()) as BuildInfo;
    const list = el('dl', 'facts');
    const fact = (term: string, value: string): void => {
      list.append(el('dt', undefined, term), el('dd', undefined, value));
    };
    fact('version', info.version);
    fact('built', info.builtAt);
    fact('this page delivered', formatBuildStamp(info).split('· ')[1] ?? '');
    build.append(list);
  } catch (err) {
    build.append(el('p', 'status', 'build info unavailable'));
    log.warn('build', 'build-info.json missing or invalid', { error: String(err) });
  }

  const integrity = section('How recipes are checked', 'integrity-explainer');
  integrity.append(
    el(
      'p',
      undefined,
      'Every recipe on the network is addressed by a fingerprint of its exact ' +
        'content. When arecipe fetches a recipe from its author’s server, it ' +
        're-does the math and compares. A match means the copy on your screen ' +
        'is byte-for-byte what the author published — the detail view says ' +
        '“fingerprint matches”. A mismatch means something altered it along ' +
        'the way, and the recipe is stamped ALTERED? with a warning.',
    ),
  );

  const starter = section('Starter pack', 'starter-pack');
  starter.append(
    el(
      'p',
      'status',
      'Cooks whose recipes fill Browse by default. Uncheck to hide; names open their Bluesky profile.',
    ),
  );
  const prefs = createStarterPrefs();
  for (const author of STARTER_AUTHORS) {
    const row = el('label', 'starter-row');
    row.dataset['testid'] = 'starter-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = prefs.isEnabled(author.handle);
    box.addEventListener('change', () => {
      prefs.setEnabled(author.handle, box.checked);
      log.debug('starter', 'toggled', { handle: author.handle, enabled: box.checked });
    });
    const link = el('a', 'starter-author', author.handle) as HTMLAnchorElement;
    link.href = `https://bsky.app/profile/${encodeURIComponent(author.handle)}`;
    link.rel = 'noopener';
    row.append(box, link);
    starter.append(row);
  }

  const hiddenSection = section('Hidden recipes', 'hidden-recipes');
  hiddenSection.append(
    el('p', 'status', 'Recipes you (or the built-in baseline) hid from feeds. Unhide to restore.'),
  );
  const exclusions = createExclusions();
  const hiddenList = el('div');
  hiddenSection.append(hiddenList);
  const renderHidden = (): void => {
    hiddenList.replaceChildren();
    const all = exclusions.all();
    if (all.length === 0) {
      hiddenList.append(el('p', 'status', 'nothing hidden'));
      return;
    }
    for (const uri of all) {
      const row = el('div', 'draft-row');
      row.dataset['testid'] = 'hidden-row';
      const link = el('a', 'draft-link', uri.split('/').slice(-1)[0] ?? uri) as HTMLAnchorElement;
      link.href = `./recipe.html?u=${encodeURIComponent(uri)}`;
      link.title = uri;
      const unhide = el('button', 'button', 'Unhide') as HTMLButtonElement;
      unhide.type = 'button';
      unhide.dataset['testid'] = 'unhide';
      unhide.addEventListener('click', () => {
        exclusions.unhide(uri);
        renderHidden();
      });
      row.append(link, unhide);
      hiddenList.append(row);
    }
  };
  renderHidden();

  const about = section('About', 'about');
  about.append(
    el(
      'p',
      undefined,
      'arecipe is a recipe app with no backend: recipes live in their authors’ ' +
        'own accounts on the AT Protocol, and this site is just a viewer you ' +
        'could swap out. The same recipes appear on recipe.exchange with zero ' +
        'coordination.',
    ),
  );

  content.append(build, starter, hiddenSection, integrity, about);
  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'settings' });
  void registerServiceWorker();
};

void main();
