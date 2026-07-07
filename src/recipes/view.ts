// Recipe views (5d): the list renders LINK CARDS to recipe.html — real
// pages with shareable URLs and native back, no in-place expansion. The
// detail renders the full recipe. Trust surface on both: silent when good,
// loud when bad — intact records carry no badge (quiet provenance line at
// the end of the detail); a failed integrity check gets the rust ALTERED?
// rubber stamp + always-visible warning wherever the recipe appears.

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

type RecipeValue = {
  name?: string;
  text?: string;
  ingredients?: string[];
  instructions?: string[];
  totalTime?: string;
  updatedAt?: string;
};

const photoWrapEl = (entry: CachedRecipe): HTMLElement => {
  const did = entry.uri.split('/')[2] ?? '';
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
  return photoWrap;
};

const alteredWarningEl = (): HTMLElement => {
  const warning = el(
    'p',
    'altered-warning',
    "⚠ This copy doesn't match what the author published — treat with care.",
  );
  warning.dataset['testid'] = 'altered-warning';
  return warning;
};

const chipsEl = (value: RecipeValue): HTMLElement | null => {
  const time = formatDuration(value.totalTime);
  if (time === null) return null;
  const chips = el('span', 'chips');
  chips.append(el('span', 'chip', time));
  return chips;
};

export type RenderOptions = {
  /** Human label for whose recipes these are (the handle the user typed). */
  author?: string;
  /** Mixed-author grids (starter feed): per-card author by DID. */
  authorsByDid?: Record<string, string>;
};

const recipePageHref = (entry: CachedRecipe, options: RenderOptions): string => {
  const did = entry.uri.split('/')[2] ?? '';
  const author = options.authorsByDid?.[did] ?? options.author;
  const by = author === undefined ? '' : `&by=${encodeURIComponent(author)}`;
  return `./recipe.html?u=${encodeURIComponent(entry.uri)}${by}`;
};

const renderCard = (entry: CachedRecipe, options: RenderOptions): HTMLElement => {
  const value = entry.value as RecipeValue;
  const card = el('a', 'card') as HTMLAnchorElement;
  card.dataset['testid'] = 'recipe-item';
  card.href = recipePageHref(entry, options);
  card.append(photoWrapEl(entry));
  card.append(el('span', 'card-title', value.name ?? '(untitled)'));
  const chips = chipsEl(value);
  if (chips !== null) card.append(chips);
  if (!entry.verified) card.append(alteredWarningEl());
  return card;
};

/** Render cached recipes as a grid of link cards (each opens its own page). */
export const renderRecipeList = (
  entries: CachedRecipe[],
  options: RenderOptions = {},
): HTMLElement => {
  const container = el('section', 'recipe-grid');
  container.dataset['testid'] = 'recipe-list';
  for (const entry of entries) container.append(renderCard(entry, options));
  return container;
};

/** Render one recipe in full: banner, title, chips, ingredients-first detail. */
export const renderRecipeDetail = (
  entry: CachedRecipe,
  options: RenderOptions = {},
): HTMLElement => {
  const value = entry.value as RecipeValue;
  const did = entry.uri.split('/')[2] ?? '';
  const article = el('article', 'recipe-detail');

  const banner = photoWrapEl(entry);
  banner.classList.add('photo-wrap--banner');
  article.append(banner);
  article.append(el('h2', 'recipe-title', value.name ?? '(untitled)'));
  const chips = chipsEl(value);
  if (chips !== null) article.append(chips);
  if (!entry.verified) article.append(alteredWarningEl());
  if (value.text !== undefined && value.text !== '') {
    article.append(el('p', 'lede', value.text));
  }

  const cols = el('div', 'detail-cols');
  const ingredients = el('section');
  ingredients.append(el('h3', undefined, 'Ingredients'));
  ingredients.append(listEl('ul', 'recipe-ingredients', value.ingredients ?? []));
  const instructions = el('section');
  instructions.append(el('h3', undefined, 'Instructions'));
  instructions.append(listEl('ol', 'recipe-instructions', value.instructions ?? []));
  cols.append(ingredients, instructions);
  article.append(cols);

  if (entry.verified) {
    const author = options.authorsByDid?.[did] ?? options.author ?? did;
    const date = formatPublishedDate(value.updatedAt);
    const provenance = el('p', 'provenance');
    provenance.dataset['testid'] = 'provenance';
    provenance.title =
      'The recipe content re-hashes to the exact fingerprint it was published under — nothing altered it in storage or transit.';
    const authorLink = el('a', 'provenance-author', author) as HTMLAnchorElement;
    authorLink.href = `https://bsky.app/profile/${encodeURIComponent(author)}`;
    authorLink.rel = 'noopener';
    provenance.append(
      document.createTextNode('as published by '),
      authorLink,
      document.createTextNode(` · fingerprint matches${date === null ? '' : ` · ${date}`}`),
    );
    article.append(provenance);
  }
  return article;
};
