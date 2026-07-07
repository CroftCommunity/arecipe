// Recipe cards + expanding detail (UI skeleton). Cards carry the two chips
// that matter: total time and the provenance stamp — the CID-verification
// verdict rendered like a rubber stamp, arecipe's signature element. An
// open card expands across the grid into the ingredients-first detail.

import type { CachedRecipe } from './cache.js';
import { firstImageCid, formatDuration, thumbUrl } from './present.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const listEl = (tag: 'ul' | 'ol', testid: string, items: string[]): HTMLElement => {
  const list = el(tag);
  list.dataset['testid'] = testid;
  for (const item of items) list.append(el('li', undefined, item));
  return list;
};

// The stamp must explain itself — "verified" is meaningless until it does.
// Clicking it toggles a plain-language note (user-side words, no jargon).
const STAMP_NOTES = {
  verified:
    "Verified: this recipe matches the fingerprint it was published with — it hasn't been altered since the author saved it.",
  unverified:
    'Unverified: the recipe content did not match its published fingerprint. It may have been altered — treat with care.',
} as const;

const stampEl = (verified: boolean, note: HTMLElement): HTMLElement => {
  const stamp = el('button', 'stamp', verified ? '✓ VERIFIED' : 'UNVERIFIED');
  (stamp as HTMLButtonElement).type = 'button';
  stamp.setAttribute('data-verified', String(verified));
  stamp.setAttribute('aria-expanded', 'false');
  note.textContent = verified ? STAMP_NOTES.verified : STAMP_NOTES.unverified;
  stamp.addEventListener('click', (event) => {
    // Inside a <summary>: don't let the click also toggle the card.
    event.preventDefault();
    event.stopPropagation();
    note.hidden = !note.hidden;
    stamp.setAttribute('aria-expanded', String(!note.hidden));
  });
  return stamp;
};

const renderRecipe = (entry: CachedRecipe): HTMLElement => {
  const value = entry.value as {
    name?: string;
    text?: string;
    ingredients?: string[];
    instructions?: string[];
    totalTime?: string;
    recipeYield?: string;
  };
  const did = entry.uri.split('/')[2] ?? '';

  const item = el('details', 'card');
  item.dataset['testid'] = 'recipe-item';

  const summary = el('summary', 'card-face');
  const cid = firstImageCid(entry.value);
  if (cid !== null && did !== '') {
    const photo = document.createElement('img');
    photo.className = 'card-photo';
    photo.src = thumbUrl(did, cid);
    photo.alt = '';
    photo.loading = 'lazy';
    summary.append(photo);
  } else {
    summary.append(el('div', 'card-photo card-photo--empty', '🍲'));
  }
  summary.append(el('span', 'card-title', value.name ?? '(untitled)'));
  const chips = el('span', 'chips');
  const time = formatDuration(value.totalTime);
  if (time !== null) chips.append(el('span', 'chip', time));
  const stampNote = el('p', 'stamp-note');
  stampNote.dataset['testid'] = 'stamp-note';
  stampNote.hidden = true;
  chips.append(stampEl(entry.verified, stampNote));
  summary.append(chips, stampNote);
  item.append(summary);

  const detail = el('div', 'card-detail');
  if (value.text !== undefined && value.text !== '') {
    detail.append(el('p', 'lede', value.text));
  }
  const cols = el('div', 'detail-cols');
  const ingredients = el('section');
  ingredients.append(el('h3', undefined, 'Ingredients'));
  ingredients.append(listEl('ul', 'recipe-ingredients', value.ingredients ?? []));
  const instructions = el('section');
  instructions.append(el('h3', undefined, 'Instructions'));
  instructions.append(listEl('ol', 'recipe-instructions', value.instructions ?? []));
  cols.append(ingredients, instructions);
  detail.append(cols);
  item.append(detail);
  return item;
};

/** Render cached recipes as a card grid with in-place expanding detail. */
export const renderRecipeList = (entries: CachedRecipe[]): HTMLElement => {
  const container = el('section', 'recipe-grid');
  container.dataset['testid'] = 'recipe-list';
  for (const entry of entries) container.append(renderRecipe(entry));
  return container;
};
