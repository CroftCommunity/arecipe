// Reusable cook-typeahead UI (Phase 2). Attaches debounced, accessible
// suggestion behavior to an existing <input>, driven by an injected search
// function (defaults to the Phase 1 actor-search). Both mount points — Browse's
// cook-search box and the Meals add-a-cook input — attach this to their existing
// inputs so neither reimplements the interaction.
//
// Accessibility follows the ARIA combobox/listbox pattern: the input is the
// combobox, the dropdown is the listbox, options carry aria-selected, and the
// input's aria-activedescendant points at the active option.

import { createActorSearch, type ActorSuggestion } from './actor-search.js';

export type ActorTypeahead = { destroy: () => void };

export type AttachOptions = {
  input: HTMLInputElement;
  onSelect: (suggestion: ActorSuggestion) => void;
  /** Defaults to createActorSearch(). Injected in tests. */
  search?: (q: string, opts?: { signal?: AbortSignal }) => Promise<ActorSuggestion[]>;
  /** Debounce before a search fires (ms, default 150). */
  debounceMs?: number;
  /** Shortest query that triggers a search (default 2). */
  minChars?: number;
};

let sequence = 0;

export const attachActorTypeahead = (opts: AttachOptions): ActorTypeahead => {
  const { input, onSelect } = opts;
  const search = opts.search ?? createActorSearch();
  const debounceMs = opts.debounceMs ?? 150;
  const minChars = opts.minChars ?? 2;

  const listboxId = `typeahead-${++sequence}`;
  const dropdown = document.createElement('div');
  dropdown.className = 'typeahead';
  dropdown.id = listboxId;
  dropdown.setAttribute('role', 'listbox');
  dropdown.hidden = true;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  input.insertAdjacentElement('afterend', dropdown);

  let suggestions: ActorSuggestion[] = [];
  let activeIndex = -1;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let controller: AbortController | null = null;

  const close = (): void => {
    suggestions = [];
    activeIndex = -1;
    dropdown.replaceChildren();
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const reflectActive = (): void => {
    [...dropdown.children].forEach((child, i) => {
      const active = i === activeIndex;
      child.setAttribute('aria-selected', String(active));
      child.classList.toggle('typeahead-option--active', active);
    });
    if (activeIndex >= 0) input.setAttribute('aria-activedescendant', `${listboxId}-opt-${activeIndex}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const render = (): void => {
    dropdown.replaceChildren();
    if (suggestions.length === 0) {
      close();
      return;
    }
    suggestions.forEach((s, i) => {
      const option = document.createElement('div');
      option.className = 'typeahead-option';
      option.id = `${listboxId}-opt-${i}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      if (s.avatar !== undefined) {
        const img = document.createElement('img');
        img.className = 'typeahead-avatar';
        img.src = s.avatar;
        img.alt = '';
        option.append(img);
      }
      const handle = document.createElement('span');
      handle.className = 'typeahead-handle';
      handle.textContent = `@${s.handle}`;
      option.append(handle);
      if (s.displayName !== undefined) {
        const name = document.createElement('span');
        name.className = 'typeahead-name';
        name.textContent = s.displayName;
        option.append(name);
      }
      // mousedown (not click) so selection fires before the input's blur closes
      // the dropdown; preventDefault keeps focus in the input.
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        select(i);
      });
      dropdown.append(option);
    });
    activeIndex = -1;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', listboxId);
    reflectActive();
  };

  const select = (index: number): void => {
    const chosen = suggestions[index];
    if (chosen === undefined) return;
    input.value = chosen.handle;
    close();
    onSelect(chosen);
  };

  const runSearch = (query: string): void => {
    const gen = ++generation;
    if (controller !== null) controller.abort();
    controller = new AbortController();
    void search(query, { signal: controller.signal })
      .then((results) => {
        if (gen !== generation) return; // superseded by a newer query
        suggestions = results;
        render();
      })
      .catch(() => {
        // search() degrades soft on its own; a rejection here (e.g. abort) just
        // means this generation is stale — nothing to render.
      });
  };

  const onInput = (): void => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q.length < minChars) {
        close();
        return;
      }
      runSearch(q);
    }, debounceMs);
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (dropdown.hidden || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % suggestions.length;
      reflectActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
      reflectActive();
    } else if (event.key === 'Enter') {
      // Only intercept Enter when an option is active; otherwise let the form's
      // own submit proceed (typing a full handle + Enter must still work).
      if (activeIndex >= 0) {
        event.preventDefault();
        select(activeIndex);
      }
    } else if (event.key === 'Escape') {
      close();
    }
  };

  const onDocMousedown = (event: MouseEvent): void => {
    const target = event.target as Node | null;
    if (target !== null && (input.contains(target) || dropdown.contains(target))) return;
    close();
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  document.addEventListener('mousedown', onDocMousedown);

  return {
    destroy: (): void => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (controller !== null) controller.abort();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeydown);
      document.removeEventListener('mousedown', onDocMousedown);
      dropdown.remove();
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-activedescendant');
      input.removeAttribute('aria-controls');
    },
  };
};
