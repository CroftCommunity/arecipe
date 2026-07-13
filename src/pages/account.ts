// Account page: DOMAIN settings (blockdoku split) — who you are, sign out.
// App management lives on settings.html.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { mountMembersList } from '../social/cookbook-members-view.js';
import { renderCalendarPublishSection } from '../publish/calendar-account-section.js';
import { createCalendarClient } from '../publish/client.js';
import { listPdsPlans } from '../recipes/meal-plan-sync.js';
import type { LocalPlan } from '../recipes/meal-plan-local.js';
import { createReachPrefs } from '../social/reach.js';
import {
  CUISINE_OPTIONS,
  MEAL_OPTIONS,
  createTastePreference,
  type TasteOption,
  type TastePreference,
} from '../recipes/taste-preference.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The standing taste filter ("Never show me", by meal + cuisine). Device-local
 *  (createTastePreference), applied across Browse, Cookbook, and the meal planner.
 *  Rendered on the account page as a single multi-select dropdown (the Browse
 *  `.facet-dd` popover idiom): a "Never show me ▾" summary with a selected-count
 *  bubble, opening onto Meals + Cuisines checkbox groups. */
const renderTastePrefs = (): HTMLElement => {
  const store = createTastePreference();
  let pref: TastePreference = store.load();

  const section = el('section', 'settings-section taste-prefs');
  section.dataset['testid'] = 'taste-prefs';
  section.append(el('h3', 'section-title', 'Taste'));
  section.append(
    el(
      'p',
      'status',
      'Standing filters applied everywhere — Browse, your Cookbook, and the meal planner. Leave empty to show everything.',
    ),
  );

  // "Never show me" (blacklist) as one multi-select dropdown. A native <details>
  // popover reusing the Browse facet-dropdown styling; the summary carries a
  // live count of how many meals + cuisines are hidden.
  const details = el('details', 'facet-dd taste-never-dd') as HTMLDetailsElement;
  details.dataset['testid'] = 'taste-never';
  const summary = el('summary', 'facet-dd-summary');
  const badge = el('span', 'facet-count');
  badge.dataset['testid'] = 'taste-never-count';
  const refreshBadge = (): void => {
    const n = pref.never.category.length + pref.never.cuisine.length;
    badge.textContent = String(n);
    badge.style.display = n > 0 ? '' : 'none';
    badge.setAttribute('aria-label', `${n} hidden`);
  };
  summary.append(document.createTextNode('Never show me '), badge, document.createTextNode(' ▾'));

  const panel = el('div', 'facet-dd-panel');

  const group = (
    title: string,
    options: readonly TasteOption[],
    dim: 'category' | 'cuisine',
  ): HTMLElement => {
    const wrap = el('div', 'taste-group');
    wrap.append(el('span', 'taste-group-label', title));
    const opts = el('div', 'taste-options');
    for (const o of options) {
      const label = el('label', 'facet-dd-option');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = pref.never[dim].includes(o.value);
      box.dataset['testid'] = `taste-never-${dim}-${o.value.replace(/\s+/g, '-')}`;
      box.addEventListener('change', () => {
        const set = new Set(pref.never[dim]);
        if (box.checked) set.add(o.value);
        else set.delete(o.value);
        pref = { ...pref, never: { ...pref.never, [dim]: [...set] } };
        store.save(pref);
        refreshBadge();
      });
      label.append(box, document.createTextNode(o.label));
      opts.append(label);
    }
    wrap.append(opts);
    return wrap;
  };

  panel.append(group('Meals', MEAL_OPTIONS, 'category'), group('Cuisines', CUISINE_OPTIONS, 'cuisine'));
  details.append(summary, panel);
  refreshBadge();

  section.append(details);
  return section;
};

const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  content.append(el('h2', 'page-title', 'Account'));
  const { provider, agent } = await bootSession();

  if (agent !== null && provider !== null) {
    const who = el('p', 'status');
    who.dataset['testid'] = 'signed-in-did';
    // Show the DID immediately (works even if the handle never resolves); the
    // members load below resolves the DID document anyway, so we upgrade this to
    // "@handle · did:…" — the username with the DID beside it — once it lands.
    who.textContent = `Signed in: ${agent.did ?? 'unknown'}`;
    const signOut = el('button', 'button', 'Sign out') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.dataset['testid'] = 'sign-out';
    signOut.addEventListener('click', () => {
      void provider.signOut().then(() => window.location.reload());
    });
    content.append(who, signOut);

    // Who's in your cookbook (Phase 6): the members list moved here from
    // Cookbook. The shared view resolves your starter cooks + Bluesky graph and
    // renders them with source badges + a Settings link. Loads after the shell
    // mounts so the page shows immediately; a failure degrades to a status line.
    const membersSection = el('section', 'account-members');
    membersSection.append(el('h3', 'section-title', 'Your cookbook'));
    content.append(membersSection);
    const did = agent.did;
    if (did !== undefined) {
      void (async () => {
        try {
          const { pds, handle } = await retryOnce(() => resolveDidDoc(did));
          if (handle !== null) who.textContent = `Signed in: ${handle} · ${did}`;
          await mountMembersList(membersSection, { did, pds }, createReachPrefs().load());
        } catch (err) {
          log.error('account', 'cookbook members load failed', { error: String(err) });
        }
      })();
    }

  } else {
    const signedOut = el('p', 'empty-state');
    signedOut.dataset['testid'] = 'account-signed-out';
    const signInLink = el('a', 'friend-link', 'Sign in') as HTMLAnchorElement;
    signInLink.href = './signin.html';
    signedOut.append(
      document.createTextNode('Not signed in — '),
      signInLink,
      document.createTextNode(' to manage your account.'),
    );
    content.append(signedOut);
  }

  // Taste preferences are device-local (no account needed), so they render for
  // everyone on the account page — signed in or out.
  content.append(renderTastePrefs());

  // Publish-a-calendar is likewise device-local, so it renders for everyone
  // (configurable signed-out — the token/repo live in this browser). "Publish
  // now" needs a session to list your published plans; without one it publishes
  // an empty calendar. Rendering it unconditionally also makes it visible on the
  // read-only PR preview, which has no live sign-in.
  const listPublishedPlans = async (): Promise<LocalPlan[]> => {
    const signedInDid = agent?.did;
    if (signedInDid === undefined) return [];
    const { pds } = await retryOnce(() => resolveDidDoc(signedInDid));
    return listPdsPlans(pds, signedInDid);
  };
  content.append(renderCalendarPublishSection(createCalendarClient(), listPublishedPlans));

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'account', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
