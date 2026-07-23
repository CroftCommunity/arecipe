// Recipe views (5d): the list renders LINK CARDS to recipe.html — real
// pages with shareable URLs and native back, no in-place expansion. The
// detail renders the full recipe. Trust surface on both: silent when good,
// loud when bad — intact records carry no badge (quiet provenance line at
// the end of the detail); a failed integrity check gets the rust ALTERED?
// rubber stamp + always-visible warning wherever the recipe appears.

import { referenceIconLink } from '../icons.js';
import { recipeFacets } from '../pages/browse-state.js';
import type { ScreenWakeLock, WakeLockState } from '../ui/wake-lock.js';
import type { CachedRecipe } from './cache.js';
import { recipeMetaOf, type Difficulty, type RecipeMeta } from './meta.js';
import { dishKeyOf, funFactsOf, versionLabelOf, type FunFact } from './model.js';
import { firstImageCid, firstImageCredit, formatDuration, formatPublishedDate, thumbUrl } from './present.js';
import { initStepState, stepReducer, stepStatusAt, type StepState } from './step-state.js';
import { tileMediaVariant } from './tile-variant.js';

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

/** A small "quick copy" link beside a section heading that copies that section
 *  (one line per item) to the clipboard. The payload rides a `data-copy`
 *  attribute so the copy target is inspectable/testable without the async
 *  Clipboard API; the click handler reads it and writes to the clipboard,
 *  flashing "copied" briefly. Clipboard denial is silent (label unchanged). */
const COPY_GLYPH = '⧉'; // overlapping squares — the "copy" affordance
const quickCopyControl = (lines: string[], testid: string): HTMLElement => {
  const btn = el('button', 'quick-copy', COPY_GLYPH) as HTMLButtonElement;
  btn.type = 'button';
  btn.dataset['testid'] = testid;
  btn.dataset['copy'] = lines.join('\n');
  // The button is icon-only, so the accessible name lives on aria-label/title.
  btn.setAttribute('aria-label', 'Copy to clipboard');
  btn.title = 'Copy';
  btn.addEventListener('click', () => {
    const payload = btn.dataset['copy'] ?? '';
    const done = navigator.clipboard?.writeText(payload);
    if (done === undefined) return; // no Clipboard API — nothing to flash
    void done.then(
      () => {
        btn.textContent = '✓'; // brief confirmation, then back to the copy glyph
        window.setTimeout(() => (btn.textContent = COPY_GLYPH), 1200);
      },
      () => {
        /* clipboard denied — leave the glyph as-is */
      },
    );
  });
  return btn;
};

/** A section heading paired with its quick-copy control on one row. */
const sectionHead = (title: string, lines: string[], copyTestid: string): HTMLElement => {
  const head = el('div', 'section-head');
  head.append(el('h3', undefined, title), quickCopyControl(lines, copyTestid));
  return head;
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

/** The themed "no meal image" standin (butterfly-spatula) as a light/dark pair
 *  like the wordmark logo — CSS shows the variant that suits the current theme.
 *  Both the empty media band and the single-column chip consume this ONE source,
 *  so the placeholder artwork can never diverge between them. Always decorative
 *  (empty alt): the accessible name is the recipe title. */
const placeholderMarks = (): HTMLImageElement[] =>
  (['light', 'dark'] as const).map((variant) => {
    const mark = document.createElement('img');
    mark.className = `placeholder-mark logo--${variant}`;
    mark.src = `./assets/no-meal-${variant}.png`;
    mark.alt = '';
    return mark;
  });

const placeholderEl = (): HTMLElement => {
  const placeholder = el('div', 'card-photo card-photo--empty');
  placeholder.append(...placeholderMarks());
  return placeholder;
};

// Single-column gate for the chip variant. D0 found the tile grid is intrinsic
// (`repeat(auto-fill, minmax(15rem, 1fr))`) with NO media query controlling its
// column count — so there is no existing breakpoint to reuse. This query is
// derived from that track: two 15rem columns + the grid gap + the #app padding
// need ~33rem of viewport, so at ≤32rem the grid is always single-column. Kept
// safely below the 2-column threshold: the chip therefore appears only when the
// grid is genuinely single-column, never inside a multi-column row. Consumed via
// matchMedia at render time; callers may override with `RenderOptions.columns`.
export const SINGLE_COLUMN_MEDIA = '(max-width: 32rem)';

const tileColumns = (options: RenderOptions): number => {
  if (options.columns !== undefined) return options.columns;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 2;
  return window.matchMedia(SINGLE_COLUMN_MEDIA).matches ? 1 : 2;
};

/** The inline chip that replaces the media band for a pictureless tile at
 *  single-column widths: the shared placeholder glyph in a small rounded square.
 *  Decorative (aria-hidden) — the tile link's accessible name stays the title. */
const tileChipEl = (): HTMLElement => {
  const chip = el('span', 'tile-chip');
  chip.setAttribute('aria-hidden', 'true');
  chip.append(...placeholderMarks());
  return chip;
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
  /** Seasonality (Feature B): uris that have ≥1 in-season ingredient get a
   *  quiet "In season" badge. Boost-only — never removes or reorders a card. */
  inSeasonUris?: ReadonlySet<string>;
  /** Resolved grid column count. When omitted, derived from `SINGLE_COLUMN_MEDIA`
   *  via matchMedia at render time. Drives the pictureless-tile chip variant
   *  (chip at 1 column, media band otherwise); tests pass it explicitly. */
  columns?: number;
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
  const hasImage = firstImageCid(entry.value) !== null && did !== '';
  const variant = tileMediaVariant({ hasImage, columns: tileColumns(options) });
  const title = el('span', 'card-title', value.name ?? '(untitled)');
  if (variant === 'chip') {
    // Single-column, pictureless: an inline chip row (glyph + title), no media
    // band. The title clamps visually (CSS) but keeps its full text in the DOM.
    card.classList.add('card--chip');
    const row = el('div', 'tile-chip-row');
    row.append(tileChipEl(), title);
    card.append(row);
  } else {
    // Photo tiles and the multi-column empty band are unchanged.
    const photoWrap = photoWrapEl(entry);
    const cardCredit = imageCreditOverlay(value, { withLink: false, testid: 'card-credit' });
    if (cardCredit !== null) photoWrap.append(cardCredit);
    card.append(photoWrap);
    card.append(title);
  }
  if (versionCount > 1) {
    const badge = el('span', 'version-badge', `${versionCount} versions`);
    badge.dataset['testid'] = 'version-badge';
    card.append(badge);
  }
  if (options.inSeasonUris?.has(entry.uri) === true) {
    const badge = el('span', 'in-season-badge', 'In season');
    badge.dataset['testid'] = 'in-season-badge';
    card.append(badge);
  }
  const chips = chipsEl(value);
  if (chips !== null) card.append(chips);
  if (!entry.verified) card.append(alteredWarningEl());
  return card;
};

/** Seasonality (Feature B): the optional "In season now" strip — a compact,
 *  additive row naming the produce that is in season right now among the shown
 *  recipes. It surfaces what's good (B0), never duplicating or reordering the
 *  cards below. Returns null when nothing is in season (so it takes no space). */
export const renderInSeasonStrip = (produceNames: string[]): HTMLElement | null => {
  const cap = 12;
  const picks = produceNames.slice(0, cap);
  if (picks.length === 0) return null;
  const strip = el('section', 'in-season-strip');
  strip.dataset['testid'] = 'in-season-strip';
  strip.append(el('span', 'in-season-strip-label', 'In season now'));
  const row = el('div', 'in-season-strip-row');
  for (const name of picks) {
    const chip = el('span', 'in-season-chip', name);
    chip.dataset['testid'] = 'in-season-chip';
    row.append(chip);
  }
  strip.append(row);
  return strip;
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

/** The visible wake-lock status line in `.focus-top` (D2). Held → a quiet
 *  reassurance; anything else (idle/denied/unsupported) renders NOTHING — no
 *  warning, no "your browser doesn't support" nag. Subscribes to the lock so it
 *  reflects a mid-session platform release/re-acquire. Rendered even with no
 *  lock (stays empty) so the testid always resolves. */
const wakeStateEl = (wakeLock: ScreenWakeLock | undefined): HTMLElement => {
  const status = el('span', 'focus-wake-state');
  status.dataset['testid'] = 'wake-state';
  const paint = (s: WakeLockState): void => {
    status.textContent = s === 'held' ? 'screen staying on' : '';
  };
  if (wakeLock !== undefined) {
    paint(wakeLock.state);
    wakeLock.subscribe(paint);
  } else {
    paint('idle');
  }
  return status;
};

/** The step-at-a-time instructions section (D3): the FULL <ol> stays in the
 *  DOM — exactly one step is `current` (aria-current + prominence), earlier
 *  steps recede as `done`, later steps are untouched. Next/Back move the current
 *  step (clamped, no wraparound) and tapping any step makes it current. State is
 *  per session, held in a pure reducer; nothing is persisted or hidden. */
const focusInstructionsEl = (lines: string[]): HTMLElement => {
  const section = el('section', 'focus-instructions-section');
  section.append(el('h3', undefined, 'Instructions'));
  const list = el('ol', 'focus-instructions') as HTMLOListElement;
  list.dataset['testid'] = 'focus-instructions';
  const items = lines.map((line, i) => {
    const li = el('li', 'focus-step', line) as HTMLLIElement;
    li.dataset['stepIndex'] = String(i);
    list.append(li);
    return li;
  });
  section.append(list);

  let state: StepState = initStepState(lines.length);
  const paint = (): void => {
    items.forEach((li, i) => {
      const status = stepStatusAt(state, i);
      li.classList.toggle('step-done', status === 'done');
      li.classList.toggle('step-current', status === 'current');
      if (status === 'current') li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  };
  const dispatch = (action: Parameters<typeof stepReducer>[1]): void => {
    state = stepReducer(state, action);
    paint();
  };
  items.forEach((li, i) => li.addEventListener('click', () => dispatch({ type: 'setCurrent', index: i })));

  const controls = el('div', 'focus-step-controls');
  const back = el('button', 'button focus-step-back', '‹ Back') as HTMLButtonElement;
  back.type = 'button';
  back.dataset['testid'] = 'step-back';
  back.addEventListener('click', () => dispatch({ type: 'back' }));
  const next = el('button', 'button focus-step-next', 'Next ›') as HTMLButtonElement;
  next.type = 'button';
  next.dataset['testid'] = 'step-next';
  next.addEventListener('click', () => dispatch({ type: 'next' }));
  controls.append(back, next);
  section.append(controls);

  paint();
  return section;
};

/** ⛶ Focus mode: a distraction-free cook view of ONE version — image +
 *  ingredients + step-at-a-time instructions, cook-scale type. The caller
 *  (recipe.ts) owns showing it full-screen (Fullscreen API / overlay), the
 *  screen wake lock's lifecycle, and removing it on exit. */
export const renderFocusView = (
  entry: CachedRecipe,
  opts: { onExit: () => void; wakeLock?: ScreenWakeLock; timerStripHost?: HTMLElement },
): HTMLElement => {
  const value = entry.value as RecipeValue;
  const overlay = el('div', 'focus-view');
  overlay.dataset['testid'] = 'focus-view';
  const top = el('div', 'focus-top');
  // Left cluster: the title with the (silent-unless-held) wake status beneath it,
  // so the exit control stays hard-right on its own.
  const heading = el('div', 'focus-top-heading');
  heading.append(el('h2', 'focus-title', value.name ?? '(untitled)'));
  heading.append(wakeStateEl(opts.wakeLock));
  top.append(heading);
  // Compact running-timers strip (A-D6). The caller mounts into this host; it
  // renders nothing while no timer runs, so it takes no space from the step.
  if (opts.timerStripHost !== undefined) top.append(opts.timerStripHost);
  const exit = el('button', 'button focus-exit', '✕ Exit focus') as HTMLButtonElement;
  exit.type = 'button';
  exit.dataset['testid'] = 'focus-exit';
  exit.addEventListener('click', () => opts.onExit());
  top.append(exit);
  overlay.append(top);
  // No image? Mark the photo area empty so it renders as a small top strip
  // rather than a full-height banner of blank placeholder (which ate ~75% of a
  // phone screen). CSS (.focus-view .focus-photo-empty) does the shrinking.
  const hasImage = firstImageCid(entry.value) !== null;
  const photo = photoWrapEl(entry);
  if (!hasImage) photo.classList.add('focus-photo-empty');
  // Focus is a during-cook surface: keep serves + time, suppress difficulty (O2).
  const strip = renderMetaStrip(recipeMetaOf(entry.value), { focus: true, standalone: !hasImage });
  if (strip !== null && hasImage) {
    const hero = el('div', 'recipe-hero');
    hero.append(photo, strip);
    overlay.append(hero);
  } else {
    overlay.append(photo);
    if (strip !== null) overlay.append(strip);
  }
  const cols = el('div', 'focus-cols');
  const ingredients = el('section');
  ingredients.append(el('h3', undefined, 'Ingredients'));
  ingredients.append(listEl('ul', 'focus-ingredients', value.ingredients ?? []));
  cols.append(ingredients, focusInstructionsEl(value.instructions ?? []));
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
      // `.before()` (not card.insertBefore) so this is nesting-safe: in the
      // single-column chip variant the title lives inside .tile-chip-row.
      card.querySelector('.card-title')?.before(badge);
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
  // Summary: "Meal ▾", with a subtle count bubble when there's an ACTIVE filter
  // (selected values that actually exist in this feed) — so it's clear a filter
  // is at work without opening the dropdown.
  const summary = el('summary', 'facet-dd-summary');
  const activeCount = opts.selected.filter((v) => opts.available.includes(v)).length;
  summary.append(document.createTextNode(opts.label));
  if (activeCount > 0) {
    const badge = el('span', 'facet-count', String(activeCount));
    badge.setAttribute('aria-label', `${activeCount} selected`);
    summary.append(document.createTextNode(' '), badge);
  }
  summary.append(document.createTextNode(' ▾'));
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

/**
 * A flat facet checkbox group (Meal / Cuisine) for use INSIDE the single Filters
 * ▾ popover (D7) — where a nested `<details>` popover would stack awkwardly. Each
 * option carries the same `data-dimension`/`data-value` the wiring layer reads on
 * change, so the toolbar's delegated listener is unchanged. Returns null when
 * there is nothing to filter by.
 */
export const renderFacetGroup = (opts: {
  dimension: FacetDimension;
  label: string;
  available: readonly string[];
  selected: readonly string[];
}): HTMLElement | null => {
  if (opts.available.length === 0) return null;
  const group = el('div', 'facet-group');
  group.dataset['dimension'] = opts.dimension;
  const heading = el('p', 'facet-group-label', opts.label);
  group.append(heading);
  for (const value of opts.available) {
    const option = el('label', 'facet-dd-option');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset['dimension'] = opts.dimension;
    box.dataset['value'] = value;
    box.checked = opts.selected.includes(value);
    option.append(box, document.createTextNode(value));
    group.append(option);
  }
  return group;
};

/** The difficulty `<dd>`: five dots (aria-hidden decoration, `value` filled) plus
 *  the text label — the accessible value a screen reader announces. */
const difficultyDd = (d: Difficulty): HTMLElement => {
  const dd = el('dd', 'difficulty-value');
  const dots = el('span', 'dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 5; i += 1) {
    dots.append(el('span', `dot ${i <= d.value ? 'dot--on' : 'dot--off'}`));
  }
  dd.append(dots, el('span', 'difficulty-label', d.label));
  return dd;
};

const metaRow = (label: string, dd: HTMLElement): HTMLElement => {
  const row = el('div', 'meta-row');
  row.append(el('dt', undefined, label), dd);
  return row;
};

/**
 * RUN-RECIPE-META-STRIP D2 — the three-row meta strip that hangs off the bottom
 * of the recipe image (Serves · Time · Difficulty, most-consequential first). A
 * description list, because that is what it is. Returns null when nothing renders
 * (callers leave the image alone — no empty container). Dots are decoration
 * (`aria-hidden`); the difficulty label is the accessible value.
 *
 * - `focus`: suppress the difficulty row (O2 — a pre-cook field, hidden on the
 *   during-cook surface). A difficulty-only strip then returns null.
 * - `standalone`: mark the strip so CSS rounds ALL corners — the no-image case,
 *   where it stands on its own rather than attached under an image.
 */
export const renderMetaStrip = (
  meta: RecipeMeta,
  opts: { focus?: boolean; standalone?: boolean } = {},
): HTMLElement | null => {
  const rows: HTMLElement[] = [];
  if (meta.serves !== undefined) rows.push(metaRow('Serves', el('dd', undefined, meta.serves.display)));
  if (meta.time !== undefined) rows.push(metaRow('Time', el('dd', undefined, meta.time.display)));
  if (opts.focus !== true && meta.difficulty !== undefined) {
    rows.push(metaRow('Difficulty', difficultyDd(meta.difficulty)));
  }
  if (rows.length === 0) return null;
  const dl = el('dl', 'meta-strip');
  if (opts.standalone === true) dl.classList.add('meta-strip--standalone');
  dl.dataset['testid'] = 'meta-strip';
  for (const row of rows) dl.append(row);
  return dl;
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
  // The meta strip (Serves · Time · Difficulty) hangs off the bottom of the
  // image and reads as one object with it. With a real image the two live in a
  // clipped .recipe-hero so the join squares off and the outer corners round;
  // with no image the strip stands alone (all corners rounded) so it never looks
  // like an orphaned fragment.
  const hasImage = firstImageCid(entry.value) !== null;
  const strip = renderMetaStrip(recipeMetaOf(entry.value), { standalone: !hasImage });
  if (strip !== null && hasImage) {
    const hero = el('div', 'recipe-hero');
    hero.append(banner, strip);
    article.append(hero);
  } else {
    article.append(banner);
    if (strip !== null) article.append(strip);
  }
  if (options.onFocus !== undefined) {
    const onFocus = options.onFocus;
    const actions = el('div', 'detail-actions');
    const focusBtn = el('button', 'button focus-btn', '⛶ Focus') as HTMLButtonElement;
    focusBtn.type = 'button';
    focusBtn.dataset['testid'] = 'focus-btn';
    focusBtn.setAttribute('aria-label', 'Focus mode — full-screen cook view');
    focusBtn.addEventListener('click', () => onFocus());
    // Reference quick link rides beside Focus: while cooking, the kitchen
    // charts (weights, substitutions, roasting) are one tap away — on mobile
    // the Reference tab left the bottom bar, so this IS the path to it.
    actions.append(referenceIconLink(), focusBtn);
    article.append(actions);
  }
  // Title row: just the title now — the Hide control moved to the bottom footer
  // (see below), so it no longer needs a slot up here.
  const titleRow = el('div', 'recipe-title-row');
  titleRow.append(el('h2', 'recipe-title', value.name ?? '(untitled)'));
  article.append(titleRow);
  // Time now lives in the meta strip under the image (not a separate chip here);
  // chipsEl stays for the card surfaces, which are out of scope for this run.
  if (!entry.verified) article.append(alteredWarningEl());
  if (value.text !== undefined && value.text !== '') {
    article.append(el('p', 'lede', value.text));
  }
  const credit = attributionEl(value);
  if (credit !== null) article.append(credit);

  const cols = el('div', 'detail-cols');
  const ingredientLines = value.ingredients ?? [];
  const instructionLines = value.instructions ?? [];
  const ingredients = el('section');
  ingredients.append(sectionHead('Ingredients', ingredientLines, 'copy-ingredients'));
  ingredients.append(listEl('ul', 'recipe-ingredients', ingredientLines));
  const instructions = el('section');
  instructions.append(sectionHead('Instructions', instructionLines, 'copy-instructions'));
  instructions.append(listEl('ol', 'recipe-instructions', instructionLines));
  cols.append(ingredients, instructions);
  article.append(cols);

  if (options.showFunFacts !== false) {
    const funFacts = renderFunFacts(funFactsOf(value));
    if (funFacts !== null) article.append(funFacts);
  }

  // Bottom footer: the quiet provenance line (verified only) on the left and a
  // control slot on the right, on one baseline-aligned row. The recipe page
  // injects its Hide control into the slot so Hide rides the bottom of the
  // detail, right-aligned in line with provenance — not detached under the image.
  const footer = el('div', 'detail-footer');
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
    footer.append(provenance);
  }
  footer.append(el('div', 'detail-footer-control-slot'));
  article.append(footer);
  return article;
};
