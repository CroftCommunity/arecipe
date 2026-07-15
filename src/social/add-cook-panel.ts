// Shared "add a cook" panel (D7/D8): a handle input with the cook typeahead
// attached + a submit button, emitting the chosen handle to `onSubmit`. Both
// surfaces reuse it so the actor typeahead isn't reimplemented per page:
//   - Browse's toolbar `+ Cook` panel → onSubmit runs a PREVIEW (runFind).
//   - Account's members panel → onSubmit resolves + follows the cook.
// Zero auth imports (typeahead + actor-search only), so it is safe in the Browse
// bundle-split. The caller owns the follow/preview semantics; this panel only
// collects a handle.

import { attachActorTypeahead, type ActorTypeahead } from '../identity/actor-typeahead.js';
import type { ActorSuggestion } from '../identity/actor-search.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export type AddCookPanel = {
  element: HTMLElement;
  input: HTMLInputElement;
  /** Set the panel's status/hint line (e.g. "following…", an error). */
  setStatus: (text: string) => void;
  /** Clear the input (after a successful add). */
  clear: () => void;
  destroy: () => void;
};

export const renderAddCookPanel = (opts: {
  /** Receives the submitted/selected handle (trimmed). */
  onSubmit: (handle: string) => void;
  placeholder?: string;
  buttonLabel?: string;
  testidPrefix?: string;
  /** Injected search for the typeahead (tests). */
  search?: (q: string, o?: { signal?: AbortSignal }) => Promise<ActorSuggestion[]>;
}): AddCookPanel => {
  const prefix = opts.testidPrefix ?? 'add-cook';
  const panel = el('div', 'add-cook-panel');
  panel.dataset['testid'] = `${prefix}-panel`;

  const form = el('form', 'add-cook-form') as HTMLFormElement;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-cook-input';
  input.placeholder = opts.placeholder ?? 'a cook’s handle — try rdur.dev';
  input.dataset['testid'] = `${prefix}-input`;
  input.setAttribute('aria-label', 'Add a cook by handle');

  const button = el('button', 'button button--primary add-cook-submit', opts.buttonLabel ?? 'Add') as HTMLButtonElement;
  button.type = 'submit';
  button.dataset['testid'] = `${prefix}-submit`;

  const status = el('p', 'status add-cook-status');
  status.dataset['testid'] = `${prefix}-status`;

  form.append(input, button);
  panel.append(form, status);

  const submit = (handle: string): void => {
    const trimmed = handle.trim();
    if (trimmed === '') return;
    opts.onSubmit(trimmed);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input.value);
  });

  const typeahead: ActorTypeahead = attachActorTypeahead({
    input,
    ...(opts.search !== undefined ? { search: opts.search } : {}),
    onSelect: (suggestion) => {
      input.value = suggestion.handle;
      submit(suggestion.handle);
    },
  });

  return {
    element: panel,
    input,
    setStatus: (text) => {
      status.textContent = text;
    },
    clear: () => {
      input.value = '';
    },
    destroy: () => typeahead.destroy(),
  };
};
