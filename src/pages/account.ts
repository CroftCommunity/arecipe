// Account page: DOMAIN settings (blockdoku split) — who you are, sign out.
// App management lives on settings.html.

import { bootSession } from '../auth/boot.js';
import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
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
  } else {
    const signedOut = el('p', 'empty-state', 'Not signed in — sign in from My recipes.');
    signedOut.dataset['testid'] = 'account-signed-out';
    content.append(signedOut);
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'account', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
