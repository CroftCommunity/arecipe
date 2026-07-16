// Account page: DOMAIN settings (blockdoku split) — who you are, sign out.
// App management lives on settings.html.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { getSessionSince } from '../auth/session-hint.js';
import { mountMembersList } from '../social/cookbook-members-view.js';
import { renderCalendarPublishSection } from '../publish/calendar-account-section.js';
import { createCalendarClient } from '../publish/client.js';
import { listPdsPlans } from '../recipes/meal-plan-sync.js';
import type { LocalPlan } from '../recipes/meal-plan-local.js';
import { createDietPreference, DIET_OPTIONS } from '../recipes/diet-preference.js';
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

/** The standing taste filters, both buckets under one "Taste" section:
 *  "Only show me" (the app-wide dietary preference — a whitelist, moved here
 *  from Settings) above "Never show me" (exclusions, by meal + cuisine).
 *  Device-local, applied across Browse, Cookbook, and the meal planner. The
 *  never bucket renders as a titled block whose Meals ▾ / Cuisines ▾ dropdowns
 *  (the Browse `.facet-dd` popover idiom) pick values to EXCLUDE site-wide;
 *  each summary carries a count bubble so selections show while collapsed. */
const renderTastePrefs = (): HTMLElement => {
  const store = createTastePreference();
  let pref: TastePreference = store.load();

  const section = el('section', 'settings-section taste-prefs');
  section.dataset['testid'] = 'taste-prefs';
  section.append(el('h3', 'section-title', 'Taste'));

  // "Only show me": the app-wide dietary preference. Written here, read by
  // Browse's renderCurrent. The id is the anchor the Browse diet link targets.
  const only = el('div', 'taste-only-block');
  only.id = 'diet-preference';
  only.dataset['testid'] = 'diet-preference';
  only.append(el('h4', 'taste-bucket-title', 'Only show me'));
  only.append(
    el(
      'p',
      'status',
      'Your standing dietary preference. Browse hides recipes that don’t match. Leave all unchecked to show everything.',
    ),
  );
  const dietPref = createDietPreference();
  const selectedDiet = new Set(dietPref.load());
  const dietBoxes: HTMLInputElement[] = [];
  for (const option of DIET_OPTIONS) {
    const row = el('label', 'starter-row');
    row.dataset['testid'] = 'diet-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset['token'] = option.token;
    box.checked = selectedDiet.has(option.token);
    box.addEventListener('change', () => {
      const chosen = dietBoxes.filter((b) => b.checked).map((b) => b.dataset['token'] ?? '');
      dietPref.save(chosen);
      log.debug('diet', 'toggled', { token: option.token, on: box.checked });
    });
    dietBoxes.push(box);
    row.append(box, el('span', undefined, option.label));
    only.append(row);
  }
  section.append(only);

  // "Never show me": a title block over per-dimension dropdowns. Everything
  // picked here is a standing EXCLUSION — hidden from every feed site-wide.
  const block = el('div', 'taste-never-block');
  block.dataset['testid'] = 'taste-never';
  block.append(el('h4', 'taste-bucket-title', 'Never show me'));
  block.append(
    el(
      'p',
      'status',
      'Meals and cuisines you pick here are excluded everywhere — hidden from Browse, your Cookbook, and the meal planner. Leave empty to show everything.',
    ),
  );

  // One multi-select dropdown per dimension — the same Meal ▾ / Cuisine ▾ idiom
  // as the Browse toolbar. The summary count bubble reflects how many values are
  // excluded on that dimension, visible without opening the dropdown.
  const dropdown = (
    label: string,
    options: readonly TasteOption[],
    dim: 'category' | 'cuisine',
  ): HTMLElement => {
    const details = el('details', 'facet-dd') as HTMLDetailsElement;
    details.setAttribute('name', 'taste-never'); // exclusive accordion (one open)
    details.dataset['testid'] = `taste-never-${dim}`;

    const summary = el('summary', 'facet-dd-summary');
    const badge = el('span', 'facet-count');
    badge.dataset['testid'] = `taste-never-${dim}-count`;
    const refreshBadge = (): void => {
      const n = pref.never[dim].length;
      badge.textContent = String(n);
      badge.style.display = n > 0 ? '' : 'none';
      badge.setAttribute('aria-label', `${n} excluded`);
    };
    summary.append(document.createTextNode(`${label} `), badge, document.createTextNode(' ▾'));

    const panel = el('div', 'facet-dd-panel');
    for (const o of options) {
      const opt = el('label', 'facet-dd-option');
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
      opt.append(box, document.createTextNode(o.label));
      panel.append(opt);
    }
    details.append(summary, panel);
    refreshBadge();
    return details;
  };

  const controls = el('div', 'taste-never-controls');
  controls.append(
    dropdown('Meals', MEAL_OPTIONS, 'category'),
    dropdown('Cuisines', CUISINE_OPTIONS, 'cuisine'),
  );

  // Close an open dropdown when tapping outside it (mirrors the Browse toolbar).
  document.addEventListener('click', (event) => {
    for (const dd of controls.querySelectorAll<HTMLDetailsElement>('details.facet-dd[open]')) {
      if (!dd.contains(event.target as Node)) dd.removeAttribute('open');
    }
  });

  block.append(controls);
  section.append(block);
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
    content.append(who);

    // "Signed in since": the first time this device saw the session (stamped by
    // the boot flow — the OAuth library exposes no login time of its own).
    // Absent on the preview demo session and pre-stamp sessions; just omitted.
    const since = getSessionSince();
    if (since !== null) {
      const sinceLine = el(
        'p',
        'status',
        `Signed in since ${since.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`,
      );
      sinceLine.dataset['testid'] = 'signed-in-since';
      content.append(sinceLine);
    }

    const signOut = el('button', 'button', 'Sign out') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.dataset['testid'] = 'sign-out';
    signOut.addEventListener('click', () => {
      void provider.signOut().then(() => window.location.reload());
    });
    content.append(signOut);

    // Who's in your cookbook (Phase 6): the members list moved here from
    // Cookbook. The shared view resolves your starter cooks + Bluesky graph and
    // renders them paginated with source badges + a Settings link, in the same
    // .settings-section card as Taste. Loads after the shell mounts so the page
    // shows immediately; a failure degrades to a status line.
    const membersSection = el('section', 'settings-section account-members');
    membersSection.append(el('h3', 'section-title', 'Cooks you follow'));
    content.append(membersSection);
    const did = agent.did;
    if (did !== undefined) {
      void (async () => {
        try {
          const { pds, handle } = await retryOnce(() => resolveDidDoc(did));
          if (handle !== null) who.textContent = `Signed in: ${handle} · ${did}`;
          await mountMembersList(membersSection, { did, pds }, createReachPrefs().load(), { agent });
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
