// Recipe cards + expanding detail. Trust surface (design iteration 3):
// SILENT WHEN GOOD, LOUD WHEN BAD — the browser-padlock lesson. Intact
// records carry no badge; the opened detail ends with one human provenance
// line ("as published by <author> · fingerprint matches · <date>"). A record
// whose content does NOT match its published fingerprint gets the rubber
// stamp for real: a rust ALTERED? across the photo and an always-visible
// warning. That stamp is the signature element — it appears exactly when it
// matters and never as wallpaper.

import type { CachedRecipe } from './cache.js';
import { firstImageCid, formatDuration, formatPublishedDate, thumbUrl } from './present.js';

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

export type RenderOptions = {
  /** Human label for whose recipes these are (the handle the user typed). */
  author?: string;
};

const renderRecipe = (entry: CachedRecipe, options: RenderOptions): HTMLElement => {
  const value = entry.value as {
    name?: string;
    text?: string;
    ingredients?: string[];
    instructions?: string[];
    totalTime?: string;
    updatedAt?: string;
  };
  const did = entry.uri.split('/')[2] ?? '';

  const item = el('details', 'card');
  item.dataset['testid'] = 'recipe-item';

  const summary = el('summary', 'card-face');
  const photoWrap = el('div', 'photo-wrap');
  const cid = firstImageCid(entry.value);
  if (cid !== null && did !== '') {
    const photo = document.createElement('img');
    photo.className = 'card-photo';
    photo.src = thumbUrl(did, cid);
    photo.alt = '';
    photo.loading = 'lazy';
    photoWrap.append(photo);
  } else {
    photoWrap.append(el('div', 'card-photo card-photo--empty', '🍲'));
  }
  if (!entry.verified) {
    photoWrap.append(el('span', 'altered-stamp', 'ALTERED?'));
  }
  summary.append(photoWrap);
  summary.append(el('span', 'card-title', value.name ?? '(untitled)'));
  const time = formatDuration(value.totalTime);
  if (time !== null) {
    const chips = el('span', 'chips');
    chips.append(el('span', 'chip', time));
    summary.append(chips);
  }
  if (!entry.verified) {
    const warning = el(
      'p',
      'altered-warning',
      "⚠ This copy doesn't match what the author published — treat with care.",
    );
    warning.dataset['testid'] = 'altered-warning';
    summary.append(warning);
  }
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

  if (entry.verified) {
    const author = options.author ?? did;
    const date = formatPublishedDate(value.updatedAt);
    const provenance = el(
      'p',
      'provenance',
      `as published by ${author} · fingerprint matches${date === null ? '' : ` · ${date}`}`,
    );
    provenance.dataset['testid'] = 'provenance';
    provenance.title =
      'The recipe content re-hashes to the exact fingerprint it was published under — nothing altered it in storage or transit.';
    detail.append(provenance);
  }
  item.append(detail);
  return item;
};

/** Render cached recipes as a card grid with in-place expanding detail. */
export const renderRecipeList = (
  entries: CachedRecipe[],
  options: RenderOptions = {},
): HTMLElement => {
  const container = el('section', 'recipe-grid');
  container.dataset['testid'] = 'recipe-list';
  for (const entry of entries) container.append(renderRecipe(entry, options));
  return container;
};
