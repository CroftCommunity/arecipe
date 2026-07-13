// The advanced, collapsed "Publish a subscribable calendar" section on the
// account page (plan P5). Off by default; when enabled it reveals the
// device-local config (repo, path), a WRITE-ONLY token field (+ the opt-in
// "remember on this device" toggle, D1), a "Publish now" action, and links to
// the setup guide + GitHub revoke page. Every control carries a data-testid.
//
// The token is never rendered back — the field only ever writes via
// token.set(); its presence shows as a status line ("token set ✓").

import { log } from '../log.js';
import type { LocalPlan } from '../recipes/meal-plan-local.js';
import type { CalendarClient } from './client.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const labelledInput = (
  labelText: string,
  testid: string,
  opts: { type?: string; placeholder?: string; value?: string } = {},
): { wrap: HTMLElement; input: HTMLInputElement } => {
  const wrap = el('label', 'calendar-field');
  wrap.append(el('span', 'calendar-field-label', labelText));
  const input = document.createElement('input');
  input.type = opts.type ?? 'text';
  if (opts.placeholder !== undefined) input.placeholder = opts.placeholder;
  if (opts.value !== undefined) input.value = opts.value;
  input.dataset['testid'] = testid;
  wrap.append(input);
  return { wrap, input };
};

/** Build the section. `listPublishedPlans` resolves the account's published
 * meal plans (the calendar is their union); injected so the caller owns PDS
 * resolution. */
export const renderCalendarPublishSection = (
  client: CalendarClient,
  listPublishedPlans: () => Promise<LocalPlan[]>,
): HTMLElement => {
  const details = document.createElement('details');
  details.className = 'settings-section calendar-publish';
  details.dataset['testid'] = 'calendar-publish';

  const summary = document.createElement('summary');
  summary.textContent = 'Publish a subscribable calendar (advanced)';
  details.append(summary);

  const intro = el('p', 'status');
  const introGuide = el('a', 'friend-link', 'setup guide') as HTMLAnchorElement;
  introGuide.href = './calendar-setup.html';
  introGuide.dataset['testid'] = 'calendar-guide-link-intro';
  intro.append(
    document.createTextNode(
      'Push your published meal plans to a calendar file on your own GitHub Pages, so a calendar app (e.g. Google Calendar) can subscribe to it and update as you republish. This device only — your token stays in this browser and is never shared or synced. This has real security tradeoffs; read the ',
    ),
    introGuide,
    document.createTextNode(' first.'),
  );
  details.append(intro);

  const cfg = client.config.load();

  // Enable toggle.
  const enableLabel = el('label', 'calendar-enable');
  const enable = document.createElement('input');
  enable.type = 'checkbox';
  enable.checked = cfg.enabled;
  enable.dataset['testid'] = 'calendar-enabled';
  enableLabel.append(enable, document.createTextNode(' Enable on this device'));
  details.append(enableLabel);

  // Config body (shown only when enabled).
  const body = el('div', 'calendar-config');
  body.dataset['testid'] = 'calendar-config';

  const repo = labelledInput('Repository (owner/repo)', 'calendar-repo', {
    placeholder: 'me/meals-calendar',
    value: cfg.repo,
  });
  const path = labelledInput('File path', 'calendar-path', { value: cfg.path });
  body.append(repo.wrap, path.wrap);

  // Token: write-only field + status.
  const token = labelledInput('GitHub token (fine-grained PAT)', 'calendar-token', {
    type: 'password',
    placeholder: 'github_pat_…',
  });
  const tokenStatus = el('span', 'calendar-token-status', 'checking…');
  tokenStatus.dataset['testid'] = 'calendar-token-status';
  const rememberLabel = el('label', 'calendar-remember');
  const remember = document.createElement('input');
  remember.type = 'checkbox';
  remember.dataset['testid'] = 'calendar-remember';
  rememberLabel.append(
    remember,
    document.createTextNode(
      ' Remember on this device (less secure — the token is stored in this browser and readable by scripts on this origin; otherwise it is held only in memory and re-entered after inactivity)',
    ),
  );
  const saveToken = el('button', 'button', 'Save token') as HTMLButtonElement;
  saveToken.type = 'button';
  saveToken.dataset['testid'] = 'calendar-save-token';
  const clearToken = el('button', 'button', 'Clear token') as HTMLButtonElement;
  clearToken.type = 'button';
  clearToken.dataset['testid'] = 'calendar-clear-token';
  body.append(token.wrap, rememberLabel, tokenStatus, saveToken, clearToken);

  // Publish now + status.
  const publishNow = el('button', 'button button--primary', 'Publish now') as HTMLButtonElement;
  publishNow.type = 'button';
  publishNow.dataset['testid'] = 'calendar-publish-now';
  const status = el('span', 'calendar-status');
  status.dataset['testid'] = 'calendar-status';
  body.append(publishNow, status);

  // Links.
  const links = el('p', 'calendar-links');
  const guide = el('a', 'friend-link', 'Setup guide') as HTMLAnchorElement;
  guide.href = './calendar-setup.html';
  guide.dataset['testid'] = 'calendar-guide-link';
  const revoke = el('a', 'friend-link', 'Revoke on GitHub') as HTMLAnchorElement;
  revoke.href = 'https://github.com/settings/tokens';
  revoke.target = '_blank';
  revoke.rel = 'noopener noreferrer';
  links.append(guide, document.createTextNode(' · '), revoke);
  body.append(links);

  details.append(body);

  // --- behavior -------------------------------------------------------------
  const syncEnabledUi = (): void => {
    body.hidden = !enable.checked;
  };
  syncEnabledUi();

  const refreshTokenStatus = (): void => {
    void client.token.hasToken().then((has) => {
      tokenStatus.textContent = has ? 'token set ✓' : 'no token on this device';
    });
  };
  refreshTokenStatus();

  enable.addEventListener('change', () => {
    client.config.save({ enabled: enable.checked });
    syncEnabledUi();
  });
  repo.input.addEventListener('change', () => client.config.save({ repo: repo.input.value.trim() }));
  path.input.addEventListener('change', () => {
    const v = path.input.value.trim();
    client.config.save({ path: v === '' ? 'meals.ics' : v });
  });

  saveToken.addEventListener('click', () => {
    const value = token.input.value.trim();
    if (value === '') {
      status.textContent = 'enter a token first';
      return;
    }
    void client.token.set(value, { remember: remember.checked }).then(() => {
      token.input.value = ''; // write-only: never keep it in the field
      status.textContent = remember.checked ? 'token saved (remembered on this device)' : 'token saved';
      refreshTokenStatus();
    });
  });
  clearToken.addEventListener('click', () => {
    void client.token.clear().then(() => {
      status.textContent = 'token cleared';
      refreshTokenStatus();
    });
  });

  publishNow.addEventListener('click', () => {
    publishNow.disabled = true;
    status.textContent = 'publishing…';
    void client
      .republish(listPublishedPlans)
      .then((res) => {
        status.textContent =
          res.status === 'published'
            ? 'calendar published ✓'
            : res.status === 'needs-token'
              ? 'no token — save one above'
              : res.status === 'skipped'
                ? 'enable + set a repo first'
                : `publish failed: ${res.error}`;
      })
      .catch((err: unknown) => {
        log.error('calendar-publish', 'publish now failed', { error: String(err) });
        status.textContent = 'publish failed';
      })
      .finally(() => {
        publishNow.disabled = false;
      });
  });

  return details;
};
