// Meals planner page. Phase 1 route → Phase 5 builder → Phase 6 calendar →
// Phase 7 real palette: two sources behind a switch (My Cookbook / Browse) plus
// add-a-cook-by-handle, reusing arecipe's existing feed reads. Drag (Phase 8)
// and PDS sync (Phase 9) build on this.
//
// The planner works signed-out: Browse (the starter feed) needs no auth and is
// the default when signed out; My Cookbook needs your identity, so it lazily
// (dynamic-import) boots the session only when that source is chosen — the
// initial bundle stays free of the heavy auth client. The local store is the
// in-flight buffer; the PDS record (Phase 9) is the durable home.

import type { Agent } from '@atproto/api';
import { mountBuildStamp } from '../build-stamp.js';
import { attachActorTypeahead } from '../identity/actor-typeahead.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { createResolver } from '../identity/resolve.js';
import { expandCalendar } from '../recipes/meal-plan.js';
import { dateForSlot, formatShortDate, weekRangeLabel } from '../recipes/meal-plan-dates.js';
import {
  createMealPlanStore,
  duplicateWeeks,
  type LocalPlan,
  type LocalWeek,
  type MealPlanStore,
} from '../recipes/meal-plan-local.js';
import { getPdsPlan, listPdsPlans, removePlanFromPds, syncPlanToPds } from '../recipes/meal-plan-sync.js';
import {
  loadCookbookPalette,
  loadHandlePalette,
  loadStarterPalette,
  paginatePalette,
  type PaletteItem,
} from '../recipes/meal-plan-palette.js';
import { registerServiceWorker } from '../sw-register.js';

export type PaletteProvider = () => Promise<PaletteItem[]>;
type Source = 'cookbook' | 'browse';
/** In-flight drag payload (Phase 8 desktop enhancement): a palette chip or an
 * already-placed slot being moved. Tap-to-place remains the touch-safe primary. */
type Dragging = { kind: 'palette'; item: PaletteItem } | { kind: 'slot'; wi: number; di: number };

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
const emptyWeek = (): LocalWeek => ({ repeat: 1, days: Array.from({ length: 7 }, () => ({})) });

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

/** Build the calendar rows for a plan: one `.cal-week` per expanded week, days
 *  labelled with real dates when the plan has a `startDate` (the first Monday).
 *  Shared by the planner (read-only names) and the shared view (`linkRecipes`
 *  makes each placed meal a link to its recipe). Returns the empty-state element
 *  when nothing is planned. Pure. */
const buildCalendarRows = (plan: LocalPlan, opts: { linkRecipes: boolean }): HTMLElement[] => {
  const anyPlanned = plan.weeks.some((w) => w.days.some((s) => s.recipe !== undefined));
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
      cell.append(el('span', 'day-label', shortDay !== null ? `${DAY_LABELS[di]} ${shortDay}` : DAY_LABELS[di]));
      if (slot.recipe !== undefined) {
        cell.classList.add('day--filled');
        if (opts.linkRecipes) {
          const link = el('a', 'cal-slot', slot.recipe.name) as HTMLAnchorElement;
          link.href = `./recipe.html?u=${encodeURIComponent(slot.recipe.uri)}`;
          link.dataset['testid'] = 'shared-meal';
          cell.append(link);
        } else {
          cell.append(el('span', 'cal-slot', slot.recipe.name));
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
    head.append(el('h3', 'palette-title', planTitle(plan)));
    const calendar = el('section', 'calendar');
    for (const row of buildCalendarRows(plan, { linkRecipes: true })) calendar.append(row);
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

/** Your published meal plans (a Meals subpage: `meals.html?plans`). Signed-in
 *  only — lists the account's app.arecipe.mealPlan records with their week range
 *  and publish date, a link to the shareable view, and a guarded delete. */
const showPublishedPlans = async (app: HTMLElement): Promise<void> => {
  const content = el('section', 'panel');
  const header = el('div', 'meals-header');
  header.append(el('h2', 'section-title', 'Your published plans'));
  const back = el('a', 'friend-link', '‹ Back to planner') as HTMLAnchorElement;
  back.href = './meals.html';
  back.dataset['testid'] = 'plans-back';
  header.append(back);
  content.append(header);
  const body = el('div');
  body.dataset['testid'] = 'published-plans';
  content.append(body);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  body.replaceChildren(el('p', 'status', 'loading your published plans…'));
  let agent: Agent | null = null;
  try {
    const { bootSession } = await import('../auth/boot.js');
    ({ agent } = await bootSession());
  } catch (err) {
    log.warn('meal-plan', 'auth for published plans failed', { error: String(err) });
  }
  if (agent === null || agent.did === undefined) {
    body.replaceChildren(el('p', 'status', 'Sign in to see your published meal plans.'));
    return;
  }
  const did = agent.did;
  const boundAgent = agent;
  try {
    const { pds } = await resolveDidDoc(did);
    const plans = await listPdsPlans(pds, did);
    const render = (list: LocalPlan[]): void => {
      if (list.length === 0) {
        body.replaceChildren(
          el('p', 'empty-state', 'No published meal plans yet — Publish one from the planner.'),
        );
        return;
      }
      body.replaceChildren();
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
                .then(() => render(list.filter((x) => x.id !== plan.id)))
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

        row.append(info, del);
        body.append(row);
      }
    };
    render(plans);
    log.debug('shell', 'mounted', { page: 'meals', view: 'published-plans' });
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
  // "Your published plans" subpage (signed-in management view).
  if (routeParams.get('plans') !== null) {
    await showPublishedPlans(app);
    return;
  }

  const store = deps.store ?? createMealPlanStore();
  const signedInHint = sessionHintSignedIn();

  // Single implicit plan (v1): edit the first plan, creating one if absent.
  const existing = store.list()[0];
  let plan: LocalPlan = existing ?? store.save({ name: 'My meal plan', weeks: [emptyWeek()] });
  const createdFresh = existing === undefined; // for PDS-recovery reconciliation
  let armed: PaletteItem | null = null;
  let dragging: Dragging | null = null;
  // Set once the session is booted (signed in): enables write-through to the PDS.
  let syncAgent: Agent | null = null;

  // Palette state: items from the active source + items added by handle, filtered.
  let source: Source = signedInHint ? 'cookbook' : 'browse';
  let sourceItems: PaletteItem[] = [];
  let addedItems: PaletteItem[] = [];
  let filterText = '';
  // Unfiltered, the palette shows one page (PALETTE_CAP) at a time; the arrows
  // step this offset so a browser can cycle recipes they'd not know to search.
  let paletteOffset = 0;
  let you: { did: string; pds: string } | null = null;

  const content = el('section', 'panel');
  // Title row: "Meals" on the left, a right-aligned "Reset" that clears the plan
  // back to a single empty week (inline two-step confirm — it's destructive and
  // syncs). Wired below, once persist/rerender exist.
  const header = el('div', 'meals-header');
  header.append(el('h2', 'section-title', 'Meals'));
  const headerActions = el('div', 'meals-actions');
  const plansLink = el('a', 'button meals-plans', 'My plans') as HTMLAnchorElement;
  plansLink.href = './meals.html?plans';
  plansLink.dataset['testid'] = 'my-plans';
  const resetControl = el('div', 'meals-reset');
  headerActions.append(plansLink, resetControl);
  header.append(headerActions);
  content.append(header);

  const planner = el('div', 'meal-planner');
  const palette = el('aside', 'palette');
  palette.dataset['testid'] = 'palette';

  // Add-a-cook is a SECONDARY discovery mode (primary is the Browse tab): pull
  // in a specific cook whose recipes aren't already in your corpus. It sits
  // above the Recipes picker so it reads as a distinct affordance.
  const addCook = el('div', 'palette-addcook');
  addCook.append(el('span', 'palette-addcook-label', 'Add a cook by handle'));
  const handleRow = el('div', 'palette-handle');
  const handleInput = el('input', 'handle-input') as HTMLInputElement;
  handleInput.type = 'text';
  handleInput.placeholder = 'a cook’s handle — try rdur.dev';
  handleInput.dataset['testid'] = 'palette-handle-input';
  const handleAdd = el('button', 'button', 'Add') as HTMLButtonElement;
  handleAdd.type = 'button';
  handleAdd.dataset['testid'] = 'palette-handle-add';
  handleRow.append(handleInput, handleAdd);
  addCook.append(handleRow);
  palette.append(addCook);

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

  const calendar = el('section', 'calendar');
  calendar.dataset['testid'] = 'calendar';
  calendar.append(el('h3', 'palette-title', 'Calendar'));

  // Start-date control: anchor the plan on its first Monday so the calendar lays
  // out real dates. Empty clears the anchor (back to abstract "Week N").
  const startRow = el('label', 'cal-start');
  startRow.append(el('span', 'cal-start-label', 'Starts (first Monday)'));
  const startInput = el('input', 'cal-start-input') as HTMLInputElement;
  startInput.type = 'date';
  startInput.dataset['testid'] = 'plan-start-date';
  if (plan.startDate !== undefined) startInput.value = plan.startDate;
  startInput.addEventListener('change', () => {
    const v = startInput.value.trim();
    if (v === '') delete plan.startDate;
    else plan.startDate = v;
    persist();
    renderCalendar();
  });
  startRow.append(startInput);
  calendar.append(startRow);

  const calBody = el('div', 'cal-body');
  calendar.append(calBody);
  content.append(calendar);

  // Publish: the plan already syncs on every change; publishing surfaces a
  // shareable, date-aligned link anyone (incl. anon) can open — the same link
  // also lists on the "My plans" subpage. Signed-in only.
  const shareSection = el('section', 'plan-share');
  const publishBtn = el('button', 'button button--primary', 'Publish') as HTMLButtonElement;
  publishBtn.type = 'button';
  publishBtn.dataset['testid'] = 'publish-plan';
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
      .then(() => {
        const url = new URL('meals.html', window.location.href);
        url.searchParams.set('mealplan', plan.id);
        url.searchParams.set('user', did);
        shareSlot.replaceChildren(renderShareLink(url.toString()));
      })
      .catch((err: unknown) => {
        shareSlot.replaceChildren(el('p', 'status', `publish failed: ${String(err)}`));
      })
      .finally(() => {
        publishBtn.disabled = false;
      });
  });
  shareSection.append(publishBtn, shareSlot);
  content.append(shareSection);

  const persist = (): void => {
    plan = store.save(
      {
        name: plan.name,
        weeks: plan.weeks,
        ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
      },
      plan.id,
    );
    // Optimistic write-through: local save is instant; the PDS catches up in the
    // background when signed in (the record is the durable, cross-browser home).
    if (syncAgent !== null) {
      void syncPlanToPds(syncAgent, plan).catch((err: unknown) => {
        log.warn('meal-plan', 'PDS sync failed', { error: String(err) });
      });
    }
  };

  const combined = (): PaletteItem[] => {
    const seen = new Set<string>();
    const out: PaletteItem[] = [];
    for (const it of [...sourceItems, ...addedItems]) {
      if (seen.has(it.uri)) continue;
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
      // Cookbook needs your identity — boot the session lazily (defers the heavy
      // auth client off the initial bundle). Signed out, resolves starters only.
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

  // Add-a-cook, shared by the Add button and a typeahead pick.
  const addCookByHandle = (handle: string): void => {
    if (handle === '') return;
    handleAdd.disabled = true;
    void loadHandlePalette(handle)
      .then((added) => {
        addedItems = [...addedItems, ...added];
        handleInput.value = '';
        renderChips();
      })
      .finally(() => {
        handleAdd.disabled = false;
      });
  };

  handleAdd.addEventListener('click', () => addCookByHandle(handleInput.value.trim()));

  // Cook-search typeahead on the add-a-cook input: suggest accounts as you type,
  // so pulling in a specific cook doesn't require their exact handle. Picking a
  // suggestion runs the same add path as the Add button.
  attachActorTypeahead({
    input: handleInput,
    onSelect: (suggestion) => {
      handleInput.value = suggestion.handle;
      addCookByHandle(suggestion.handle);
    },
  });

  const renderCalendar = (): void => {
    // The planner calendar shows names (not links); dates appear once a start
    // date is set. Same builder as the shared view (buildCalendarRows).
    calBody.replaceChildren(...buildCalendarRows(plan, { linkRecipes: false }));
  };

  const renderBuilder = (): void => {
    builder.replaceChildren();
    plan.weeks.forEach((week, wi) => {
      const row = el('div', 'week');
      row.dataset['testid'] = 'week-row';

      const head = el('div', 'week-head');
      head.append(el('span', 'week-name', `Week ${wi + 1}`));

      // Remove only makes sense with more than one week — you can't remove the
      // only week, so on a single-week plan the button is omitted entirely
      // (not just disabled). Repetition now lives in "Repeat planned weeks".
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

      const daysEl = el('div', 'week-days');
      week.days.forEach((slot, di) => {
        const cell = el('div', 'day');
        cell.dataset['testid'] = 'day-slot';
        cell.dataset['day'] = String(di);
        cell.append(el('span', 'day-label', DAY_LABELS[di]));

        // Desktop drag: every cell is a drop target; the same store mutations
        // as tap-to-place run on drop, so touch is unaffected (drag is additive).
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
            week.days[di] = {
              recipe: { uri: dragging.item.uri, cid: dragging.item.cid, name: dragging.item.name },
            };
          } else {
            const srcWeek = plan.weeks[dragging.wi];
            if (srcWeek !== undefined) {
              const moved = srcWeek.days[dragging.di] ?? {};
              const displaced = week.days[di] ?? {};
              week.days[di] = moved; // move (or swap if the target was filled)
              srcWeek.days[dragging.di] = displaced;
            }
          }
          dragging = null;
          armed = null;
          persist();
          renderChips();
          rerender();
        });

        const placed = slot.recipe;
        if (placed !== undefined) {
          cell.classList.add('day--filled');
          // Drag a filled slot to another day to move/swap it.
          cell.draggable = true;
          cell.addEventListener('dragstart', (ev) => {
            dragging = { kind: 'slot', wi, di };
            ev.dataTransfer?.setData('text/plain', 'slot');
          });
          const filled = el('span', 'slot-filled', placed.name);
          filled.dataset['testid'] = 'slot-filled';
          const clear = el('button', 'slot-clear', '×') as HTMLButtonElement;
          clear.type = 'button';
          clear.dataset['testid'] = 'slot-clear';
          clear.setAttribute('aria-label', `Clear ${placed.name}`);
          clear.addEventListener('click', (ev) => {
            ev.stopPropagation();
            week.days[di] = {};
            persist();
            rerender();
          });
          cell.append(filled, clear);
        } else {
          cell.classList.add('day--empty');
          cell.setAttribute('role', 'button');
          cell.addEventListener('click', () => {
            if (armed === null) return;
            week.days[di] = { recipe: { uri: armed.uri, cid: armed.cid, name: armed.name } };
            armed = null;
            persist();
            renderChips();
            rerender();
          });
        }
        daysEl.append(cell);
      });
      row.append(daysEl);
      builder.append(row);
    });

    const actions = el('div', 'week-actions');

    const addBtn = el('button', 'button button--primary add-week', '+ Add week') as HTMLButtonElement;
    addBtn.type = 'button';
    addBtn.dataset['testid'] = 'add-week';
    addBtn.disabled = plan.weeks.length >= MAX_WEEKS;
    addBtn.addEventListener('click', () => {
      if (plan.weeks.length >= MAX_WEEKS) return;
      plan.weeks.push(emptyWeek());
      persist();
      rerender();
    });

    // Repeat planned weeks: instead of adding a blank week, append a copy of
    // every currently-planned week (with its placed meals). Doubling the plan,
    // so it's disabled when that would blow past the max-week cap.
    const repeatBtn = el('button', 'button repeat-weeks', '⧉ Repeat planned weeks') as HTMLButtonElement;
    repeatBtn.type = 'button';
    repeatBtn.dataset['testid'] = 'repeat-weeks';
    repeatBtn.disabled = plan.weeks.length * 2 > MAX_WEEKS;
    repeatBtn.addEventListener('click', () => {
      const next = duplicateWeeks(plan.weeks, MAX_WEEKS);
      if (next === plan.weeks) return; // would exceed the cap — no-op
      plan.weeks = next;
      persist();
      rerender();
    });

    actions.append(addBtn, repeatBtn);
    builder.append(actions);
  };

  const rerender = (): void => {
    renderBuilder();
    renderCalendar();
  };

  // Reset (title row, right-aligned): clear the plan back to a single empty week
  // — drops every placement and the start date, then persists (write-through to
  // the PDS when signed in). Destructive + synced, so it takes an inline two-step
  // confirm (mirrors the recipe Hide control — no native dialog).
  const renderResetControl = (): void => {
    resetControl.replaceChildren();
    const reset = el('button', 'button meals-reset-btn', 'Reset') as HTMLButtonElement;
    reset.type = 'button';
    reset.dataset['testid'] = 'reset-plan';
    reset.addEventListener('click', () => {
      resetControl.replaceChildren();
      const note = el('span', 'reset-confirm-note', 'Reset the plan? ');
      const confirm = el('button', 'button', 'Confirm') as HTMLButtonElement;
      confirm.type = 'button';
      confirm.dataset['testid'] = 'reset-confirm';
      confirm.addEventListener('click', () => {
        plan = store.save({ name: plan.name, weeks: [emptyWeek()] }, plan.id);
        if (syncAgent !== null) {
          void syncPlanToPds(syncAgent, plan).catch((err: unknown) => {
            log.warn('meal-plan', 'PDS sync failed', { error: String(err) });
          });
        }
        armed = null;
        dragging = null;
        filterText = '';
        filterInput.value = '';
        paletteOffset = 0;
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
  renderResetControl();

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

  // PDS sync (signed in): boot the session lazily, enable write-through, and
  // recover any plans that live on the PDS but are missing locally (fresh
  // browser / eviction). Signed-out stays local-only — no auth, no network.
  if (signedInHint) {
    void (async () => {
      try {
        const { bootSession } = await import('../auth/boot.js');
        const { agent } = await bootSession();
        if (agent?.did === undefined) return;
        syncAgent = agent;
        const { pds } = await resolveDidDoc(agent.did);
        const remote = await listPdsPlans(pds, agent.did);
        let recovered = 0;
        for (const rp of remote) {
          if (store.get(rp.id) === undefined) {
            store.save(
              { name: rp.name, weeks: rp.weeks, ...(rp.startDate !== undefined ? { startDate: rp.startDate } : {}) },
              rp.id,
            );
            recovered += 1;
          }
        }
        if (recovered > 0) {
          // v1 single-plan reconciliation: if we created an empty plan this load
          // and it is still untouched, adopt the recovered plan instead.
          const untouched =
            createdFresh &&
            plan.weeks.length === 1 &&
            plan.weeks.every((w) => w.days.every((s) => s.recipe === undefined));
          if (untouched) {
            store.remove(plan.id);
            plan = store.list()[0] ?? plan;
          }
          log.info('meal-plan', 'recovered from PDS', { count: recovered });
          rerender();
        }
      } catch (err) {
        log.warn('meal-plan', 'PDS plan recovery failed', { error: String(err) });
      }
    })();
  }

  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'meals', signedIn: signedInHint });
  void registerServiceWorker();
};

void main();
