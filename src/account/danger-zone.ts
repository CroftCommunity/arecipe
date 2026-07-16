// Account danger zone (plan 2026-07-16-5): the bubble at the foot of the
// Account page holding Sign out (inline two-step confirm — the meals-reset
// idiom) and, below it, "Delete all arecipe data" (GitHub-style type-the-
// handle challenge + a hard window.confirm in the owner's exact words).
// All effects are injected so the flow is unit-testable; account.ts wires
// the real signOut/wipe/window pieces.

import { log } from '../log.js';

/** The owner's copy, honored: what goes and what stays. */
export const DELETE_COPY =
  'This deletes all local cache and settings and all app.arecipe entries in your PDS. It does not delete exchange.recipe entries.';

/** The hard browser confirm, in the owner's exact words. OK = confirm,
 * Cancel = decline. */
export const HARD_CONFIRM_MESSAGE =
  'Seriously, this permanently deleted all your data for arecipe';

export type DangerZoneDeps = {
  /** Revoke the session (provider.signOut on the page). */
  signOut: () => Promise<void>;
  /** The exact text the delete challenge requires: the resolved bsky handle,
   * or the DID while the handle is still unresolved (never a free pass). */
  confirmText: () => string;
  /** Delete every app.arecipe.* record in the PDS (wipe.ts, D1/D3). */
  wipePds: (onProgress: (message: string) => void) => Promise<number>;
  /** Clear this device's cache + settings (wipe.ts). */
  wipeLocal: () => Promise<void>;
  /** The hard browser confirm; window.confirm in production. */
  hardConfirm?: (message: string) => boolean;
  reload?: () => void;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Trim + drop one leading '@' — 'handle' and '@handle' both count. */
const normalized = (typed: string): string => typed.trim().replace(/^@/, '');

export const renderDangerZone = (deps: DangerZoneDeps): HTMLElement => {
  const hardConfirm = deps.hardConfirm ?? ((message: string) => window.confirm(message));
  const reload = deps.reload ?? ((): void => window.location.reload());

  const section = el('section', 'settings-section account-danger');
  section.dataset['testid'] = 'account-danger';

  // --- Sign out: the meals-reset two-step confirm, no native dialog. -------
  const signOutRow = el('div', 'signout-row');
  const renderSignOutControl = (): void => {
    signOutRow.replaceChildren();
    const signOut = el('button', 'button sign-out-btn', 'Sign out') as HTMLButtonElement;
    signOut.type = 'button';
    signOut.dataset['testid'] = 'sign-out';
    signOut.addEventListener('click', () => {
      signOutRow.replaceChildren();
      const note = el('span', 'reset-confirm-note', 'Sign out? ');
      const confirm = el('button', 'button', 'Confirm') as HTMLButtonElement;
      confirm.type = 'button';
      confirm.dataset['testid'] = 'sign-out-confirm';
      confirm.addEventListener('click', () => {
        void deps
          .signOut()
          .then(() => reload())
          .catch((err: unknown) => {
            log.error('account', 'sign-out failed', { error: String(err) });
            renderSignOutControl();
          });
      });
      const cancel = el('button', 'button', 'Cancel') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.dataset['testid'] = 'sign-out-cancel';
      cancel.addEventListener('click', () => renderSignOutControl());
      signOutRow.append(note, confirm, cancel);
    });
    signOutRow.append(signOut);
  };
  renderSignOutControl();
  section.append(signOutRow);

  // --- Delete all arecipe data: copy (honored) + challenge + hard confirm. --
  const deleteBlock = el('div', 'delete-block');
  const copy = el('p', 'status danger-copy', DELETE_COPY);
  copy.dataset['testid'] = 'delete-data-copy';
  deleteBlock.append(copy);

  const controls = el('div', 'delete-controls');
  const status = el('p', 'status delete-data-status');
  status.dataset['testid'] = 'delete-data-status';

  const renderDeleteResting = (): void => {
    status.textContent = '';
    controls.replaceChildren();
    const open = el('button', 'button delete-data-btn', 'Delete all arecipe data') as HTMLButtonElement;
    open.type = 'button';
    open.dataset['testid'] = 'delete-data';
    open.addEventListener('click', () => renderDeleteChallenge());
    controls.append(open);
  };

  const renderDeleteChallenge = (): void => {
    controls.replaceChildren();
    const required = deps.confirmText();

    const challenge = el('label', 'delete-confirm-label');
    challenge.dataset['testid'] = 'delete-data-challenge';
    const prompt = el('span', 'delete-confirm-prompt');
    prompt.append(
      document.createTextNode('Type '),
      el('strong', undefined, required),
      document.createTextNode(' to confirm:'),
    );
    challenge.append(prompt);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'delete-confirm-input';
    input.dataset['testid'] = 'delete-data-input';
    input.placeholder = required;
    input.autocomplete = 'off';
    input.spellcheck = false;
    challenge.append(input);

    const confirm = el('button', 'button delete-data-btn', 'Permanently delete') as HTMLButtonElement;
    confirm.type = 'button';
    confirm.dataset['testid'] = 'delete-data-confirm';
    confirm.disabled = true;
    input.addEventListener('input', () => {
      confirm.disabled = normalized(input.value) !== required;
    });

    const cancel = el('button', 'button', 'Cancel') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.dataset['testid'] = 'delete-data-cancel';
    cancel.addEventListener('click', () => renderDeleteResting());

    confirm.addEventListener('click', () => {
      if (confirm.disabled) return;
      if (!hardConfirm(HARD_CONFIRM_MESSAGE)) return; // declined — nothing touched
      confirm.disabled = true;
      cancel.disabled = true;
      input.disabled = true;
      status.textContent = 'Deleting…';
      // PDS first, local second (D3): a PDS failure leaves this device's
      // settings intact for a retry, and the failure reports loud below.
      void (async () => {
        const count = await deps.wipePds((message) => {
          status.textContent = message;
        });
        await deps.wipeLocal();
        log.info('account', 'all arecipe data deleted', { records: count });
        status.textContent = 'All arecipe data deleted — reloading…';
        reload();
      })().catch((err: unknown) => {
        log.error('account', 'delete-all failed', { error: String(err) });
        status.textContent = `Delete failed: ${String(err)} — some data may already be gone; try again.`;
        confirm.disabled = normalized(input.value) !== required;
        cancel.disabled = false;
        input.disabled = false;
      });
    });

    const actions = el('div', 'delete-confirm-actions');
    actions.append(confirm, cancel);
    controls.append(challenge, actions);
  };

  renderDeleteResting();
  deleteBlock.append(controls, status);
  section.append(deleteBlock);
  return section;
};
