// Recipe views (5d): the list renders LINK CARDS to recipe.html — real
// pages with shareable URLs and native back, no in-place expansion. The
// detail renders the full recipe. Trust surface on both: silent when good,
// loud when bad — intact records carry no badge (quiet provenance line at
// the end of the detail); a failed integrity check gets the rust ALTERED?
// rubber stamp + always-visible warning wherever the recipe appears.

import { recipeFacets } from '../pages/browse-state.js';
import type { CachedRecipe } from './cache.js';
import { firstImageCid, firstImageCredit, formatDuration, formatPublishedDate, thumbUrl } from './present.js';

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
  attribution?: { $type?: string; name?: string; url?: string; notes?: string };
};

/** Off-network credit (attribution union): rendered whenever the recipe's
 * author isn't (just) the PDS owner — name, linked when a URL exists.
 * `attributionOriginal` means "my own recipe": no credit line. */
const attributionEl = (value: RecipeValue): HTMLElement | null => {
  const attribution = value.attribution;
  if (attribution === undefined) return null;
  if (attribution.$type?.endsWith('#attributionOriginal') === true) return null;
  if (attribution.name === undefined || attribution.name === '') return null;
  const credit = el('p', 'attribution');
  credit.dataset['testid'] = 'attribution';
  if (attribution.notes !== undefined) credit.title = attribution.notes;
  credit.append(document.createTextNode('credit: '));
  if (attribution.url !== undefined && attribution.url !== '') {
    const link = el('a', 'attribution-link', attribution.name) as HTMLAnchorElement;
    link.href = attribution.url;
    link.rel = 'noopener';
    credit.append(link);
  } else {
    credit.append(document.createTextNode(attribution.name));
  }
  return credit;
};

const placeholderEl = (): HTMLElement => {
  const placeholder = el('div', 'card-photo card-photo--empty');
  for (const variant of ['light', 'dark'] as const) {
    const mark = document.createElement('img');
    mark.className = `placeholder-mark logo--${variant}`;
    mark.src = `./assets/logo-${variant}.png`;
    mark.alt = '';
    placeholder.append(mark);
  }
  return placeholder;
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
    // A failed fetch (fresh blob not on the CDN yet, host down) degrades to
    // the brand placeholder — never a broken-image glyph.
    photo.addEventListener('error', () => {
      photo.replaceWith(placeholderEl());
    });
    photoWrap.append(photo);
  } else {
    // Brand-mark placeholder (theme pair, CSS picks) — never a bare emoji.
    photoWrap.append(placeholderEl());
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

/** Normalized image credit for rendering: a "unknown"/empty artist drops out,
 * and the whole thing is null unless there's at least a license or an artist. */
const creditParts = (
  value: RecipeValue,
): { artist: string; license: string; source: string } | null => {
  const c = firstImageCredit(value as Record<string, unknown>);
  if (c === null) return null;
  const license = typeof c.license === 'string' ? c.license : '';
  const rawArtist = typeof c.artist === 'string' ? c.artist : '';
  const artist = rawArtist === 'unknown' ? '' : rawArtist;
  if (license === '' && artist === '') return null;
  return { artist, license, source: typeof c.source === 'string' ? c.source : '' };
};

/** Credit overlaid at the bottom of an image. On the detail banner the artist
 * links to the Commons source (keeping CC BY / BY-SA attribution with the
 * photo); on cards it's text-only, since the card itself is a link and nesting
 * anchors is invalid. Same visual treatment (.photo-credit) either way. */
const imageCreditOverlay = (
  value: RecipeValue,
  opts: { withLink: boolean; testid: string },
): HTMLElement | null => {
  const c = creditParts(value);
  if (c === null) return null;
  const wrap = el('span', 'photo-credit');
  wrap.dataset['testid'] = opts.testid;
  const label = c.artist !== '' ? c.artist : c.license;
  if (opts.withLink && c.source !== '') {
    const link = el('a', 'photo-credit-link', label) as HTMLAnchorElement;
    link.href = c.source;
    link.rel = 'noopener';
    link.target = '_blank';
    wrap.append(link);
  } else {
    wrap.append(document.createTextNode(label));
  }
  if (c.artist !== '' && c.license !== '') wrap.append(document.createTextNode(` · ${c.license}`));
  return wrap;
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
  const photoWrap = photoWrapEl(entry);
  const cardCredit = imageCreditOverlay(value, { withLink: false, testid: 'card-credit' });
  if (cardCredit !== null) photoWrap.append(cardCredit);
  card.append(photoWrap);
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

/** Small label chips from a recipe's facets (category, cuisine, diet). Diet
 * tokens drop the `diet` prefix for readability (dietVegetarian → Vegetarian). */
const facetChipsEl = (value: RecipeValue): HTMLElement | null => {
  const facets = recipeFacets(value as Record<string, unknown>);
  const labels: string[] = [];
  if (facets.category !== null) labels.push(facets.category);
  if (facets.cuisine !== null) labels.push(facets.cuisine);
  for (const token of facets.diet) labels.push(token.replace(/^diet/, ''));
  if (labels.length === 0) return null;
  const chips = el('span', 'recipe-row-chips');
  for (const label of labels) chips.append(el('span', 'chip', label));
  return chips;
};

/** One Details-view row: the row IS the link (no nested anchors), thumb left,
 * name + description + label chips right. Same trust surface as a card. */
const renderRow = (entry: CachedRecipe, options: RenderOptions): HTMLElement => {
  const value = entry.value as RecipeValue;
  const row = el('a', 'recipe-row') as HTMLAnchorElement;
  row.dataset['testid'] = 'recipe-item'; // same testid as cards: view-agnostic counts
  row.href = recipePageHref(entry, options);
  const thumb = photoWrapEl(entry);
  thumb.classList.add('recipe-row-thumb');
  const body = el('div', 'recipe-row-body');
  body.append(el('span', 'card-title', value.name ?? '(untitled)'));
  if (value.text !== undefined && value.text !== '') {
    body.append(el('p', 'recipe-row-text', value.text));
  }
  const chips = facetChipsEl(value);
  if (chips !== null) body.append(chips);
  row.append(thumb, body);
  if (!entry.verified) row.append(alteredWarningEl());
  return row;
};

/** Render cached recipes as a vertical list of link rows (Details view). */
export const renderRecipeDetailsList = (
  entries: CachedRecipe[],
  options: RenderOptions = {},
): HTMLElement => {
  const container = el('section', 'recipe-rows');
  container.dataset['testid'] = 'recipe-list';
  for (const entry of entries) container.append(renderRow(entry, options));
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
  const photoCredit = imageCreditOverlay(value, { withLink: true, testid: 'photo-credit' });
  if (photoCredit !== null) banner.append(photoCredit);
  article.append(banner);
  article.append(el('h2', 'recipe-title', value.name ?? '(untitled)'));
  const chips = chipsEl(value);
  if (chips !== null) article.append(chips);
  if (!entry.verified) article.append(alteredWarningEl());
  if (value.text !== undefined && value.text !== '') {
    article.append(el('p', 'lede', value.text));
  }
  const credit = attributionEl(value);
  if (credit !== null) article.append(credit);

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
