// Meals planner page. Phase 1 route → Phase 5 builder → Phase 6 calendar →
// Phase 7 real palette: two sources behind a switch — My Cookbook (your
// authored + liked recipes, the Cookbook page's "Both" scope) and Browse (the
// starter feed) — reusing arecipe's existing feed reads. Adding a cook by
// handle lives on the
// Browse tab (the discovery surface), not here. Drag (Phase 8) and PDS sync
// (Phase 9) build on this.
//
// The planner works signed-out: Browse (the starter feed) needs no auth and is
// the default when signed out; My Cookbook needs your identity, so it lazily
// (dynamic-import) boots the session only when that source is chosen — the
// initial bundle stays free of the heavy auth client. The local store is the
// in-flight buffer; the PDS record (Phase 9) is the durable home.

import type { Agent } from '@atproto/api';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { resetIconButton } from '../icons.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createResolver } from '../identity/resolve.js';
import {
  clampMealsPerDay,
  expandCalendar,
  MEALS_PER_DAY_MAX,
  MEALS_PER_DAY_MIN,
} from '../recipes/meal-plan.js';
import {
  addDays,
  dateForSlot,
  formatDayMonth,
  formatShortDate,
  formatWeekday,
  nextMonday,
  weekRangeLabel,
} from '../recipes/meal-plan-dates.js';
import { createCalendarClient } from '../publish/client.js';
import { createTastePreference, matchesTaste } from '../recipes/taste-preference.js';
import {
  createMealPlanStore,
  duplicateWeeks,
  mealLineText,
  type LocalMeal,
  type LocalPlan,
  type LocalWeek,
  type MealPlanStore,
} from '../recipes/meal-plan-local.js';
import { findStagedEdit, latestPlan, stagePlanForEdit, workingPlans } from '../recipes/meal-plan-edit.js';
import { getPdsPlan, listPdsPlans, removePlanFromPds, syncPlanToPds } from '../recipes/meal-plan-sync.js';
import { buildPlannedIndex, fingerprintOf } from '../recipes/planned-index.js';
import { createPlannedIndexCache } from '../recipes/planned-index-local.js';
import { partitionPlans } from '../recipes/planned-archive.js';
import {
  addMonths,
  defaultMonth,
  mealsByDate,
  monthGrid,
  monthLabel,
} from '../recipes/meal-plan-month.js';
import {
  loadCookbookPalette,
  loadStarterPalette,
  paginatePalette,
  type PaletteItem,
} from '../recipes/meal-plan-palette.js';
import { createRecipeCache } from '../recipes/cache.js';
import { createRecordReader } from '../recipes/read.js';
import {
  combinedLineText,
  expandedWeekCount,
  planDateBounds,
  renderByRecipeMarkdown,
  renderCombinedMarkdown,
  renderShoppingListDocument,
  resolveShoppingList,
  scaleIngredientLine,
  shoppingListFilename,
  type IngredientFetcher,
  type ShoppingList,
  type ShoppingPlan,
  type ShoppingRange,
} from '../recipes/shopping-list.js';
import { registerServiceWorker } from '../sw-register.js';

export type PaletteProvider = () => Promise<PaletteItem[]>;
type Source = 'cookbook' | 'browse';
/** In-flight drag payload (Phase 8 desktop enhancement): a palette chip or an
 * already-placed meal being moved. Tap-to-place remains the touch-safe primary. */
type Dragging =
  | { kind: 'palette'; item: PaletteItem }
  | { kind: 'meal'; wi: number; di: number; mi: number };

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MAX_WEEKS = 6;
const PALETTE_SEED_KEY = 'arecipe.meals.palette-seed';
/** Unfiltered, the palette shows at most this many chips so it can't run down
 * half the page; the pager arrows step through the rest, and the filter
 * (type-ahead) searches the whole loaded set. */
const PALETTE_CAP = 10;

// Weeks keep a `repeat` field in the record (default 1) for the calendar
// expansion; the UI no longer edits it — repetition is now "Repeat planned
// weeks", which appends real week copies.
const emptyWeek = (): LocalWeek => ({ repeat: 1, days: Array.from({ length: 7 }, () => ({ meals: [] })) });

const sessionHintSignedIn = (): boolean => {
  try {
    return window.localStorage.getItem('arecipe-session') === '1';
  } catch {
    return false;
  }
};

/** Optional localStorage palette seed (Phase 5 test/dev seam): when present it
 * short-circuits the network sources so hermetic tests need no routing. Inert
 * in production (no seed → the real providers load). */
const readSeed = (): PaletteItem[] => {
  try {
    const raw = window.localStorage.getItem(PALETTE_SEED_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: unknown): x is PaletteItem => {
      if (x === null || typeof x !== 'object') return false;
      const o = x as Record<string, unknown>;
      return typeof o['uri'] === 'string' && typeof o['cid'] === 'string' && typeof o['name'] === 'string';
    });
  } catch {
    return [];
  }
};

/** Build the calendar rows for a published plan: one `.cal-week` per expanded
 *  week, days labelled with real dates when the plan has a `startDate` (the
 *  first Monday), each placed meal a link to its recipe. The SHARED read-only
 *  view's renderer — the planner grounds its own week grid instead (see
 *  renderBuilder). Returns the empty-state element when nothing is planned.
 *  Pure. */
const buildCalendarRows = (plan: LocalPlan): HTMLElement[] => {
  const anyPlanned = plan.weeks.some((w) => w.days.some((s) => s.meals.length > 0));
  if (!anyPlanned) {
    const empty = el(
      'p',
      'empty-state',
      'Nothing planned yet — place a recipe on a day to see your calendar.',
    );
    empty.dataset['testid'] = 'calendar-empty';
    return [empty];
  }
  const start = plan.startDate;
  const rows: HTMLElement[] = [];
  let rowIndex = 0; // position in the flat calendar → the date offset (7 days each)
  for (const cw of expandCalendar(plan.weeks)) {
    const src = plan.weeks[cw.week - 1];
    if (src === undefined) {
      rowIndex += 1;
      continue;
    }
    const row = el('div', 'cal-week');
    row.dataset['testid'] = 'cal-week';
    row.dataset['week'] = String(cw.week);
    // Label: a real date range when anchored, else the abstract week label.
    const weekStart = start !== undefined ? dateForSlot(start, rowIndex, 0) : null;
    const weekEnd = start !== undefined ? dateForSlot(start, rowIndex, 6) : null;
    const s = weekStart !== null ? formatShortDate(weekStart) : null;
    const e = weekEnd !== null ? formatShortDate(weekEnd) : null;
    const label =
      s !== null && e !== null
        ? `${s} – ${e}`
        : src.repeat > 1
          ? `Week ${cw.week} · ${cw.rep} of ${src.repeat}`
          : `Week ${cw.week}`;
    row.append(el('div', 'cal-week-label', label));
    const daysEl = el('div', 'cal-days');
    src.days.forEach((slot, di) => {
      const cell = el('div', 'cal-day');
      const dayIso = start !== undefined ? dateForSlot(start, rowIndex, di) : null;
      const shortDay = dayIso !== null ? formatShortDate(dayIso) : null;
      // Weekday follows the real date (a plan can start on any weekday), falling
      // back to the fixed Mon-first label only when the plan has no anchor.
      const dow = (dayIso !== null ? formatWeekday(dayIso) : null) ?? DAY_LABELS[di];
      cell.append(el('span', 'day-label', shortDay !== null ? `${dow} ${shortDay}` : dow));
      if (slot.meals.length > 0) {
        cell.classList.add('day--filled');
        // One line per meal, "Type: Recipe" (type from the recipe's category).
        for (const meal of slot.meals) {
          const link = el('a', 'cal-slot', mealLineText(meal)) as HTMLAnchorElement;
          link.href = `./recipe.html?u=${encodeURIComponent(meal.recipe.uri)}`;
          link.dataset['testid'] = 'shared-meal';
          cell.append(link);
        }
      }
      daysEl.append(cell);
    });
    row.append(daysEl);
    rows.push(row);
    rowIndex += 1;
  }
  return rows;
};

type ParsedAtUri = { did: string; rkey: string };
const parseAtUri = (uri: string): ParsedAtUri | null => {
  const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return m === null ? null : { did: m[1]!, rkey: m[2]! };
};

/** The default ingredient resolver: cache-first (IndexedDB), then a cold
 * single-record read of the recipe by its at-uri (the same path recipe.ts
 * uses). Returns the recipe's `ingredients` lines, or null when unresolvable so
 * the list degrades to a named, flagged entry rather than blanking. */
const defaultIngredientFetcher: IngredientFetcher = async ({ uri }) => {
  const asLines = (value: unknown): string[] | null => {
    const ing = (value as { ingredients?: unknown }).ingredients;
    return Array.isArray(ing) ? ing.filter((x): x is string => typeof x === 'string') : null;
  };
  const cache = createRecipeCache();
  const cached = await cache.get(uri);
  if (cached !== undefined) return asLines(cached.value);
  const parsed = parseAtUri(uri);
  if (parsed === null) return null;
  const { pds } = await resolveDidDoc(parsed.did);
  const record = await createRecordReader()({ pds, did: parsed.did, rkey: parsed.rkey });
  await cache.put(record);
  return asLines(record.value);
};

/** A human label for the chosen range, used in the document header + filename. */
const shoppingRangeLabel = (plan: ShoppingPlan, range: ShoppingRange): string => {
  if (range.kind === 'dates') {
    const from = formatShortDate(range.from);
    const to = formatShortDate(range.to);
    if (from !== null && to !== null) return from === to ? from : `${from} – ${to}`;
  }
  if (range.kind === 'weeks') {
    return range.from === range.to ? `Week ${range.from}` : `Weeks ${range.from}–${range.to}`;
  }
  return weekRangeLabel(plan.startDate, plan.weeks.length);
};

/** Build the "Shopping list" action + inline export panel for a plan. Auth-free
 * — used by BOTH the signed-in planner and the public shared view. `getPlan`
 * reads the LIVE plan (the planner reassigns it on reset-on-publish), so the
 * list always reflects the current canvas. The ingredient resolver is injected
 * (default: cache-first single-recipe read); range selection defaults to "all
 * scheduled" and adapts to dated (date pickers) vs undated (week selector). */
const buildShoppingListSection = (
  getPlan: () => ShoppingPlan,
  fetchIngredients: IngredientFetcher = defaultIngredientFetcher,
): { button: HTMLButtonElement; panel: HTMLElement } => {
  // Icon-only action (🛒) — the accessible name lives on aria-label/title.
  const openBtn = el('button', 'button shopping-open', '🛒') as HTMLButtonElement;
  openBtn.type = 'button';
  openBtn.setAttribute('aria-label', 'Shopping list');
  openBtn.title = 'Shopping list';
  openBtn.dataset['testid'] = 'shopping-list-open';
  const panel = el('div', 'shopping-panel');
  panel.dataset['testid'] = 'shopping-list-panel';
  panel.hidden = true;

  let activeTab: 'byrecipe' | 'combined' = 'byrecipe';
  // Detail toggle (one shared flag, two meanings): By-recipe → amounts scaled by
  // ×N; Combined → each line carries the recipes it came from.
  let detail = false;
  let list: ShoppingList | null = null;
  let downloadUrl: string | null = null;
  const revoke = (): void => {
    if (downloadUrl !== null) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  };

  // --- range controls (rebuilt each open; a plan can gain/lose its date) ---
  const rangeRow = el('div', 'shopping-range');
  let currentRange: () => ShoppingRange = () => ({ kind: 'all' });
  const buildRangeControls = (): void => {
    rangeRow.replaceChildren();
    const plan = getPlan();
    const bounds = planDateBounds(plan);
    if (bounds !== null) {
      const from = el('input', 'shopping-range-input') as HTMLInputElement;
      const to = el('input', 'shopping-range-input') as HTMLInputElement;
      from.type = to.type = 'date';
      from.value = bounds.from;
      to.value = bounds.to;
      from.dataset['testid'] = 'shopping-from';
      to.dataset['testid'] = 'shopping-to';
      const fromL = el('label', 'shopping-range-label', 'From ');
      const toL = el('label', 'shopping-range-label', 'To ');
      fromL.append(from);
      toL.append(to);
      from.addEventListener('change', () => void regenerate());
      to.addEventListener('change', () => void regenerate());
      rangeRow.append(fromL, toL);
      currentRange = () =>
        from.value !== '' && to.value !== ''
          ? { kind: 'dates', from: from.value, to: to.value }
          : { kind: 'all' };
    } else {
      const total = Math.max(1, expandedWeekCount(plan));
      const mkSelect = (testid: string, value: number): HTMLSelectElement => {
        const sel = el('select', 'shopping-range-select') as HTMLSelectElement;
        sel.dataset['testid'] = testid;
        for (let n = 1; n <= total; n += 1) {
          const opt = document.createElement('option');
          opt.value = String(n);
          opt.textContent = String(n);
          sel.append(opt);
        }
        sel.value = String(value);
        sel.addEventListener('change', () => void regenerate());
        return sel;
      };
      const fromSel = mkSelect('shopping-week-from', 1);
      const toSel = mkSelect('shopping-week-to', total);
      const label = el('label', 'shopping-range-label', 'Weeks ');
      label.append(fromSel, document.createTextNode(' to '), toSel);
      rangeRow.append(label);
      currentRange = () => {
        const lo = Number(fromSel.value);
        const hi = Number(toSel.value);
        return { kind: 'weeks', from: Math.min(lo, hi), to: Math.max(lo, hi) };
      };
    }
  };

  // --- tabs + content ---
  const tabsRow = el('div', 'shopping-tabs');
  const byRecipeTab = el('button', 'button shopping-tab', 'By recipe') as HTMLButtonElement;
  const combinedTab = el('button', 'button shopping-tab', 'Combined') as HTMLButtonElement;
  byRecipeTab.type = combinedTab.type = 'button';
  byRecipeTab.dataset['testid'] = 'shopping-tab-byrecipe';
  combinedTab.dataset['testid'] = 'shopping-tab-combined';
  tabsRow.append(byRecipeTab, combinedTab);
  const contentEl = el('div', 'shopping-content');
  contentEl.dataset['testid'] = 'shopping-content';

  const actionsRow = el('div', 'shopping-actions');
  // Detail toggle: one control, two meanings depending on the active tab.
  const detailBtn = el('button', 'button shopping-detail', '') as HTMLButtonElement;
  detailBtn.type = 'button';
  detailBtn.dataset['testid'] = 'shopping-detail-toggle';
  const copyBtn = el('button', 'button shopping-copy', 'Copy') as HTMLButtonElement;
  copyBtn.type = 'button';
  copyBtn.dataset['testid'] = 'shopping-copy';
  const downloadSlot = el('span', 'shopping-download-slot');
  const closeBtn = el('button', 'button shopping-close', 'Close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.dataset['testid'] = 'shopping-close';
  actionsRow.append(detailBtn, copyBtn, downloadSlot, closeBtn);

  panel.append(rangeRow, tabsRow, contentEl, actionsRow);

  const activeMarkdown = (): string =>
    list === null
      ? ''
      : activeTab === 'combined'
        ? renderCombinedMarkdown(list, { sources: detail })
        : renderByRecipeMarkdown(list, { multiply: detail });

  // The toggle's label reflects what it does in the CURRENT tab (By-recipe →
  // scale amounts by ×N; Combined → show which recipes each ingredient is from).
  const renderDetailToggle = (): void => {
    detailBtn.textContent = activeTab === 'combined' ? 'Show sources' : 'Amounts ×N';
    detailBtn.setAttribute('aria-pressed', String(detail));
    detailBtn.classList.toggle('is-active', detail);
  };

  const renderContent = (): void => {
    byRecipeTab.classList.toggle('shopping-tab--active', activeTab === 'byrecipe');
    combinedTab.classList.toggle('shopping-tab--active', activeTab === 'combined');
    renderDetailToggle();
    contentEl.replaceChildren();
    if (list === null) {
      contentEl.append(el('p', 'status', 'building…'));
      return;
    }
    contentEl.append(
      activeTab === 'combined'
        ? renderCombinedDom(list, { sources: detail })
        : renderByRecipeDom(list, { multiply: detail }),
    );
  };

  const updateDownload = (): void => {
    revoke();
    if (list === null) return;
    const plan = getPlan();
    const range = currentRange();
    const label = shoppingRangeLabel(plan, range);
    const doc = renderShoppingListDocument(list, {
      planName: planTitle(plan as LocalPlan),
      rangeLabel: label,
      detail,
    });
    const blob = new Blob([doc], { type: 'text/markdown' });
    downloadUrl = URL.createObjectURL(blob);
    const link = el('a', 'button button--primary shopping-download', 'Download .md') as HTMLAnchorElement;
    link.href = downloadUrl;
    link.download = shoppingListFilename(planTitle(plan as LocalPlan), label);
    link.dataset['testid'] = 'shopping-download';
    downloadSlot.replaceChildren(link);
  };

  const regenerate = async (): Promise<void> => {
    list = null;
    renderContent();
    try {
      list = await resolveShoppingList(getPlan(), currentRange(), fetchIngredients);
    } catch (err) {
      log.warn('meal-plan', 'shopping list build failed', { error: String(err) });
      contentEl.replaceChildren(el('p', 'status', `couldn’t build the list: ${String(err)}`));
      return;
    }
    renderContent();
    updateDownload();
  };

  byRecipeTab.addEventListener('click', () => {
    activeTab = 'byrecipe';
    renderContent();
  });
  combinedTab.addEventListener('click', () => {
    activeTab = 'combined';
    renderContent();
  });
  detailBtn.addEventListener('click', () => {
    detail = !detail;
    renderContent();
    updateDownload();
  });
  copyBtn.addEventListener('click', () => {
    const done = navigator.clipboard?.writeText(activeMarkdown());
    if (done === undefined) return;
    void done.then(
      () => {
        copyBtn.textContent = 'Copied';
        window.setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
      },
      () => undefined,
    );
  });
  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    revoke();
  });
  openBtn.addEventListener('click', () => {
    if (!panel.hidden) {
      panel.hidden = true;
      revoke();
      return;
    }
    panel.hidden = false;
    buildRangeControls();
    void regenerate();
  });

  return { button: openBtn, panel };
};

/** The Combined tab as DOM (aggregated lines, "as listed", unavailable). With
 * `sources`, each aggregated line carries the recipes it was drawn from. */
const renderCombinedDom = (list: ShoppingList, opts: { sources?: boolean } = {}): HTMLElement => {
  const wrap = el('div', 'shopping-combined');
  wrap.dataset['testid'] = 'shopping-combined';
  if (list.combined.lines.length === 0) {
    wrap.append(el('p', 'status', 'Nothing to combine.'));
  } else {
    const ul = el('ul', 'shopping-list-ul');
    for (const line of list.combined.lines) {
      const li = el('li', 'shopping-combined-line', combinedLineText(line, opts));
      li.dataset['testid'] = 'shopping-combined-line';
      ul.append(li);
    }
    wrap.append(ul);
  }
  if (list.combined.asListed.length > 0) {
    wrap.append(el('h4', 'shopping-subhead', 'As listed'));
    const ul = el('ul', 'shopping-list-ul');
    for (const item of list.combined.asListed) {
      ul.append(el('li', 'shopping-aslisted', `${item.raw} (from ${item.recipes.join(', ')})`));
    }
    wrap.append(ul);
  }
  if (list.combined.unavailable.length > 0) {
    wrap.append(el('h4', 'shopping-subhead', 'Unavailable'));
    const ul = el('ul', 'shopping-list-ul');
    for (const name of list.combined.unavailable) {
      const li = el('li', 'shopping-unavailable', `${name} — ingredients unavailable`);
      li.dataset['testid'] = 'shopping-unavailable';
      ul.append(li);
    }
    wrap.append(ul);
  }
  return wrap;
};

/** The By-recipe tab as DOM (one section per recipe, verbatim lines, flags).
 * With `multiply`, each line's amount is scaled by the recipe's ×N (a bare line
 * gets an occurrence count; an unparseable line stays verbatim). */
const renderByRecipeDom = (list: ShoppingList, opts: { multiply?: boolean } = {}): HTMLElement => {
  const wrap = el('div', 'shopping-byrecipe');
  wrap.dataset['testid'] = 'shopping-byrecipe';
  const anyFlagged = list.byRecipe.some((s) => s.unavailable || s.lines.some((l) => l.flagged));
  if (anyFlagged) {
    wrap.append(el('p', 'shopping-legend', '⚑ couldn’t be combined — check this line yourself.'));
  }
  for (const s of list.byRecipe) {
    const sec = el('div', 'shopping-recipe-section');
    sec.dataset['testid'] = 'shopping-recipe-section';
    sec.append(el('h4', 'shopping-recipe-name', s.count > 1 ? `${s.name} ×${s.count}` : s.name));
    if (s.unavailable) {
      const p = el('p', 'shopping-flagged', 'ingredients unavailable');
      p.dataset['testid'] = 'shopping-recipe-unavailable';
      sec.append(p);
    } else {
      const ul = el('ul', 'shopping-list-ul');
      for (const line of s.lines) {
        const text = opts.multiply === true ? scaleIngredientLine(line.raw, s.count) : line.raw;
        const li = el('li', line.flagged ? 'shopping-line shopping-flagged' : 'shopping-line', line.flagged ? `${text} ⚑` : text);
        if (line.flagged) li.dataset['testid'] = 'shopping-flagged';
        ul.append(li);
      }
      sec.append(ul);
    }
    wrap.append(sec);
  }
  return wrap;
};

/** Read-only shared view: `meals.html?mealplan=<rkey>&user=<did|handle>`. Any
 *  visitor (including anon) can open a published plan — resolve the owner to a
 *  PDS, read the plan by rkey, and render a calendar where each meal links to
 *  its recipe. No auth, no planner. */
const showSharedPlan = async (
  app: HTMLElement,
  rkey: string,
  userParam: string | null,
): Promise<void> => {
  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Meal plan'));
  const body = el('div');
  body.dataset['testid'] = 'shared-plan';
  content.append(body);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  const user = userParam?.trim() ?? '';
  if (user === '') {
    body.replaceChildren(
      el('p', 'status', 'This shared meal-plan link needs a “user” parameter (the plan’s owner) to open.'),
    );
    return;
  }
  try {
    let did: string;
    let pds: string;
    if (user.startsWith('did:')) {
      did = user;
      ({ pds } = await resolveDidDoc(did));
    } else {
      const identity = await createResolver()(user);
      did = identity.did;
      pds = identity.pds;
    }
    const plan = await getPdsPlan(pds, did, rkey);
    const head = el('div', 'shared-plan-head');
    const titleRow = el('div', 'shared-plan-title-row');
    titleRow.append(el('h3', 'palette-title', planTitle(plan)));
    // Shopping list is auth-free — offer it on the public plan view too.
    const shopping = buildShoppingListSection(() => plan);
    titleRow.append(shopping.button);
    head.append(titleRow, shopping.panel);
    const calendar = el('section', 'calendar');
    for (const row of buildCalendarRows(plan)) calendar.append(row);
    body.replaceChildren(head, calendar);
    log.debug('shell', 'mounted', { page: 'meals', view: 'shared-plan' });
  } catch (err) {
    log.warn('meal-plan', 'shared plan load failed', { rkey, error: String(err) });
    body.replaceChildren(el('p', 'status', `couldn’t load this meal plan: ${String(err)}`));
  }
};

/** A plan's display title: its date range when anchored ("Jul 13 – Jul 19"),
 *  else a week count — plans aren't hand-named, so the range reads better than
 *  the generic "My meal plan". */
const planTitle = (plan: LocalPlan): string => weekRangeLabel(plan.startDate, plan.weeks.length);

/** "Jul 10, 2026" from an ISO timestamp (date only, floating). */
const publishedLabel = (iso: string): string => {
  const datePart = iso.slice(0, 10);
  const short = formatShortDate(datePart);
  return short !== null ? `${short}, ${datePart.slice(0, 4)}` : datePart;
};

/** "Start planning →" — the nudge from the Menu (published) view's empty and
 *  signed-out states to the Plan builder. Menu is its own top-level tab, so a
 *  new or signed-out cook can land here with nothing to show; this keeps that
 *  from being a dead end. */
const startPlanningLink = (): HTMLAnchorElement => {
  const link = el('a', 'button button--primary', 'Start planning →') as HTMLAnchorElement;
  link.href = './plan.html';
  link.dataset['testid'] = 'start-planning';
  return link;
};

/** Your published meal plans (the Menu default: `meals.html`). Signed-in
 *  only — lists the account's app.arecipe.mealPlan records with their week range
 *  and publish date, a link to the shareable view, and a guarded delete. */
const showPublishedPlans = async (app: HTMLElement): Promise<void> => {
  const content = el('section', 'panel');
  // A slim header row: the Archive link on the left (populated once plans
  // load) and the calendar-publish chip pinned upper right; the tab itself is
  // labeled by the nav, so no page title.
  const header = el('div', 'meals-header');
  const headerActions = el('div', 'meals-actions');
  header.append(headerActions);
  content.append(header);
  const body = el('div');
  body.dataset['testid'] = 'published-plans';
  content.append(body);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  body.replaceChildren(el('p', 'status', 'loading your published plans…'));
  let agent: Agent | null = null;

  // Calendar-publish status chip (D9): a device-local enabled/sync indicator
  // with a manual Resync, riding the Menu header's right edge — the calendar
  // mirrors the published plans listed here. Hidden unless the feature is
  // enabled on this device; rendered before auth so it shows signed-out too.
  const calendarClient = createCalendarClient();
  const listPublished = async (): Promise<LocalPlan[]> => {
    if (agent?.did === undefined) return [];
    const { pds } = await resolveDidDoc(agent.did);
    return listPdsPlans(pds, agent.did);
  };
  const calChip = el('div', 'calendar-chip');
  calChip.dataset['testid'] = 'calendar-sync-status';
  const refreshChip = (): void => {
    const cfg = calendarClient.config.load();
    if (!cfg.enabled) {
      calChip.hidden = true;
      calChip.replaceChildren();
      return;
    }
    calChip.hidden = false;
    const st = calendarClient.syncState.load();
    const labels: Record<string, string> = {
      unknown: 'Calendar: on',
      syncing: 'Calendar: syncing…',
      synced: 'Calendar: synced ✓',
      error: 'Calendar: sync failed ⚠',
      'needs-token': 'Calendar: reconnect',
    };
    const label = el('span', 'calendar-chip-label', labels[st.status] ?? 'Calendar');
    if (st.status === 'error' && st.message !== undefined) label.title = st.message;
    const resync = el('button', 'button calendar-resync', 'Resync') as HTMLButtonElement;
    resync.type = 'button';
    resync.dataset['testid'] = 'calendar-resync';
    resync.addEventListener('click', () => {
      const p = calendarClient.republish(listPublished);
      refreshChip(); // reflects 'syncing' (set synchronously at the start)
      void p.finally(() => refreshChip());
    });
    calChip.replaceChildren(label, resync);
    if (st.status === 'needs-token') {
      const setLink = el('a', 'friend-link', 'Set token') as HTMLAnchorElement;
      setLink.href = './account.html';
      calChip.append(setLink);
    }
  };
  headerActions.append(calChip);
  refreshChip();
  try {
    const { bootSession } = await import('../auth/boot.js');
    ({ agent } = await bootSession());
  } catch (err) {
    log.warn('meal-plan', 'auth for published plans failed', { error: String(err) });
  }
  if (agent === null || agent.did === undefined) {
    body.replaceChildren(
      el('p', 'status', 'Sign in to see your published meal plans.'),
      startPlanningLink(),
    );
    return;
  }
  const did = agent.did;
  const boundAgent = agent;
  try {
    const { pds } = await resolveDidDoc(did);
    const plans = await listPdsPlans(pds, did);
    // RUN-LAST-PLANNED: the Meals page loads plan records here, so it is a
    // legitimate writer of the derived index (D3). Rebuild it over the full
    // published history (computed, never a stored counter).
    void createPlannedIndexCache()
      .write(buildPlannedIndex(plans, new Date()), fingerprintOf(plans))
      .catch((err: unknown) => log.debug('meal-plan', 'planned-index rebuild skipped', { error: String(err) }));
    // RUN-LAST-PLANNED (D7): ranges whose derived dates have entirely passed
    // leave the active list and live on the Archive page — a VIEW, never a
    // deletion (the records are untouched).
    const { active: activePlans, archived: archivedPlans } = partitionPlans(plans, new Date());
    // Deleting a published plan (a date range) must also update the subscribable
    // calendar in place (no-op unless enabled on this device); the header
    // chip's client + lister above regenerate from the remaining set.

    // Below the list (past a divider): a read-only month calendar with every
    // published plan filled in. Days holding meals are tappable — selecting one
    // expands the day to its recipes as links; everything else is inert. Month
    // arrows page through; the view opens on today's month (or the nearest
    // planned one). Derived entirely from the same published list, so a delete
    // above redraws it.
    const listEl = el('div', 'plan-list');
    const divider = el('hr', 'plans-divider');
    const monthCal = el('section', 'month-cal');
    monthCal.dataset['testid'] = 'plans-calendar';
    let month: string | null = null; // sticky across redraws; null until first render
    let selectedDate: string | null = null;

    const dayExpand = (iso: string, dow: string, meals: LocalMeal[]): HTMLElement => {
      const panel = el('div', 'month-expand');
      panel.dataset['testid'] = 'month-expand';
      const short = formatShortDate(iso);
      panel.append(el('h4', 'month-expand-title', short !== null ? `${dow} · ${short}` : dow));
      for (const meal of meals) {
        const link = el('a', 'month-meal', mealLineText(meal)) as HTMLAnchorElement;
        link.href = `./recipe.html?u=${encodeURIComponent(meal.recipe.uri)}`;
        link.dataset['testid'] = 'month-meal';
        panel.append(link);
      }
      return panel;
    };

    const renderMonthCal = (list: LocalPlan[]): void => {
      const byDate = mealsByDate(list);
      const today = new Date().toISOString().slice(0, 10);
      month = month ?? defaultMonth(today, byDate.keys());
      const cells = month !== null ? monthGrid(month) : null;
      if (byDate.size === 0 || month === null || cells === null) {
        divider.hidden = true;
        monthCal.hidden = true;
        monthCal.replaceChildren();
        return;
      }
      divider.hidden = false;
      monthCal.hidden = false;
      const current = month;
      // A selection only survives while its day is still planned and visible.
      if (selectedDate !== null && (!cells.includes(selectedDate) || !byDate.has(selectedDate))) {
        selectedDate = null;
      }

      const head = el('div', 'month-head');
      const nav = (delta: number, glyph: string, label: string, testid: string): HTMLButtonElement => {
        const btn = el('button', 'month-nav', glyph) as HTMLButtonElement;
        btn.type = 'button';
        btn.dataset['testid'] = testid;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', () => {
          month = addMonths(current, delta);
          selectedDate = null;
          renderMonthCal(list);
        });
        return btn;
      };
      const title = el('h3', 'palette-title month-title', monthLabel(current) ?? current);
      title.dataset['testid'] = 'month-title';
      head.append(nav(-1, '‹', 'Previous month', 'month-prev'), title, nav(1, '›', 'Next month', 'month-next'));

      const grid = el('div', 'month-grid');
      grid.dataset['testid'] = 'month-grid';
      for (const dow of DAY_LABELS) grid.append(el('div', 'month-dow', dow));
      // The selected day's recipes render as a full-width panel directly under
      // its week row (grid auto-placement: it follows that row's 7th cell).
      const selIndex = selectedDate !== null ? cells.indexOf(selectedDate) : -1;
      const panelAfter = selIndex >= 0 ? Math.floor(selIndex / 7) * 7 + 6 : -1;
      cells.forEach((iso, i) => {
        if (iso === null) {
          grid.append(el('div', 'month-cell month-cell--pad'));
        } else {
          const dayNum = String(Number(iso.slice(8, 10)));
          const meals = byDate.get(iso);
          if (meals === undefined) {
            const cell = el('div', 'month-cell');
            cell.append(el('span', 'month-daynum', dayNum));
            grid.append(cell);
          } else {
            const btn = el('button', 'month-cell month-cell--filled') as HTMLButtonElement;
            btn.type = 'button';
            btn.dataset['testid'] = 'month-day';
            btn.dataset['date'] = iso;
            if (selectedDate === iso) btn.classList.add('month-cell--selected');
            btn.setAttribute('aria-expanded', String(selectedDate === iso));
            const short = formatShortDate(iso) ?? iso;
            btn.setAttribute('aria-label', `${short}, ${meals.length} ${meals.length === 1 ? 'recipe' : 'recipes'}`);
            btn.append(el('span', 'month-daynum', dayNum), el('span', 'month-count', String(meals.length)));
            btn.addEventListener('click', () => {
              selectedDate = selectedDate === iso ? null : iso;
              renderMonthCal(list);
            });
            grid.append(btn);
          }
        }
        if (i === panelAfter && selectedDate !== null) {
          const meals = byDate.get(selectedDate);
          if (meals !== undefined) {
            grid.append(dayExpand(selectedDate, DAY_LABELS[selIndex % 7] ?? '', meals));
          }
        }
      });
      monthCal.replaceChildren(head, grid);
    };

    const render = (list: LocalPlan[]): void => {
      body.replaceChildren(listEl, divider, monthCal);
      renderMonthCal(list);
      if (list.length === 0) {
        const empty = el('div', 'empty-state');
        empty.append(
          el('p', undefined, 'No published meal plans yet.'),
          startPlanningLink(),
        );
        listEl.replaceChildren(empty);
        return;
      }
      listEl.replaceChildren();
      for (const plan of list) {
        const shareUrl = new URL('meals.html', window.location.href);
        shareUrl.searchParams.set('mealplan', plan.id);
        shareUrl.searchParams.set('user', did);
        const row = el('div', 'plan-row');
        row.dataset['testid'] = 'plan-row';

        const info = el('div', 'plan-info');
        const open = el('a', 'plan-link', planTitle(plan)) as HTMLAnchorElement;
        open.href = shareUrl.toString();
        open.dataset['testid'] = 'plan-open';
        const meta = el('span', 'plan-meta', `published ${publishedLabel(plan.updatedAt)}`);
        meta.dataset['testid'] = 'plan-meta';
        info.append(open, meta);

        // Actions: Edit (opens the plan STAGED in the planner — republishing
        // replaces this record in place) + a guarded Delete.
        const actions = el('div', 'plan-actions');
        const edit = el('a', 'button', 'Edit') as HTMLAnchorElement;
        edit.href = `./plan.html?edit=${encodeURIComponent(plan.id)}`;
        edit.dataset['testid'] = 'plan-edit';

        // Delete: guarded inline confirm (removes the PDS record).
        const del = el('div', 'plan-del');
        const renderDel = (): void => {
          del.replaceChildren();
          const btn = el('button', 'button', 'Delete') as HTMLButtonElement;
          btn.type = 'button';
          btn.dataset['testid'] = 'plan-delete';
          btn.addEventListener('click', () => {
            del.replaceChildren();
            const note = el('span', 'reset-confirm-note', 'Delete? ');
            const confirm = el('button', 'button', 'Confirm') as HTMLButtonElement;
            confirm.type = 'button';
            confirm.dataset['testid'] = 'plan-delete-confirm';
            confirm.addEventListener('click', () => {
              void removePlanFromPds(boundAgent, plan.id)
                .then(() => {
                  const calP = calendarClient.republish(listPublished); // in-place calendar update
                  refreshChip();
                  void calP.finally(() => refreshChip());
                  render(list.filter((x) => x.id !== plan.id));
                })
                .catch((err: unknown) => {
                  del.replaceChildren(el('span', 'status', `delete failed: ${String(err)}`));
                });
            });
            const cancel = el('button', 'button', 'Cancel') as HTMLButtonElement;
            cancel.type = 'button';
            cancel.dataset['testid'] = 'plan-delete-cancel';
            cancel.addEventListener('click', () => renderDel());
            del.append(note, confirm, cancel);
          });
          del.append(btn);
        };
        renderDel();

        actions.append(edit, del);
        row.append(info, actions);
        listEl.append(row);
      }
    };
    // Archive link (D7): always present so the surface is discoverable; it
    // carries the archived count when there is one.
    const archiveLink = el(
      'a',
      'friend-link plans-archive-link',
      archivedPlans.length > 0 ? `Archive (${archivedPlans.length}) ↗` : 'Archive ↗',
    ) as HTMLAnchorElement;
    archiveLink.href = './archive.html';
    archiveLink.dataset['testid'] = 'plans-archive-link';
    header.prepend(archiveLink);
    render(activePlans);
    log.debug('shell', 'mounted', { page: 'meals', view: 'published-plans', archived: archivedPlans.length });
  } catch (err) {
    body.replaceChildren(el('p', 'status', `couldn’t load your plans: ${String(err)}`));
  }
};

export const main = async (
  deps: { palette?: PaletteProvider; store?: MealPlanStore } = {},
): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  // Shared read-only view: a published plan opened by link (anon-friendly). No
  // planner, no store, no auth — resolve the owner and render the calendar.
  const routeParams = new URLSearchParams(window.location.search);
  const sharedRkey = routeParams.get('mealplan');
  if (sharedRkey !== null && sharedRkey.trim() !== '') {
    await showSharedPlan(app, sharedRkey.trim(), routeParams.get('user'));
    return;
  }
  // meals.js serves both nav tabs. The Plan builder lives at /plan.html; the
  // Menu published view at /meals.html (the default). ?edit=<rkey> is the
  // staged-edit sub-flow — the builder — so it renders wherever it's opened
  // (its links point at /plan.html).
  const onPlanPage = /\/plan\.html$/.test(window.location.pathname);
  // Edit mode (?edit=<rkey>): open a published plan as a STAGED local copy —
  // edits stay local (no write-through) until "Publish update" replaces the
  // published record in place (same rkey → the share link survives). Signed-in
  // only: publishing back needs the account, so the session boots eagerly here.
  const editParam = routeParams.get('edit');
  const editRkey = editParam !== null && editParam.trim() !== '' ? editParam.trim() : null;
  if (!onPlanPage && editRkey === null) {
    await showPublishedPlans(app);
    return;
  }

  const store = deps.store ?? createMealPlanStore();
  const signedInHint = sessionHintSignedIn();
  let editStaged: LocalPlan | null = null;
  let editAgent: Agent | null = null;
  if (editRkey !== null) {
    const loadPanel = el('section', 'panel');
    const editBody = el('div');
    editBody.dataset['testid'] = 'edit-plan';
    loadPanel.append(el('h2', 'section-title', 'Edit published plan'), editBody);
    const backToPlans = (): HTMLAnchorElement => {
      const back = el('a', 'friend-link', '‹ Back to Menu') as HTMLAnchorElement;
      back.href = './meals.html';
      back.dataset['testid'] = 'plans-back';
      return back;
    };
    editBody.replaceChildren(el('p', 'status', 'loading your published plan…'));
    mountShell(app, loadPanel);
    try {
      const { bootSession } = await import('../auth/boot.js');
      const { agent } = await bootSession();
      if (agent?.did === undefined) {
        editBody.replaceChildren(
          el('p', 'status', 'Sign in to edit a published meal plan.'),
          backToPlans(),
        );
        void mountBuildStamp(app);
        void registerServiceWorker();
        return;
      }
      editAgent = agent;
      // Resume an in-flight staged edit; otherwise fetch the published record
      // and stage a fresh copy.
      const resumed = findStagedEdit(store, editRkey);
      if (resumed !== undefined) {
        editStaged = resumed;
      } else {
        const { pds } = await resolveDidDoc(agent.did);
        editStaged = stagePlanForEdit(store, await getPdsPlan(pds, agent.did, editRkey));
      }
    } catch (err) {
      log.warn('meal-plan', 'edit-mode load failed', { rkey: editRkey, error: String(err) });
      editBody.replaceChildren(
        el('p', 'status', `couldn’t load this published plan: ${String(err)}`),
        backToPlans(),
      );
      void mountBuildStamp(app);
      void registerServiceWorker();
      return;
    }
  }
  const editing = editStaged !== null;

  // Single implicit plan (v1): edit the first WORKING plan, creating one if
  // absent. Staged edit copies are keyed to their published record (edit mode
  // above) and are never adopted here — a plain visit must not write-through
  // onto a published record.
  const existing = editStaged ?? workingPlans(store)[0];
  let plan: LocalPlan = existing ?? store.save({ name: 'My meal plan', weeks: [emptyWeek()] });
  const createdFresh = existing === undefined; // for PDS-recovery reconciliation
  let armed: PaletteItem | null = null;
  let dragging: Dragging | null = null;
  // Days the user has expanded (mobile): a tall, full-width panel where per-meal
  // × and "Clear day" are comfortably tappable. Keyed `${weekIndex}:${dayIndex}`;
  // survives re-renders (renderBuilder rebuilds the DOM each time).
  const expandedDays = new Set<string>();
  // Per-week day layout (view-only, in-memory like expandedDays): a week whose
  // index is in this set shows its 7 days STACKED vertically (full-width rows)
  // instead of the default horizontal 7-column grid. Each week toggles its own,
  // keyed by week index — matching expandedDays' index keying (view state, not
  // part of the record, so it isn't reindexed on add/remove).
  const stackedWeeks = new Set<number>();
  // Set once the session is booted (signed in): enables write-through to the
  // PDS. Edit mode already booted eagerly above.
  let syncAgent: Agent | null = editAgent;

  // Palette state: items from the active source, filtered.
  let source: Source = signedInHint ? 'cookbook' : 'browse';
  let sourceItems: PaletteItem[] = [];
  let filterText = '';
  // Unfiltered, the palette shows one page (PALETTE_CAP) at a time; the arrows
  // step this offset so a browser can cycle recipes they'd not know to search.
  let paletteOffset = 0;
  const tastePreference = createTastePreference();
  let you: { did: string; pds: string } | null = null;

  const content = el('section', 'panel');
  // No page title — the nav tab labels this view. The per-day cap lives on its
  // own line at the top, the Reset control on the start row; the
  // calendar-publish chip rides the Menu (published plans) header instead.
  // "Recipes per day" cap: how many recipes a day may hold. A plan-level setting
  // that gates adding (never deletes what's already placed); persisted + synced.
  const perDayLabel = el('label', 'meals-perday');
  perDayLabel.append(el('span', 'meals-perday-label', 'Per Day'));
  const perDaySelect = el('select', 'meals-perday-select') as HTMLSelectElement;
  perDaySelect.dataset['testid'] = 'meals-per-day';
  for (let n = MEALS_PER_DAY_MIN; n <= MEALS_PER_DAY_MAX; n += 1) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    perDaySelect.append(opt);
  }
  perDaySelect.addEventListener('change', () => {
    plan.mealsPerDay = clampMealsPerDay(Number(perDaySelect.value));
    persist();
    rerender();
  });
  perDayLabel.append(perDaySelect);
  const resetControl = el('div', 'meals-reset');

  // Calendar publishing (D9): the publish/delete flows below refresh the
  // subscribable calendar in place. The status chip itself now lives on the
  // Menu (published plans) page — see showPublishedPlans.
  const calendarClient = createCalendarClient();
  const listPublished = async (): Promise<LocalPlan[]> => {
    const a = syncAgent;
    if (a?.did === undefined) return [];
    const pds = you?.pds ?? (await resolveDidDoc(a.did)).pds;
    return listPdsPlans(pds, a.did);
  };
  // The per-day cap ("Per Day") now rides the start row below, next to the
  // "Starts" date picker (see the plan-start block); it no longer needs its own
  // controls row at the top of the panel.

  // Edit-mode banner: the canvas holds a STAGED copy of a published plan.
  // Discard removes the copy (the published record is untouched) and returns
  // to the list; publishing below replaces the record in place.
  if (editing) {
    const banner = el('div', 'edit-banner');
    banner.dataset['testid'] = 'edit-banner';
    banner.append(
      el(
        'span',
        'edit-banner-text',
        `Editing published plan (${planTitle(plan)}) — changes stay here until you publish.`,
      ),
    );
    const discard = el('button', 'button', 'Discard edits') as HTMLButtonElement;
    discard.type = 'button';
    discard.dataset['testid'] = 'edit-discard';
    discard.addEventListener('click', () => {
      store.remove(plan.id);
      window.location.assign('./meals.html');
    });
    banner.append(discard);
    content.append(banner);
  }

  // Recovery notice (plain planner only): when this load created a fresh,
  // still-untouched canvas and the account has plans on the PDS, offer the most
  // recent one back through the STAGED edit flow (?edit=<rkey>) instead of
  // adopting it live — a remote record may be published (shared), and adopting
  // it would let write-through edit it silently. Hidden until recovery finds
  // something; hidden again the moment the canvas is touched (offer moot).
  const recoveryNotice = el('div', 'recovery-notice');
  recoveryNotice.dataset['testid'] = 'recovery-notice';
  recoveryNotice.hidden = true;
  if (!editing) content.append(recoveryNotice);
  const renderRecoveryNotice = (latest: LocalPlan, count: number): void => {
    const label = count === 1 ? 'a plan on your account' : `${count} plans on your account`;
    recoveryNotice.replaceChildren(
      el(
        'span',
        'recovery-notice-text',
        `Found ${label} — resume the latest (${planTitle(latest)}) to edit and republish it, or open Meals to browse them.`,
      ),
    );
    const resume = el('a', 'button', 'Resume latest') as HTMLAnchorElement;
    resume.href = `./plan.html?edit=${encodeURIComponent(latest.id)}`;
    resume.dataset['testid'] = 'recovery-resume';
    recoveryNotice.append(resume);
    recoveryNotice.hidden = false;
  };

  const planner = el('div', 'meal-planner');
  const palette = el('aside', 'palette');
  palette.dataset['testid'] = 'palette';

  palette.append(el('h3', 'palette-title', 'Recipes'));

  const sourceSwitch = el('div', 'palette-source');
  const cookbookBtn = el('button', 'src-btn', 'My Cookbook') as HTMLButtonElement;
  cookbookBtn.type = 'button';
  cookbookBtn.dataset['testid'] = 'source-cookbook';
  const browseBtn = el('button', 'src-btn', 'Browse') as HTMLButtonElement;
  browseBtn.type = 'button';
  browseBtn.dataset['testid'] = 'source-browse';
  sourceSwitch.append(cookbookBtn, browseBtn);
  palette.append(sourceSwitch);

  const filterInput = el('input', 'palette-filter') as HTMLInputElement;
  filterInput.type = 'search';
  filterInput.placeholder = 'filter recipes…';
  filterInput.dataset['testid'] = 'palette-filter';
  palette.append(filterInput);

  const chips = el('div', 'palette-chips');
  palette.append(chips);
  // Pager: ◀ / ▶ arrows flanking the "Showing X–Y of N" hint, so a browser can
  // step through the unfiltered palette a page at a time — discovering recipes
  // they wouldn't know to type. Hidden while filtering (the type-ahead already
  // narrows) and when everything fits on one page.
  const paging = el('div', 'palette-paging');
  const prevBtn = el('button', 'palette-page-btn', '◀') as HTMLButtonElement;
  prevBtn.type = 'button';
  prevBtn.dataset['testid'] = 'palette-prev';
  prevBtn.setAttribute('aria-label', 'Previous recipes');
  const chipsHint = el('p', 'status palette-hint');
  chipsHint.dataset['testid'] = 'palette-hint';
  const nextBtn = el('button', 'palette-page-btn', '▶') as HTMLButtonElement;
  nextBtn.type = 'button';
  nextBtn.dataset['testid'] = 'palette-next';
  nextBtn.setAttribute('aria-label', 'More recipes');
  paging.append(prevBtn, chipsHint, nextBtn);
  palette.append(paging);
  prevBtn.addEventListener('click', () => {
    paletteOffset = Math.max(0, paletteOffset - PALETTE_CAP);
    renderChips();
  });
  nextBtn.addEventListener('click', () => {
    paletteOffset += PALETTE_CAP;
    renderChips();
  });

  const builder = el('div', 'builder');
  builder.dataset['testid'] = 'builder';
  planner.append(palette, builder);
  content.append(planner);

  // Today (floating, UTC) — the earliest date the plan may start on. Used as the
  // picker's `min` and to clamp any past date forward, so a plan is always
  // anchored on today or a future day.
  const todayIso = new Date().toISOString().slice(0, 10);
  // Clamp a chosen ISO date to today-or-later: unparseable → null; a past date →
  // today; otherwise the date verbatim (NO Monday snapping — a plan may start on
  // any weekday, and the calendar follows that day).
  const clampStart = (iso: string): string | null => {
    const normalized = addDays(iso, 0); // validates + canonicalizes; null if bad
    if (normalized === null) return null;
    return normalized < todayIso ? todayIso : normalized;
  };

  // Start-date control (top of the builder, above Week 1): anchor the plan on a
  // real date so the week grid grounds on real days. The plan starts on exactly
  // the chosen day (any weekday); empty clears the anchor (back to abstract "Week
  // N"). Re-anchoring only relabels — placements are untouched.
  const startRow = el('div', 'plan-start');
  const startFields = el('div', 'plan-start-fields');
  const startField = el('label', 'plan-start-field');
  startField.append(el('span', 'plan-start-label', 'Starts'));
  const startInput = el('input', 'plan-start-input') as HTMLInputElement;
  startInput.type = 'date';
  startInput.min = todayIso; // can't start a plan in the past
  startInput.dataset['testid'] = 'plan-start-date';
  if (plan.startDate !== undefined) startInput.value = plan.startDate;
  // Reflect the anchor in the URL (?start=YYYY-MM-DD) so the grounded view is
  // shareable and survives a refresh. Skipped for a staged edit — its identity
  // is ?edit=<rkey>, and the copy's date belongs to the published record.
  const syncStartToUrl = (): void => {
    if (editing) return;
    const url = new URL(window.location.href);
    if (plan.startDate !== undefined) url.searchParams.set('start', plan.startDate);
    else url.searchParams.delete('start');
    window.history.replaceState(null, '', url);
  };
  startInput.addEventListener('change', () => {
    const v = startInput.value.trim();
    if (v === '') {
      delete plan.startDate;
    } else {
      const picked = clampStart(v);
      if (picked === null) return; // unparseable — leave the plan as it was
      plan.startDate = picked;
      startInput.value = picked;
    }
    persist();
    syncStartToUrl();
    rerender();
  });
  startField.append(startInput);
  // "Starts" (date) leads; the "Per Day" cap sits directly beside it, both with
  // their label stacked above the control.
  startFields.append(startField, perDayLabel);
  startRow.append(startFields);
  // The plan Reset rides this row's right-aligned spot (space-between), on the
  // same line as the picker. Edit mode has no Reset — see renderResetControl.
  if (!editing) startRow.append(resetControl);
  // A fresh canvas (Reset / reset-on-publish) re-anchors on the next Monday —
  // the same default a fresh load gets (D7) — keeping the input, URL, and week
  // labels in step. In-memory only: the blank plan stays local until something
  // is placed (persist() then carries the anchor along).
  const anchorFreshPlan = (): void => {
    const nm = nextMonday(todayIso);
    if (nm !== null) plan.startDate = nm;
    startInput.value = plan.startDate ?? '';
    syncStartToUrl();
  };

  // Shopping list for the working plan — reads the LIVE plan (getter), so it
  // reflects the current canvas even after a reset-on-publish reassigns it. The
  // button rides the publish row (left, opposite Publish); its panel drops below.
  const shoppingList = buildShoppingListSection(() => plan);

  // Publish: the plan already syncs on every change; publishing surfaces a
  // shareable, date-aligned link anyone (incl. anon) can open — the same link
  // also lists on the "Published" plans subpage. Signed-in only.
  const shareSection = el('section', 'plan-share');
  const publishRow = el('div', 'plan-publish-row');
  const publishBtn = el(
    'button',
    'button plan-publish-btn',
    editing ? 'Publish update' : 'Publish',
  ) as HTMLButtonElement;
  publishBtn.type = 'button';
  publishBtn.dataset['testid'] = 'publish-plan';
  // The row splits: Shopping list on the LEFT, Publish right-aligned opposite
  // it (space-between). The shopping panel drops below the row.
  publishRow.append(shoppingList.button, publishBtn);
  const shareSlot = el('div', 'plan-share-slot');
  const renderShareLink = (link: string): HTMLElement => {
    const box = el('div', 'share-link');
    const urlInput = el('input', 'share-link-input') as HTMLInputElement;
    urlInput.type = 'text';
    urlInput.readOnly = true;
    urlInput.value = link;
    urlInput.dataset['testid'] = 'share-url';
    const copy = el('button', 'button', 'Copy') as HTMLButtonElement;
    copy.type = 'button';
    copy.dataset['testid'] = 'share-copy';
    copy.addEventListener('click', () => {
      const done = navigator.clipboard?.writeText(link);
      if (done === undefined) return;
      void done.then(
        () => {
          copy.textContent = 'Copied';
          window.setTimeout(() => (copy.textContent = 'Copy'), 1200);
        },
        () => undefined,
      );
    });
    const open = el('a', 'friend-link share-open', 'Open ↗') as HTMLAnchorElement;
    open.href = link;
    open.dataset['testid'] = 'share-open';
    box.append(urlInput, copy, open);
    return box;
  };
  publishBtn.addEventListener('click', () => {
    if (syncAgent === null || syncAgent.did === undefined) {
      shareSlot.replaceChildren(el('p', 'status', 'Sign in to publish and share your plan.'));
      return;
    }
    const did = syncAgent.did;
    const agent = syncAgent;
    publishBtn.disabled = true;
    shareSlot.replaceChildren(el('p', 'status', 'publishing…'));
    void syncPlanToPds(agent, plan)
      .then(async () => {
        void rebuildPlannedIndex(); // published record is durable — refresh the index
        // Staged edit republished: the write above replaced the ORIGINAL record
        // (rkey = editOf), so drop the staged copy, refresh the subscribable
        // calendar in place, and return to the published list — the row keeps
        // its share link, now serving the edited plan.
        if (plan.editOf !== undefined) {
          store.remove(plan.id);
          await calendarClient.republish(listPublished).catch(() => undefined);
          window.location.assign('./meals.html');
          return;
        }
        // Build the share link from the PUBLISHED plan's id before any reset.
        const publishedId = plan.id;
        const url = new URL('meals.html', window.location.href);
        url.searchParams.set('mealplan', publishedId);
        url.searchParams.set('user', did);
        shareSlot.replaceChildren(renderShareLink(url.toString()));
        // Also update the subscribable calendar (no-op unless enabled on this
        // device). Runs after the PDS write so listPublished sees the new plan;
        // a calendar failure never blocks publishing.
        void calendarClient.republish(listPublished);
        // Reset on publish (always): freeze the published record and start
        // fresh (a NEW local id, so the published rkey is never overwritten by
        // later edits) — the canvas is clear for the next plan.
        plan = store.save({ name: 'My meal plan', weeks: [emptyWeek()], mealsPerDay: plan.mealsPerDay });
        armed = null;
        dragging = null;
        filterText = '';
        filterInput.value = '';
        paletteOffset = 0;
        expandedDays.clear();
        anchorFreshPlan();
        rerender();
        renderChips();
      })
      .catch((err: unknown) => {
        shareSlot.replaceChildren(el('p', 'status', `publish failed: ${String(err)}`));
      })
      .finally(() => {
        publishBtn.disabled = false;
      });
  });
  shareSection.append(publishRow, shoppingList.panel, shareSlot);
  content.append(shareSection);

  // RUN-LAST-PLANNED (D3): the Meals page is the ONE writer of the derived
  // planned-index cache — the only page that already loads plan records. It
  // rebuilds after any plan mutation and after sync. The index is COMPUTED from
  // the records (never a stored counter); the durable PDS set is the user's full
  // history, unioned with any local-only (not-yet-synced) working plan.
  const plannedIndexCache = createPlannedIndexCache();
  const gatherPlans = async (): Promise<LocalPlan[]> => {
    const local = store.list();
    const a = syncAgent;
    if (a?.did === undefined) return local; // signed-out: the local set is the whole history
    try {
      const pds = you?.pds ?? (await resolveDidDoc(a.did)).pds;
      const byId = new Map(local.map((p) => [p.id, p]));
      for (const p of await listPdsPlans(pds, a.did)) byId.set(p.id, p); // durable wins
      return [...byId.values()];
    } catch {
      return local;
    }
  };
  const rebuildPlannedIndex = async (): Promise<void> => {
    try {
      const plans = await gatherPlans();
      await plannedIndexCache.write(buildPlannedIndex(plans, new Date()), fingerprintOf(plans));
    } catch (err) {
      log.debug('meal-plan', 'planned-index rebuild skipped', { error: String(err) });
    }
  };

  const persist = (): void => {
    recoveryNotice.hidden = true; // the canvas is being worked on — the resume offer is moot
    plan = store.save(
      {
        name: plan.name,
        weeks: plan.weeks,
        mealsPerDay: plan.mealsPerDay,
        ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
        ...(plan.editOf !== undefined ? { editOf: plan.editOf } : {}), // staged edits keep their source rkey
      },
      plan.id,
    );
    // Optimistic write-through: local save is instant; the PDS catches up in the
    // background when signed in (the record is the durable, cross-browser home).
    // A staged edit (editOf) is the exception — it stays local until "Publish
    // update" replaces the published record deliberately.
    if (syncAgent !== null && plan.editOf === undefined) {
      void syncPlanToPds(syncAgent, plan)
        .then(() => rebuildPlannedIndex()) // durable now — rebuild over full history
        .catch((err: unknown) => {
          log.warn('meal-plan', 'PDS sync failed', { error: String(err) });
        });
    } else if (syncAgent === null) {
      // Signed-out (no sync): the local set is the whole history — rebuild now.
      void rebuildPlannedIndex();
    }
    // A staged edit (editOf) rebuilds on its eventual "Publish update", not here.
  };

  // Anchor resolution on load (working plan only — a staged edit stays faithful
  // to its published record):
  //  1. ?start=YYYY-MM-DD in the URL wins, used as the exact start day (clamped
  //     forward if it names a past date).
  //  2. D7: a fresh, unanchored plan defaults to the next Monday so it is dated
  //     (calendar-eligible) by default. Only when unset — never clobbers a
  //     chosen date; clearing the input still returns the plan to "Week N".
  if (!editing) {
    const requestedRaw = routeParams.get('start')?.trim() ?? '';
    const requested = requestedRaw !== '' ? clampStart(requestedRaw) : null;
    if (requested !== null && requested !== plan.startDate) {
      plan.startDate = requested;
      startInput.value = requested;
      persist();
    } else if (plan.startDate === undefined) {
      const nm = nextMonday(todayIso);
      if (nm !== null) {
        plan.startDate = nm;
        startInput.value = nm;
        persist();
      }
    }
    syncStartToUrl();
  }

  const combined = (): PaletteItem[] => {
    const taste = tastePreference.load();
    const seen = new Set<string>();
    const out: PaletteItem[] = [];
    for (const it of sourceItems) {
      if (seen.has(it.uri)) continue;
      // Apply the standing taste preference — a "never" cuisine/category keeps
      // those recipes out of the placeable palette too (filter applies here).
      if (!matchesTaste({ cuisine: it.cuisine ?? null, category: it.category ?? null }, taste)) continue;
      seen.add(it.uri);
      out.push(it);
    }
    return out;
  };

  const renderSourceSwitch = (): void => {
    cookbookBtn.classList.toggle('src-btn--active', source === 'cookbook');
    browseBtn.classList.toggle('src-btn--active', source === 'browse');
  };

  const renderChips = (): void => {
    chips.replaceChildren();
    const page = paginatePalette(combined(), {
      query: filterText,
      cap: PALETTE_CAP,
      offset: paletteOffset,
    });
    const filtering = filterText.trim() !== '';
    // Sync the offset to the window paginatePalette actually returned (it clamps
    // a stale offset to the last page), so the arrows step from the right place.
    paletteOffset = filtering ? 0 : Math.max(0, page.start - 1);
    // Pager is meaningful only when browsing the unfiltered set across pages.
    const paged = !filtering && page.total > PALETTE_CAP;
    chipsHint.textContent = paged ? `Showing ${page.start}–${page.end} of ${page.total}` : '';
    prevBtn.hidden = !paged;
    nextBtn.hidden = !paged;
    prevBtn.disabled = !page.hasPrev;
    nextBtn.disabled = !page.hasNext;
    if (page.items.length === 0) {
      chips.append(el('p', 'status', 'No recipes here yet — switch source or add a cook by handle.'));
      return;
    }
    for (const item of page.items) {
      const chip = el('button', 'chip', item.name) as HTMLButtonElement;
      chip.type = 'button';
      chip.dataset['testid'] = 'palette-chip';
      chip.dataset['uri'] = item.uri;
      if (armed?.uri === item.uri) chip.classList.add('chip--armed');
      chip.addEventListener('click', () => {
        armed = armed?.uri === item.uri ? null : item;
        renderChips();
      });
      // Desktop drag (additive; touch uses tap-to-place).
      chip.draggable = true;
      chip.addEventListener('dragstart', (ev) => {
        dragging = { kind: 'palette', item };
        ev.dataTransfer?.setData('text/plain', item.uri);
      });
      chips.append(chip);
    }
  };

  const loadSource = async (): Promise<void> => {
    if (source === 'browse') {
      sourceItems = await loadStarterPalette();
    } else {
      // Cookbook (your authored + liked recipes) needs your identity — boot the
      // session lazily (defers the heavy auth client off the initial bundle).
      // Signed out there is no cookbook, so the palette comes back empty.
      if (you === null && signedInHint) {
        try {
          const { bootSession } = await import('../auth/boot.js');
          const { agent } = await bootSession();
          if (agent?.did !== undefined) {
            const { pds } = await resolveDidDoc(agent.did);
            you = { did: agent.did, pds };
          }
        } catch (err) {
          log.warn('meal-plan', 'auth for cookbook palette failed', { error: String(err) });
        }
      }
      sourceItems = await loadCookbookPalette(you === null ? {} : { you });
    }
    renderChips();
  };

  const setSource = (next: Source): void => {
    if (source === next) return;
    source = next;
    sourceItems = [];
    paletteOffset = 0; // a fresh source starts at the first page
    renderSourceSwitch();
    renderChips();
    void loadSource();
  };
  cookbookBtn.addEventListener('click', () => setSource('cookbook'));
  browseBtn.addEventListener('click', () => setSource('browse'));

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value;
    paletteOffset = 0; // re-filtering resets to the first page of results
    renderChips();
  });

  const renderBuilder = (): void => {
    const cap = plan.mealsPerDay;
    perDaySelect.value = String(cap); // keep the header control in sync with the plan
    // The start control leads the builder (above Week 1); it's a persistent
    // element (input value + listeners survive), re-slotted on each render.
    builder.replaceChildren(startRow);
    const start = plan.startDate;
    plan.weeks.forEach((week, wi) => {
      const row = el('div', 'week');
      row.dataset['testid'] = 'week-row';

      const head = el('div', 'week-head');
      const stacked = stackedWeeks.has(wi);
      // Left cluster: the day-layout toggle then the week name, kept together on
      // the head's left edge (the optional Remove button sits opposite, right).
      const headLeft = el('div', 'week-head-left');
      // Day-layout toggle: flips THIS week's days between the horizontal
      // 7-column grid and a vertical stack. The glyph reflects the CURRENT mode
      // (☰ stacked rows / ▥ columns); tapping swaps it. Each week owns its own.
      const layoutToggle = el('button', 'week-layout-toggle', stacked ? '☰' : '▥') as HTMLButtonElement;
      layoutToggle.type = 'button';
      layoutToggle.dataset['testid'] = 'week-layout-toggle';
      layoutToggle.dataset['week'] = String(wi);
      const modeLabel = stacked ? 'stacked rows' : 'columns';
      layoutToggle.setAttribute('aria-pressed', String(stacked));
      layoutToggle.setAttribute('aria-label', `Day layout: ${modeLabel} — tap to switch`);
      layoutToggle.title = `Day layout: ${modeLabel}`;
      layoutToggle.addEventListener('click', () => {
        if (stackedWeeks.has(wi)) stackedWeeks.delete(wi);
        else stackedWeeks.add(wi);
        rerender();
      });
      headLeft.append(layoutToggle);
      // Anchored, the week header carries its real span: "Week 1 (Aug 10 – Aug 16)".
      const spanStart = start !== undefined ? dateForSlot(start, wi, 0) : null;
      const spanEnd = start !== undefined ? dateForSlot(start, wi, 6) : null;
      const s = spanStart !== null ? formatShortDate(spanStart) : null;
      const e = spanEnd !== null ? formatShortDate(spanEnd) : null;
      headLeft.append(
        el('span', 'week-name', s !== null && e !== null ? `Week ${wi + 1} (${s} – ${e})` : `Week ${wi + 1}`),
      );
      head.append(headLeft);

      // Remove only makes sense with more than one week — you can't remove the
      // only week, so on a single-week plan the button is omitted entirely
      // (not just disabled). Repetition now lives in "⧉ Repeat".
      if (plan.weeks.length > 1) {
        const removeBtn = el('button', 'button week-remove', 'Remove') as HTMLButtonElement;
        removeBtn.type = 'button';
        removeBtn.dataset['testid'] = 'remove-week';
        removeBtn.addEventListener('click', () => {
          plan.weeks.splice(wi, 1);
          persist();
          rerender();
        });
        head.append(removeBtn);
      }
      row.append(head);

      const daysEl = el('div', stacked ? 'week-days week-days--stacked' : 'week-days');
      week.days.forEach((slot, di) => {
        const key = `${wi}:${di}`;
        const full = slot.meals.length >= cap;
        const expanded = expandedDays.has(key);
        const cell = el('div', 'day');
        cell.dataset['testid'] = 'day-slot';
        cell.dataset['day'] = String(di);
        if (slot.meals.length > 0) cell.classList.add('day--filled');
        if (full) cell.classList.add('day--full');
        if (expanded) cell.classList.add('day--expanded');
        // Armed + not full ⇒ the cell is the tap target that adds the next meal.
        cell.classList.add(armed !== null && !full ? 'day--placeable' : 'day--empty');

        // Grounded day card: the real calendar date rides the anchor (continuous
        // across weeks, +7 days each), and today's card gets the highlight.
        const dayIso = start !== undefined ? dateForSlot(start, wi, di) : null;
        if (dayIso !== null && dayIso === todayIso) cell.classList.add('is-today');

        // Header: the day label (+ its date when anchored, "Mon 8/10") + a
        // count, and the mobile expand toggle. Tapping the header expands the
        // day (a roomy panel for removing meals) UNLESS a recipe is armed —
        // then the whole cell is a placement target instead.
        const head = el('div', 'day-head');
        // Weekday follows the real date so a plan can start on any day; the fixed
        // Mon-first label is the fallback for an unanchored plan.
        const dow = (dayIso !== null ? formatWeekday(dayIso) : null) ?? DAY_LABELS[di];
        const dayLabel = el('span', 'day-label', dow);
        const dm = dayIso !== null ? formatDayMonth(dayIso) : null;
        if (dm !== null) dayLabel.append(' ', el('span', 'day-date', dm));
        head.append(dayLabel);
        if (slot.meals.length > 0 || cap > 1) {
          head.append(el('span', 'day-count', `${slot.meals.length}/${cap}`));
        }
        cell.append(head);

        // Tap-to-place primary: armed + under cap ⇒ append to the next open slot;
        // otherwise (nothing armed) the tap expands/collapses the day for editing.
        const onCellTap = (): void => {
          if (armed !== null && slot.meals.length < cap) {
            slot.meals.push({
              recipe: { uri: armed.uri, cid: armed.cid, name: armed.name },
              ...(armed.category !== undefined ? { category: armed.category } : {}),
            });
            armed = null;
            persist();
            renderChips();
            rerender();
          } else if (armed === null) {
            if (expandedDays.has(key)) expandedDays.delete(key);
            else expandedDays.add(key);
            rerender();
          }
        };
        cell.setAttribute('role', 'button');
        cell.addEventListener('click', onCellTap);

        // Desktop drag: every cell is a drop target; the same store mutations as
        // tap-to-place run on drop, so touch is unaffected (drag is additive).
        cell.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          cell.classList.add('day--over');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('day--over'));
        cell.addEventListener('drop', (ev) => {
          ev.preventDefault();
          cell.classList.remove('day--over');
          if (dragging === null) return;
          if (dragging.kind === 'palette') {
            if (slot.meals.length < cap) {
              slot.meals.push({
                recipe: { uri: dragging.item.uri, cid: dragging.item.cid, name: dragging.item.name },
                ...(dragging.item.category !== undefined ? { category: dragging.item.category } : {}),
              });
            }
          } else {
            const srcDay = plan.weeks[dragging.wi]?.days[dragging.di];
            if (srcDay !== undefined) {
              const [moved] = srcDay.meals.splice(dragging.mi, 1); // move out of source
              if (moved !== undefined) {
                if (slot.meals.length < cap) slot.meals.push(moved);
                else srcDay.meals.splice(dragging.mi, 0, moved); // target full: undo
              }
            }
          }
          dragging = null;
          armed = null;
          persist();
          renderChips();
          rerender();
        });

        // The placed meals, one row each: name (drag handle) + a × to remove.
        const mealsEl = el('div', 'day-meals');
        slot.meals.forEach((meal, mi) => {
          const mealEl = el('div', 'day-meal');
          mealEl.dataset['testid'] = 'day-meal';
          mealEl.draggable = true;
          mealEl.addEventListener('dragstart', (ev) => {
            dragging = { kind: 'meal', wi, di, mi };
            ev.dataTransfer?.setData('text/plain', 'meal');
          });
          const filled = el('span', 'slot-filled', mealLineText(meal));
          filled.dataset['testid'] = 'slot-filled';
          const clear = el('button', 'slot-clear', '×') as HTMLButtonElement;
          clear.type = 'button';
          clear.dataset['testid'] = 'slot-clear';
          clear.setAttribute('aria-label', `Remove ${meal.recipe.name}`);
          clear.addEventListener('click', (ev) => {
            ev.stopPropagation();
            slot.meals.splice(mi, 1);
            persist();
            rerender();
          });
          mealEl.append(filled, clear);
          mealsEl.append(mealEl);
        });
        cell.append(mealsEl);

        // Expanded (mobile-focused) footer: clear the whole day in one tap.
        if (expanded && slot.meals.length > 0) {
          const clearDay = el('button', 'button day-clear', 'Clear day') as HTMLButtonElement;
          clearDay.type = 'button';
          clearDay.dataset['testid'] = 'clear-day';
          clearDay.addEventListener('click', (ev) => {
            ev.stopPropagation();
            slot.meals = [];
            persist();
            rerender();
          });
          cell.append(clearDay);
        }

        daysEl.append(cell);
      });
      row.append(daysEl);
      builder.append(row);
    });

    const actions = el('div', 'week-actions');

    const addBtn = el('button', 'button button--primary add-week', '+ Add') as HTMLButtonElement;
    addBtn.type = 'button';
    addBtn.dataset['testid'] = 'add-week';
    addBtn.disabled = plan.weeks.length >= MAX_WEEKS;
    addBtn.addEventListener('click', () => {
      if (plan.weeks.length >= MAX_WEEKS) return;
      plan.weeks.push(emptyWeek());
      persist();
      rerender();
    });

    // Repeat weeks: instead of adding a blank week, append a copy of
    // every currently-planned week (with its placed meals). Doubling the plan,
    // so it's disabled when that would blow past the max-week cap. Icon-only
    // (⧉) — the accessible name lives on aria-label/title.
    const repeatBtn = el('button', 'button repeat-weeks', '⧉') as HTMLButtonElement;
    repeatBtn.type = 'button';
    repeatBtn.dataset['testid'] = 'repeat-weeks';
    repeatBtn.setAttribute('aria-label', 'Repeat planned weeks');
    repeatBtn.title = 'Repeat planned weeks';
    repeatBtn.disabled = plan.weeks.length * 2 > MAX_WEEKS;
    repeatBtn.addEventListener('click', () => {
      const next = duplicateWeeks(plan.weeks, MAX_WEEKS);
      if (next === plan.weeks) return; // would exceed the cap — no-op
      plan.weeks = next;
      persist();
      rerender();
    });

    // Add leads on the left, Repeat right-aligned opposite it (space-between);
    // the plan Reset rides the start row up top beside the "Starts" picker.
    actions.append(addBtn, repeatBtn);
    builder.append(actions);
  };

  const rerender = (): void => {
    renderBuilder();
  };

  // Reset (start row, right-aligned): clear the plan back to a single empty week
  // — drops every placement and the start date, then persists (write-through to
  // the PDS when signed in). Destructive + synced, so it takes an inline two-step
  // confirm (mirrors the recipe Hide control — no native dialog).
  const renderResetControl = (): void => {
    resetControl.replaceChildren();
    // Reset-surface v2 (D5): the shared reset icon button (src/icons.ts) — the
    // same counterclockwise glyph as the toolbar reset. Destructive weight lives
    // in the confirm step below, not the glyph; the clockwise direction stays
    // RESERVED for the calendar Resync in the title row above.
    const reset = resetIconButton('Reset plan');
    reset.dataset['testid'] = 'reset-plan';
    reset.addEventListener('click', () => {
      resetControl.replaceChildren();
      const note = el('span', 'reset-confirm-note', 'Reset the plan? ');
      const confirm = el('button', 'button', 'Confirm') as HTMLButtonElement;
      confirm.type = 'button';
      confirm.dataset['testid'] = 'reset-confirm';
      confirm.addEventListener('click', () => {
        // Start a FRESH plan (new local id), don't overwrite the current record —
        // if it was published, its shared link must survive a reset. The blank
        // plan stays local until you place something (no empty PDS record).
        plan = store.save({ name: 'My meal plan', weeks: [emptyWeek()], mealsPerDay: plan.mealsPerDay });
        armed = null;
        dragging = null;
        filterText = '';
        filterInput.value = '';
        paletteOffset = 0;
        expandedDays.clear();
        anchorFreshPlan();
        renderResetControl();
        rerender();
        renderChips();
      });
      const cancel = el('button', 'button', 'Cancel') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.dataset['testid'] = 'reset-cancel';
      cancel.addEventListener('click', () => renderResetControl());
      resetControl.append(note, confirm, cancel);
    });
    resetControl.append(reset);
  };
  // Edit mode has no Reset — "Discard edits" (the banner) is the way out of a
  // staged copy; Reset's fresh-working-plan semantics don't apply there.
  if (!editing) renderResetControl();

  mountShell(app, content);
  rerender();
  renderSourceSwitch();
  renderChips();

  // Palette load: a test/dev seed short-circuits the network; otherwise load the
  // real source (deps.palette, if injected, overrides both — for future tests).
  if (deps.palette !== undefined) {
    sourceItems = await deps.palette();
    renderChips();
  } else {
    const seed = readSeed();
    if (seed.length > 0) {
      sourceItems = seed;
      renderChips();
    } else {
      void loadSource();
    }
  }

  // PDS sync (signed in): boot the session lazily and enable write-through.
  // Recovery v2 (plans/2026-07-16-3, follow-up): remote plans are NEVER copied
  // into the local store or adopted as the working plan — a PDS record may be
  // published (its share link in others' hands), and adoption would let the
  // write-through above live-edit it. Instead, when this load created a fresh
  // canvas that is still untouched, offer the most recent record back through
  // the staged edit flow (the notice above). Signed-out stays local-only — no
  // auth, no network. Skipped in edit mode: the eager boot already set the
  // agent, and the canvas already holds the staged plan.
  if (signedInHint && !editing) {
    void (async () => {
      try {
        const { bootSession } = await import('../auth/boot.js');
        const { agent } = await bootSession();
        if (agent?.did === undefined) return;
        syncAgent = agent;
        const { pds } = await resolveDidDoc(agent.did);
        const remote = await listPdsPlans(pds, agent.did);
        void rebuildPlannedIndex(); // signed-in: refresh the index over the durable history
        // Only a fresh, still-untouched canvas gets the offer (checked NOW, not
        // at load: the user may have started placing while the list loaded).
        const untouched =
          createdFresh &&
          plan.weeks.length === 1 &&
          plan.weeks.every((w) => w.days.every((s) => s.meals.length === 0));
        const latest = latestPlan(remote);
        if (!untouched || latest === undefined) return;
        renderRecoveryNotice(latest, remote.length);
        log.info('meal-plan', 'offering PDS recovery', { count: remote.length, latest: latest.id });
      } catch (err) {
        log.warn('meal-plan', 'PDS plan recovery failed', { error: String(err) });
      }
    })();
  }

  // Initial rebuild so a reader (Browse / Cookbook / recipe page) has a fresh
  // index without waiting for the next mutation. Signed-out uses the local set;
  // the signed-in boot above rebuilds again over the durable history.
  void rebuildPlannedIndex();

  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'meals', signedIn: signedInHint });
  void registerServiceWorker();
};

void main();
