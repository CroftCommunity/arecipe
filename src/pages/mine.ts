// My recipes page: sign-in lives here (the OAuth callback round-trips back
// to /mine.html — the loopback client_id derives its redirect_uri from this
// page's location). Authoring arrives in Phase 6.

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
  const { provider, agent } = await bootSession();

  if (agent !== null) {
    const who = el('p', 'status');
    who.dataset['testid'] = 'signed-in-did';
    who.textContent = `Signed in: ${agent.did ?? 'unknown'}`;
    const empty = el(
      'p',
      'empty-state',
      'Your shelf is empty — authoring arrives with the next milestone.',
    );
    empty.dataset['testid'] = 'mine-empty';
    content.append(who, empty);
  } else if (provider !== null) {
    const form = el('form', 'lookup') as HTMLFormElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'your.handle (e.g. name.bsky.social)';
    input.dataset['testid'] = 'handle-input';
    const signInButton = el('button', 'button button--primary', 'Sign in') as HTMLButtonElement;
    signInButton.type = 'submit';
    signInButton.dataset['testid'] = 'oauth-signin';
    const status = el('p', 'status');
    status.dataset['testid'] = 'signin-status';
    form.append(input, signInButton);
    const empty = el('p', 'empty-state', 'Sign in to keep your recipes here.');
    empty.dataset['testid'] = 'mine-empty';
    content.append(form, status, empty);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = 'redirecting to sign-in…';
      // Resolves only on failure/abort — success navigates away.
      void provider.signIn(input.value.trim()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('auth', 'sign-in failed', { error: message });
        status.textContent = `sign-in failed: ${message}`;
      });
    });
  } else {
    const empty = el(
      'p',
      'empty-state',
      'Sign in arrives here once the hosted client ships — browse works everywhere today.',
    );
    empty.dataset['testid'] = 'mine-empty';
    content.append(empty);
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'mine', signedIn: agent !== null });
  void registerServiceWorker();
};

void main();
