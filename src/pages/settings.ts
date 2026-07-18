// Settings page: APP MANAGEMENT (blockdoku split) — which build is running,
// how the integrity check works, About. Domain/account settings live on
// account.html. The update-check control arrives with Phase 8b.

import { formatBuildStamp, mountBuildStamp, type BuildInfo } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createRecipeCache } from '../recipes/cache.js';
import { createExclusions } from '../recipes/exclusions.js';
import { abbreviateId } from '../recipes/present.js';
import { createRecordReader } from '../recipes/read.js';
import { createStarterPrefs, STARTER_AUTHORS } from '../recipes/starter.js';
import { createSocialPrefs } from '../social/prefs.js';
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

  const updates = section('Updates & storage', 'updates');
  const checkButton = el('button', 'button', 'Check for updates') as HTMLButtonElement;
  checkButton.type = 'button';
  checkButton.dataset['testid'] = 'check-updates';
  const updateStatus = el('p', 'status');
  updateStatus.dataset['testid'] = 'update-status';
  checkButton.addEventListener('click', () => {
    void (async () => {
      updateStatus.textContent = 'checking…';
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg === undefined) {
        updateStatus.textContent = 'no service worker registered';
        return;
      }
      await reg.update();
      updateStatus.textContent =
        reg.waiting !== null || reg.installing !== null
          ? 'update found — the toast will offer it'
          : 'you are on the latest build';
    })().catch((err: unknown) => {
      updateStatus.textContent = `update check failed: ${String(err)}`;
    });
  });
  updates.append(checkButton, updateStatus);
  void (async () => {
    try {
      const estimate = await navigator.storage.estimate();
      const mb = (n: number | undefined): string =>
        n === undefined ? '?' : `${(n / 1024 / 1024).toFixed(1)} MB`;
      updates.append(
        el('p', 'status', `local storage: ${mb(estimate.usage)} used of ${mb(estimate.quota)} available`),
      );
    } catch {
      /* estimate unsupported — nothing to show */
    }
  })();

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

  // The "Only show me" dietary preference moved to the Account page's Taste
  // section (account.html#diet-preference), alongside "Never show me".

  const social = section('Social', 'social-settings');
  social.append(
    el(
      'p',
      'status',
      'What shows on recipes from you and your friends. Off by default — turn on to hide.',
    ),
  );
  const socialPrefs = createSocialPrefs();
  const hideCommentsRow = el('label', 'starter-row');
  hideCommentsRow.dataset['testid'] = 'social-hide-comments';
  const hideCommentsBox = document.createElement('input');
  hideCommentsBox.type = 'checkbox';
  hideCommentsBox.checked = socialPrefs.hideComments();
  hideCommentsBox.addEventListener('change', () => {
    socialPrefs.setHideComments(hideCommentsBox.checked);
    log.debug('social', 'hide comments toggled', { hidden: hideCommentsBox.checked });
  });
  hideCommentsRow.append(hideCommentsBox, el('span', undefined, 'Hide comments'));
  social.append(hideCommentsRow);
  // Hide Likes lands in 9c alongside the like interaction (same panel/store).

  // "Did you know?" fun facts — shown everywhere by default; opt out here.
  const funFactsRow = el('label', 'starter-row');
  funFactsRow.dataset['testid'] = 'include-fun-facts';
  const funFactsBox = document.createElement('input');
  funFactsBox.type = 'checkbox';
  funFactsBox.checked = socialPrefs.includeFunFacts();
  funFactsBox.addEventListener('change', () => {
    socialPrefs.setIncludeFunFacts(funFactsBox.checked);
    log.debug('social', 'include fun facts toggled', { include: funFactsBox.checked });
  });
  funFactsRow.append(funFactsBox, el('span', undefined, 'Include fun facts'));
  social.append(funFactsRow);

  // Collapsed by default (it can hold many baseline entries): a <details> whose
  // summary carries the live count; the list is revealed only when expanded.
  const hiddenSection = el('details', 'settings-section hidden-recipes') as HTMLDetailsElement;
  hiddenSection.dataset['testid'] = 'hidden-recipes';
  const hiddenSummary = el('summary', 'hidden-summary');
  hiddenSection.append(hiddenSummary);
  hiddenSection.append(
    el('p', 'status', 'Recipes you (or the built-in baseline) hid from feeds. Unhide to restore.'),
  );
  const exclusions = createExclusions();
  const hiddenList = el('div');
  hiddenSection.append(hiddenList);
  // Human-readable labels: uri → recipe name, resolved lazily the first time the
  // section is expanded (recipe cache first, then a best-effort fetch from the
  // author's PDS) so the collapsed page stays network-free. Entries that can't
  // be resolved keep the abbreviated id.
  const hiddenNames = new Map<string, string>();
  const renderHidden = (): void => {
    const all = exclusions.all();
    hiddenSummary.textContent = `Hidden recipes (${all.length})`;
    hiddenList.replaceChildren();
    if (all.length === 0) {
      hiddenList.append(el('p', 'status', 'nothing hidden'));
      return;
    }
    for (const uri of all) {
      const row = el('div', 'draft-row');
      row.dataset['testid'] = 'hidden-row';
      // Until the name arrives, show a short, single-line id (the raw rkey is a
      // 26-char ULID that wraps into an ugly multi-line blob on mobile); the
      // full URI stays in the title either way.
      const rkey = uri.split('/').slice(-1)[0] ?? uri;
      const link = el('a', 'draft-link', hiddenNames.get(uri) ?? abbreviateId(rkey)) as HTMLAnchorElement;
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
  const lookupHiddenName = async (uri: string): Promise<string | null> => {
    const cache = createRecipeCache();
    const cached = await cache.get(uri);
    if (cached !== undefined) return (cached.value as { name?: string }).name ?? null;
    const match = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
    if (match === null) return null;
    const { pds } = await resolveDidDoc(match[1]!);
    const record = await createRecordReader()({ pds, did: match[1]!, rkey: match[2]! });
    await cache.put(record); // verified + cached like any other read
    return record.value.name;
  };
  let hiddenNamesRequested = false;
  hiddenSection.addEventListener('toggle', () => {
    if (!hiddenSection.open || hiddenNamesRequested) return;
    hiddenNamesRequested = true;
    for (const uri of exclusions.all()) {
      void lookupHiddenName(uri)
        .then((name) => {
          if (name !== null && name !== '') {
            hiddenNames.set(uri, name);
            renderHidden();
          }
        })
        .catch((err: unknown) => {
          log.debug('exclusions', 'hidden recipe name lookup failed', { uri, error: String(err) });
        });
    }
  });
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
  const guidePara = el('p');
  const guideLink = el('a', 'friend-link', 'User guide') as HTMLAnchorElement;
  guideLink.href = './user-guide.html';
  guideLink.dataset['testid'] = 'settings-user-guide';
  guidePara.append(
    guideLink,
    document.createTextNode(' — how to import recipes by sharing, and more.'),
  );
  about.append(guidePara);

  content.append(build, updates, starter, social, hiddenSection, integrity, about);
  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'settings' });
  void registerServiceWorker();
};

void main();
