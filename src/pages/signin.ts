// Dedicated sign-in page. Sign-in is a distinct task with its own document
// (not a section on My recipes) — enter a handle, sign in via atproto OAuth,
// land in the app (Cookbook). The OAuth callback (?code=…) round-trips back to
// whichever page initiated it: on loopback the redirect_uri derives from this
// page's location (oauth-client.ts buildLoopbackMetadata); on the hosted origin
// it comes from client-metadata.json (repointed to /signin.html in the Phase 2
// cutover). Either way bootSession()→provider.restore()→client.init() completes
// the callback here. See plans/2026-07-08-2-plan-dedicated-signin-page.md.

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

  // Branch (1): already signed in — or a callback just completed via init() —
  // so land in the app. The auth boundary logs (initiated/restored) come from
  // session-provider/boot one layer down; this is the page-level forward.
  if (agent !== null) {
    log.info('auth', 'signed in — forwarding', { to: 'cookbook' });
    window.location.replace('./cookbook.html');
    return;
  }

  content.append(el('h2', 'page-title', 'Sign in'));

  if (provider === null) {
    // Branch (3): read-only origin (neither loopback nor the hosted origin).
    // No OAuth client can exist here — client_id must match the serving origin
    // — so sign-in is structurally impossible. A terminal, honest note (do not
    // point at another page: there is nowhere here that can sign you in).
    const note = el('p', 'empty-state', 'Sign-in isn’t available on this copy of the app.');
    note.dataset['testid'] = 'signin-unavailable';
    content.append(note);
  } else {
    // Branch (2): signed out with a live OAuth client — the dedicated login UI.
    const intro = el(
      'p',
      'status',
      'Sign in with your Bluesky handle to save recipes to your account and see your Cookbook. Browsing and drafting work without an account.',
    );
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
    content.append(intro, form, status);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = 'redirecting to sign-in…';
      // Resolves only on failure/abort — success navigates away to the IdP.
      // provider.signIn logs 'sign-in initiated'; this page-level catch is the
      // failure surface (error level → emits without ?debug=1, so a failed
      // hosted sign-in is debuggable from the console post-deploy).
      void provider.signIn(input.value.trim()).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('auth', 'sign-in failed', { error: message });
        status.textContent = `sign-in failed: ${message}`;
      });
    });
  }

  mountShell(app, content);
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', {
    page: 'signin',
    signedIn: false,
    mode: provider === null ? 'unavailable' : 'form',
  });
  void registerServiceWorker();
};

void main();
