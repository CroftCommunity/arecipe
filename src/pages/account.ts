// Account page: DOMAIN settings (blockdoku split) — who you are, sign out.
// App management lives on settings.html.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { retryOnce } from '../retry.js';
import { mountMembersList } from '../social/cookbook-members-view.js';
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

/** The standing taste filters (Only show me / Never show me, by meal + cuisine).
 *  Device-local (createTastePreference), applied across Browse, Cookbook, and the
 *  meal planner. Rendered on the account page as four checkbox groups. */
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

  const group = (
    title: string,
    options: readonly TasteOption[],
    bucket: 'only' | 'never',
    dim: 'category' | 'cuisine',
  ): HTMLElement => {
    const wrap = el('div', 'taste-group');
    wrap.append(el('span', 'taste-group-label', title));
    const opts = el('div', 'taste-options');
    for (const o of options) {
      const label = el('label', 'taste-option');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = pref[bucket][dim].includes(o.value);
      box.dataset['testid'] = `taste-${bucket}-${dim}-${o.value.replace(/\s+/g, '-')}`;
      box.addEventListener('change', () => {
        const set = new Set(pref[bucket][dim]);
        if (box.checked) set.add(o.value);
        else set.delete(o.value);
        pref = { ...pref, [bucket]: { ...pref[bucket], [dim]: [...set] } };
        store.save(pref);
      });
      label.append(box, document.createTextNode(o.label));
      opts.append(label);
    }
    wrap.append(opts);
    return wrap;
  };

  const bucket = (title: string, key: 'only' | 'never'): HTMLElement => {
    const b = el('div', 'taste-bucket');
    b.dataset['testid'] = `taste-${key}`;
    b.append(
      el('h4', 'taste-bucket-title', title),
      group('Meals', MEAL_OPTIONS, key, 'category'),
      group('Cuisines', CUISINE_OPTIONS, key, 'cuisine'),
    );
    return b;
  };

  section.append(bucket('Only show me', 'only'), bucket('Never show me', 'never'));
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

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'account', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
