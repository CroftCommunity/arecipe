// Alchemy page (formerly "My recipes"): sign-in lives here (the OAuth callback round-trips back
// to /mine.html — the loopback client_id derives its redirect_uri from this
// page's location). Authoring arrives in Phase 6.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createDraftStore, type DraftStatus } from '../recipes/drafts-local.js';
import { listPdsDrafts } from '../recipes/drafts-sync.js';
import { retryOnce } from '../retry.js';
import { requestPersistence } from '../storage-persist.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  // Alchemy (renamed from "My recipes"): your drafting workspace — create,
  // edit, save, publish. The heading names the space; the route/testid stay
  // `mine.html`/`tab-mine`. Title row: "Alchemy" on the left, "New recipe"
  // right-aligned on the same line.
  const header = el('div', 'alchemy-header');
  header.append(el('h2', 'page-title', 'Alchemy'));
  content.append(header);
  const { provider, agent } = await bootSession();
  void requestPersistence();

  // Authoring entry + local drafts are for everyone — drafting needs no
  // account; publishing (in the editor) does.
  const newRecipe = el('a', 'button button--primary', 'New recipe') as HTMLAnchorElement;
  newRecipe.href = './editor.html';
  newRecipe.dataset['testid'] = 'new-recipe';
  header.append(newRecipe);

  const draftsSection = el('section');
  draftsSection.append(el('h3', 'section-title', 'Drafts'));

  // Status filter (Phase 11c): narrow the drafts list by draft status. Drafts
  // only — published recipes live on Cookbook → "Mine" now, not here (OQ13).
  let statusFilter: 'all' | DraftStatus = 'all';
  const filterBar = el('div', 'segmented alchemy-filter');
  const filterButtons: [HTMLButtonElement, 'all' | DraftStatus][] = [];
  const reflectFilter = (): void => {
    for (const [btn, key] of filterButtons) {
      const active = statusFilter === key;
      btn.classList.toggle('segmented-option--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  };
  const mkFilter = (label: string, key: 'all' | DraftStatus, testid: string): HTMLButtonElement => {
    const btn = el('button', 'segmented-option', label) as HTMLButtonElement;
    btn.type = 'button';
    btn.dataset['testid'] = testid;
    btn.addEventListener('click', () => {
      statusFilter = key;
      reflectFilter();
      void renderDrafts();
    });
    filterButtons.push([btn, key]);
    return btn;
  };
  filterBar.append(
    mkFilter('All', 'all', 'filter-all'),
    mkFilter('Draft', 'draft', 'filter-draft'),
    mkFilter('Cooking', 'cooking', 'filter-cooking'),
    mkFilter('Ready', 'ready', 'filter-ready'),
  );
  draftsSection.append(filterBar);

  const draftsList = el('div');
  draftsSection.append(draftsList);
  content.append(draftsSection);
  const drafts = createDraftStore();
  const renderDrafts = async (): Promise<void> => {
    const all = await drafts.list();
    const shown = statusFilter === 'all' ? all : all.filter((d) => d.status === statusFilter);
    draftsList.replaceChildren();
    if (shown.length === 0) {
      const none = el(
        'p',
        'status',
        all.length === 0
          ? 'no drafts — nothing here leaves this device'
          : `no ${statusFilter} drafts`,
      );
      draftsList.append(none);
      return;
    }
    for (const draft of shown) {
      const row = el('div', 'draft-row');
      row.dataset['testid'] = 'draft-row';
      const open = el('a', 'draft-link', draft.fields.name.trim() === '' ? '(untitled)' : draft.fields.name) as HTMLAnchorElement;
      open.href = `./editor.html?draft=${encodeURIComponent(draft.id)}`;
      const remove = el('button', 'button', 'Delete') as HTMLButtonElement;
      remove.type = 'button';
      remove.dataset['testid'] = 'draft-delete';
      remove.addEventListener('click', () => {
        void drafts.remove(draft.id).then(renderDrafts);
      });
      row.append(open, remove);
      draftsList.append(row);
    }
  };
  reflectFilter();
  void renderDrafts().catch((err: unknown) => {
    log.warn('drafts', 'list failed', { error: String(err) });
  });

  if (agent !== null) {
    // Alchemy is the drafting workspace. The signed-in identity now shows on
    // Account (with the handle), and the "Published" recipe list moved to
    // Cookbook → "Mine" — so neither is duplicated here. We still run the
    // silent PDS draft recovery (Phase 8): import PDS-backed drafts that are
    // missing locally after an eviction or a fresh browser.
    const did = agent.did;
    if (did !== undefined) {
      void (async () => {
        try {
          // Retry once: this fires right after the OAuth redirect settles, where
          // the first fetch can transiently fail (observed at the M3 demo).
          const { pds } = await retryOnce(() => resolveDidDoc(did));
          const remote = await listPdsDrafts(pds, did);
          let recovered = 0;
          for (const draft of remote) {
            if ((await drafts.get(draft.id)) === undefined) {
              await drafts.save(draft.fields, draft.id, draft.status);
              recovered += 1;
            }
          }
          if (recovered > 0) {
            log.info('drafts', 'recovered from PDS', { count: recovered });
            await renderDrafts();
          }
        } catch (err) {
          log.warn('drafts', 'PDS draft recovery failed', { error: String(err) });
        }
      })();
    }
  } else if (provider !== null) {
    // Signed out: a short pointer to the dedicated sign-in page. Drafting needs
    // no account (New recipe + Drafts below stay account-free), so Alchemy is
    // no longer a login surface — the form lives on signin.html now.
    const pointer = el('p', 'status');
    const signInLink = el('a', 'friend-link', 'Sign in') as HTMLAnchorElement;
    signInLink.href = './signin.html';
    signInLink.dataset['testid'] = 'mine-signin-pointer';
    pointer.append(
      signInLink,
      document.createTextNode(' to save your recipes to your account and see your Cookbook.'),
    );
    content.prepend(pointer); // above New recipe / Drafts, but a pointer, not a form
  } else {
    // Read-only origin (no OAuth client can exist here — client_id must match
    // the serving origin): sign-in is structurally impossible, so a terminal
    // note. Deliberately does NOT point at signin.html (nowhere here can sign
    // you in). See plans/2026-07-08-2-plan-dedicated-signin-page.md Open Questions.
    const empty = el('p', 'empty-state', 'Sign-in isn’t available on this copy of the app.');
    empty.dataset['testid'] = 'mine-empty';
    content.append(empty);
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'mine', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
