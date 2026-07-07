// Settings page: APP MANAGEMENT (blockdoku split) — which build is running,
// how the integrity check works, About. Domain/account settings live on
// account.html. The update-check control arrives with Phase 8b.

import { formatBuildStamp, mountBuildStamp, type BuildInfo } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
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

  content.append(build, integrity, about);
  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'settings' });
  void registerServiceWorker();
};

void main();
