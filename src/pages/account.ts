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
  content.append(el('h2', 'page-title', 'Account'));
  const { provider, agent } = await bootSession();

  if (agent !== null && provider !== null) {
    const who = el('p', 'status');
    who.dataset['testid'] = 'signed-in-did';
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
          const { pds } = await retryOnce(() => resolveDidDoc(did));
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

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'account', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
