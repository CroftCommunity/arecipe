// Dedicated sign-in page. Sign-in is a distinct task with its own document
// (not a section on My recipes) — enter a handle, sign in via atproto OAuth,
// land in the app (Cookbook). The OAuth callback (?code=…) round-trips back to
// whichever page initiated it: on loopback the redirect_uri derives from this
// page's location (oauth-client.ts buildLoopbackMetadata); on the hosted origin
// it comes from client-metadata.json (repointed to /signin.html in the Phase 2
// cutover). Either way bootSession()→provider.restore()→client.init() completes
// the callback here. See plans/2026-07-08-2-plan-dedicated-signin-page.md.

import { bootSession } from '../auth/boot.js';
import {
  ATMO_GLOSS,
  canCreateAccount,
  featuredProviders,
  otherProviders,
  type Provider,
} from '../auth/providers.js';
import type { SignInOptions } from '../auth/session-provider.js';
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

// One row shape for both panels. The two-direction rule (open offers Create,
// invite-only shows the WORDS in the create slot) is a property of the
// provider, not of the panel — a provider that changes posture moves panels and
// changes its controls in one edit to the registry.
const providerRow = (p: Provider, start: (t: string, o?: SignInOptions) => void): HTMLElement => {
  const row = el('div', 'signin-row');
  row.dataset['providerRow'] = p.id;
  const actions = el('div', 'signin-actions');
  if (canCreateAccount(p)) {
    // prompt=create is not decoration: driven end to end against the open
    // providers, it lands in the registration wizard rather than the sign-in
    // screen. Without that evidence this button and the one beside it would be
    // two routes to one page wearing different words.
    const create = el('button', 'button button--primary', 'Create account') as HTMLButtonElement;
    create.type = 'button';
    create.dataset['providerCreate'] = '';
    create.addEventListener('click', () => start(p.entryway, { prompt: 'create' }));
    actions.append(create);
  } else {
    // The words sit in the CREATE slot so the column stays aligned and the
    // italic explains the button that is missing. An invite-only provider
    // still ADVERTISES create; offering it would land on a wall demanding a code.
    actions.append(el('span', 'signin-invite', 'invite only'));
  }
  const go = el('button', 'button', 'Sign in') as HTMLButtonElement;
  go.type = 'button';
  go.dataset['providerSignin'] = '';
  go.addEventListener('click', () => start(p.entryway));
  actions.append(go);
  row.append(el('span', 'signin-provider', p.label), actions);
  return row;
};

const signInPattern = (opts: {
  start: (t: string, o?: SignInOptions) => void;
  status: HTMLElement;
}): Node[] => {
  // "atmo" is the owner's word (2026-08-29) for a home on the open social
  // Atmosphere. The gloss is a native <abbr title>: it hovers on a desktop and
  // assistive tech reads it, but touch cannot hover — so the sentence below
  // says the same thing in plain sight, and the tooltip is a bonus.
  const heading = el('h2', 'page-title');
  const abbr = el('abbr', 'signin-gloss', 'atmo');
  abbr.title = ATMO_GLOSS;
  heading.append('Choose your ', abbr, ' provider');
  const intro = el(
    'p',
    'status signin-intro',
    `arecipe has no accounts of its own. You sign in with an account from an atmo provider — ${ATMO_GLOSS.charAt(0).toLowerCase()}${ATMO_GLOSS.slice(1)}. Bluesky is one of many, and each sets its own rules. Browsing and drafting work without an account.`,
  );
  intro.dataset['testid'] = 'signin-intro';

  // The front page is the providers a newcomer can JOIN from here; invite-only
  // providers are one tap in, below.
  const front = el('div', 'signin-list');
  front.dataset['signinFront'] = '';
  front.append(...featuredProviders().map((p) => providerRow(p, opts.start)));

  // Everything not on the short list reaches the same seam. The list is an
  // editorial convenience, not a boundary — this is what keeps it from being one.
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'signin-handle';
  input.placeholder = 'you.example.com';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.dataset['testid'] = 'handle-input';
  const label = el('label', 'signin-label', 'Your handle on any atmo provider') as HTMLLabelElement;
  label.htmlFor = input.id;
  const form = el('form', 'lookup') as HTMLFormElement;
  const submit = el('button', 'button button--primary', 'Continue') as HTMLButtonElement;
  submit.type = 'submit';
  submit.dataset['testid'] = 'oauth-signin';
  form.append(input, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const handle = input.value.trim().replace(/^@+/, '');
    if (handle === '') {
      opts.status.textContent = 'Enter your handle — for example you.example.com.';
      return;
    }
    opts.start(handle);
  });
  const panel = el('div', 'signin-other');
  panel.dataset['signinOther'] = '';
  panel.hidden = true;
  const invite = el('div', 'signin-list');
  invite.append(...otherProviders().map((p) => providerRow(p, opts.start)));
  panel.append(invite, label, form);
  const other = el('button', 'button signin-more', 'Another provider') as HTMLButtonElement;
  other.type = 'button';
  other.dataset['testid'] = 'provider-other';
  other.addEventListener('click', () => {
    other.hidden = true;
    panel.hidden = false;
    input.focus();
  });
  return [heading, intro, front, other, panel, opts.status];
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
  // (Replaced below on the sign-in branch — the pattern owns its own heading.)

  if (provider === null) {
    // Branch (3): read-only origin (neither loopback nor the hosted origin).
    // No OAuth client can exist here — client_id must match the serving origin
    // — so sign-in is structurally impossible. A terminal, honest note (do not
    // point at another page: there is nowhere here that can sign you in).
    const note = el('p', 'empty-state', 'Sign-in isn’t available on this copy of the app.');
    note.dataset['testid'] = 'signin-unavailable';
    content.append(note);
  } else {
    // Branch (2): signed out with a live OAuth client — the workspace sign-in
    // pattern (croft-pwa/docs/DESIGN.md § Flows › Sign in), in a PAGE: the
    // heading, the gloss and its visible sentence, open providers with Create +
    // Sign in, invite-only providers and the handle field behind "Another
    // provider". One seam for every choice: provider.signIn(target, options).
    const status = el('p', 'status');
    status.dataset['testid'] = 'signin-status';
    const start = (target: string, options?: SignInOptions): void => {
      status.textContent = 'redirecting to sign-in…';
      // Resolves only on failure/abort — success navigates away to the provider.
      // provider.signIn logs 'sign-in initiated'; this page-level catch is the
      // failure surface (error level → emits without ?debug=1).
      void provider.signIn(target, options).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error('auth', 'sign-in failed', { error: message });
        status.textContent = `sign-in failed: ${message}`;
      });
    };
    content.dataset['signinPage'] = '';
    content.replaceChildren(...signInPattern({ start, status }));
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
