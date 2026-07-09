// Recipe views (5d): the list renders LINK CARDS to recipe.html — real
// pages with shareable URLs and native back, no in-place expansion. The
// detail renders the full recipe. Trust surface on both: silent when good,
// loud when bad — intact records carry no badge (quiet provenance line at
// the end of the detail); a failed integrity check gets the rust ALTERED?
// rubber stamp + always-visible warning wherever the recipe appears.

import { recipeFacets } from '../pages/browse-state.js';
import type { CachedRecipe } from './cache.js';
import { dishKeyOf, funFactsOf, versionLabelOf, type FunFact } from './model.js';
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

/** "Did you know?" cycler over a dish's pooled fun facts. Returns null when
 *  there are none, so callers append unconditionally. A single fact shows no
 *  navigation; multiple facts get a next button + "i / n" counter that advances
 *  (wrapping) in place. Render-only; pooling/discovery happens upstream. */
export const renderFunFacts = (facts: FunFact[]): HTMLElement | null => {
  if (facts.length === 0) return null;
  const section = el('section', 'fun-facts');
  section.dataset['testid'] = 'fun-facts';
  section.append(el('h3', 'fun-facts-heading', 'Did you know?'));
  const body = el('div', 'fun-fact-body');
  section.append(body);

  let countEl: HTMLElement | undefined;
  let index = 0;
  const paint = (): void => {
    const fact = facts[index];
    if (fact === undefined) return;
    body.replaceChildren();
    const text = el('p', 'fun-fact-text', fact.text);
    text.dataset['testid'] = 'fun-fact-text';
    body.append(text);
    if (fact.source !== undefined && fact.source !== '') {
      const source = el('span', 'fun-fact-source', `— ${fact.source}`);
      source.dataset['testid'] = 'fun-fact-source';
      body.append(source);
    }
    if (countEl !== undefined) countEl.textContent = `${index + 1} / ${facts.length}`;
  };

  if (facts.length > 1) {
    const nav = el('div', 'fun-fact-nav');
    countEl = el('span', 'fun-fact-count');
    countEl.dataset['testid'] = 'fun-fact-count';
    const next = el('button', 'fun-fact-next', 'Next') as HTMLButtonElement;
    next.type = 'button';
    next.dataset['testid'] = 'fun-fact-next';
    next.addEventListener('click', () => {
      index = (index + 1) % facts.length;
      paint();
    });
    nav.append(countEl, next);
    section.append(nav);
  }

  paint();
  return section;
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
  // Themed "no meal image" standin (butterfly-spatula), a light/dark pair like
  // the wordmark logo — CSS shows the variant that suits the current theme.
  for (const variant of ['light', 'dark'] as const) {
    const mark = document.createElement('img');
    mark.className = `placeholder-mark logo--${variant}`;
    mark.src = `./assets/no-meal-${variant}.png`;
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
  /** Recipe detail only: when set, render a ⛶ Focus button wired to this. */
  onFocus?: () => void;
  /** Browse only: representative uri → version count. A count > 1 turns the card
   *  into a "N versions" badge linking to the dish's compare grid. */
  versionCounts?: Record<string, number>;
  /** Gate for the fun-fact cycler (Settings "Include fun facts"). Default: show. */
  showFunFacts?: boolean;
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
  // A collapsed multi-version dish links to its compare grid; a single recipe
  // links to its own page.
  const did = entry.uri.split('/')[2] ?? '';
  const versionCount = options.versionCounts?.[entry.uri] ?? 1;
  const dishKey = dishKeyOf(value);
  if (versionCount > 1 && dishKey !== undefined) {
    const author = options.authorsByDid?.[did] ?? options.author;
    const by = author === undefined ? '' : `&by=${encodeURIComponent(author)}`;
    card.href = `./dish.html?key=${encodeURIComponent(dishKey)}&did=${encodeURIComponent(did)}${by}`;
  } else {
    card.href = recipePageHref(entry, options);
  }
  const photoWrap = photoWrapEl(entry);
  const cardCredit = imageCreditOverlay(value, { withLink: false, testid: 'card-credit' });
  if (cardCredit !== null) photoWrap.append(cardCredit);
  card.append(photoWrap);
  card.append(el('span', 'card-title', value.name ?? '(untitled)'));
  if (versionCount > 1) {
    const badge = el('span', 'version-badge', `${versionCount} versions`);
    badge.dataset['testid'] = 'version-badge';
    card.append(badge);
  }
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

/** Union of a dish's fun facts across all its version records, deduped by text
 *  (facts are denormalized per record, so siblings usually overlap). */
const pooledFunFacts = (entries: CachedRecipe[]): FunFact[] => {
  const seen = new Set<string>();
  const out: FunFact[] = [];
  for (const entry of entries) {
    for (const fact of funFactsOf(entry.value as RecipeValue)) {
      if (seen.has(fact.text)) continue;
      seen.add(fact.text);
      out.push(fact);
    }
  }
  return out;
};

/** The inline version-flip control bar (recipe page, above the banner). Shows
 *  `‹ index of total ›` on the left and a `▦ View All` link on the right;
 *  prev/next call `onNav(-1|+1)`. Rendered only when a dish has >1 version. */
export const renderVersionBar = (opts: {
  index: number;
  total: number;
  viewAllHref: string;
  onNav: (delta: number) => void;
}): HTMLElement => {
  const bar = el('div', 'version-bar');
  bar.dataset['testid'] = 'version-bar';
  const nav = el('span', 'version-nav');
  const prev = el('button', 'version-prev', '‹') as HTMLButtonElement;
  prev.type = 'button';
  prev.dataset['testid'] = 'version-prev';
  prev.setAttribute('aria-label', 'Previous version');
  const count = el('span', 'version-count', `${opts.index + 1} of ${opts.total}`);
  count.dataset['testid'] = 'version-count';
  const next = el('button', 'version-next', '›') as HTMLButtonElement;
  next.type = 'button';
  next.dataset['testid'] = 'version-next';
  next.setAttribute('aria-label', 'Next version');
  prev.addEventListener('click', () => opts.onNav(-1));
  next.addEventListener('click', () => opts.onNav(1));
  nav.append(prev, count, next);
  const viewAll = el('a', 'version-viewall', '▦ View All') as HTMLAnchorElement;
  viewAll.href = opts.viewAllHref;
  viewAll.dataset['testid'] = 'view-all';
  bar.append(nav, viewAll);
  return bar;
};

/** ⛶ Focus mode: a distraction-free cook view of ONE version — image +
 *  ingredients + instructions only, larger type. The caller (recipe.ts) owns
 *  showing it full-screen (Fullscreen API / overlay) and removing it on exit. */
export const renderFocusView = (
  entry: CachedRecipe,
  opts: { onExit: () => void },
): HTMLElement => {
  const value = entry.value as RecipeValue;
  const overlay = el('div', 'focus-view');
  overlay.dataset['testid'] = 'focus-view';
  const top = el('div', 'focus-top');
  top.append(el('h2', 'focus-title', value.name ?? '(untitled)'));
  const exit = el('button', 'button focus-exit', '✕ Exit focus') as HTMLButtonElement;
  exit.type = 'button';
  exit.dataset['testid'] = 'focus-exit';
  exit.addEventListener('click', () => opts.onExit());
  top.append(exit);
  overlay.append(top);
  overlay.append(photoWrapEl(entry));
  const cols = el('div', 'focus-cols');
  const ingredients = el('section');
  ingredients.append(el('h3', undefined, 'Ingredients'));
  ingredients.append(listEl('ul', 'focus-ingredients', value.ingredients ?? []));
  const instructions = el('section');
  instructions.append(el('h3', undefined, 'Instructions'));
  instructions.append(listEl('ol', 'focus-instructions', value.instructions ?? []));
  cols.append(ingredients, instructions);
  overlay.append(cols);
  return overlay;
};

export type DishCompareOptions = RenderOptions & { dishName?: string };

/** The "View All" grid (dish.html): a dish's versions as compare cards, with the
 *  pooled fun facts on top. Each card links to that version's own recipe page. */
export const renderDishCompare = (
  entries: CachedRecipe[],
  options: DishCompareOptions = {},
): HTMLElement => {
  const section = el('section', 'dish-compare');
  const head = el('div', 'dish-head');
  const title = el('h1', 'dish-title', options.dishName ?? (entries[0]?.value as RecipeValue)?.name ?? 'Dish');
  title.dataset['testid'] = 'dish-title';
  const count = el('span', 'dish-count', `${entries.length} version${entries.length === 1 ? '' : 's'}`);
  count.dataset['testid'] = 'dish-count';
  head.append(title, count);
  section.append(head);

  if (options.showFunFacts !== false) {
    const facts = renderFunFacts(pooledFunFacts(entries));
    if (facts !== null) section.append(facts);
  }

  const grid = el('section', 'recipe-grid');
  grid.dataset['testid'] = 'version-grid';
  for (const entry of entries) {
    const card = renderCard(entry, options);
    card.dataset['testid'] = 'version-card';
    const label = versionLabelOf(entry.value);
    if (label !== undefined) {
      const badge = el('span', 'version-label', label);
      card.insertBefore(badge, card.querySelector('.card-title'));
    }
    grid.append(card);
  }
  section.append(grid);
  return section;
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

export type FacetDimension = 'cuisine' | 'category';

/**
 * A multi-select filter dropdown (Meal ▾ / Cuisine ▾). A native `<details>`
 * with a shared `name="browse-facet"` so only one opens at a time (exclusive
 * accordion). Each option is a checkbox carrying `data-dimension`/`data-value`
 * for the wiring layer (Phase 7) to read on change. Returns null when there is
 * nothing to filter by, so the caller can omit an empty control.
 */
export const renderFacetDropdown = (opts: {
  dimension: FacetDimension;
  label: string;
  available: readonly string[];
  selected: readonly string[];
}): HTMLElement | null => {
  if (opts.available.length === 0) return null;
  const details = el('details', 'facet-dd');
  details.setAttribute('name', 'browse-facet');
  details.dataset['dimension'] = opts.dimension;
  const summary = el('summary', 'facet-dd-summary', `${opts.label} ▾`);
  const panel = el('div', 'facet-dd-panel');
  for (const value of opts.available) {
    const option = el('label', 'facet-dd-option');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset['dimension'] = opts.dimension;
    box.dataset['value'] = value;
    box.checked = opts.selected.includes(value);
    option.append(box, document.createTextNode(value));
    panel.append(option);
  }
  details.append(summary, panel);
  return details;
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
  if (options.onFocus !== undefined) {
    const onFocus = options.onFocus;
    const actions = el('div', 'detail-actions');
    const focusBtn = el('button', 'button focus-btn', '⛶ Focus') as HTMLButtonElement;
    focusBtn.type = 'button';
    focusBtn.dataset['testid'] = 'focus-btn';
    focusBtn.setAttribute('aria-label', 'Focus mode — full-screen cook view');
    focusBtn.addEventListener('click', () => onFocus());
    actions.append(focusBtn);
    article.append(actions);
  }
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

  if (options.showFunFacts !== false) {
    const funFacts = renderFunFacts(funFactsOf(value));
    if (funFacts !== null) article.append(funFacts);
  }

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
