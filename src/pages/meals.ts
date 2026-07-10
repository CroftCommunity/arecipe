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

import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { expandCalendar } from '../recipes/meal-plan.js';
import {
  createMealPlanStore,
  type LocalPlan,
  type LocalWeek,
  type MealPlanStore,
} from '../recipes/meal-plan-local.js';
import {
  loadCookbookPalette,
  loadHandlePalette,
  loadStarterPalette,
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
const REPEAT_MIN = 1;
const REPEAT_MAX = 12;
const PALETTE_SEED_KEY = 'arecipe.meals.palette-seed';
/** Unfiltered, the palette shows at most this many chips so it can't run down
 * half the page; the filter (type-ahead) searches the whole loaded set. */
const PALETTE_CAP = 10;

const emptyWeek = (): LocalWeek => ({ repeat: 1, days: Array.from({ length: 7 }, () => ({})) });

const clampRepeat = (raw: number): number => {
  const n = Math.floor(raw);
  if (!Number.isFinite(n) || n < REPEAT_MIN) return REPEAT_MIN;
  return Math.min(REPEAT_MAX, n);
};

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

export const main = async (
  deps: { palette?: PaletteProvider; store?: MealPlanStore } = {},
): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const store = deps.store ?? createMealPlanStore();
  const signedInHint = sessionHintSignedIn();

  // Single implicit plan (v1): edit the first plan, creating one if absent.
  let plan: LocalPlan = store.list()[0] ?? store.save({ name: 'My meal plan', weeks: [emptyWeek()] });
  let armed: PaletteItem | null = null;
  let dragging: Dragging | null = null;

  // Palette state: items from the active source + items added by handle, filtered.
  let source: Source = signedInHint ? 'cookbook' : 'browse';
  let sourceItems: PaletteItem[] = [];
  let addedItems: PaletteItem[] = [];
  let filterText = '';
  let you: { did: string; pds: string } | null = null;

  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Meals'));

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
  const chipsHint = el('p', 'status palette-hint');
  chipsHint.dataset['testid'] = 'palette-hint';
  palette.append(chipsHint);

  const builder = el('div', 'builder');
  builder.dataset['testid'] = 'builder';
  planner.append(palette, builder);
  content.append(planner);

  const calendar = el('section', 'calendar');
  calendar.dataset['testid'] = 'calendar';
  calendar.append(el('h3', 'palette-title', 'Calendar'));
  const calBody = el('div', 'cal-body');
  calendar.append(calBody);
  content.append(calendar);

  const persist = (): void => {
    plan = store.save(
      {
        name: plan.name,
        weeks: plan.weeks,
        ...(plan.startDate !== undefined ? { startDate: plan.startDate } : {}),
      },
      plan.id,
    );
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

  const matches = (): PaletteItem[] => {
    const q = filterText.trim().toLowerCase();
    const all = combined();
    // Type-ahead searches the whole set; unfiltered, bound the list to the cap.
    return q === '' ? all : all.filter((i) => i.name.toLowerCase().includes(q));
  };
  const shown = (): PaletteItem[] =>
    filterText.trim() === '' ? matches().slice(0, PALETTE_CAP) : matches();

  const renderSourceSwitch = (): void => {
    cookbookBtn.classList.toggle('src-btn--active', source === 'cookbook');
    browseBtn.classList.toggle('src-btn--active', source === 'browse');
  };

  const renderChips = (): void => {
    chips.replaceChildren();
    const list = shown();
    const total = combined().length;
    // Hint when the unfiltered list is capped — tells the user to type to reach
    // the rest, so a bounded list never looks like the whole corpus.
    chipsHint.textContent =
      filterText.trim() === '' && total > list.length
        ? `Showing ${list.length} of ${total} — type to filter.`
        : '';
    if (list.length === 0) {
      chips.append(el('p', 'status', 'No recipes here yet — switch source or add a cook by handle.'));
      return;
    }
    for (const item of list) {
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
    renderSourceSwitch();
    renderChips();
    void loadSource();
  };
  cookbookBtn.addEventListener('click', () => setSource('cookbook'));
  browseBtn.addEventListener('click', () => setSource('browse'));

  filterInput.addEventListener('input', () => {
    filterText = filterInput.value;
    renderChips();
  });

  handleAdd.addEventListener('click', () => {
    const handle = handleInput.value.trim();
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
  });

  const renderCalendar = (): void => {
    calBody.replaceChildren();
    const anyPlanned = plan.weeks.some((w) => w.days.some((s) => s.recipe !== undefined));
    if (!anyPlanned) {
      const empty = el(
        'p',
        'empty-state',
        'Nothing planned yet — place a recipe on a day to see your calendar.',
      );
      empty.dataset['testid'] = 'calendar-empty';
      calBody.append(empty);
      return;
    }
    for (const cw of expandCalendar(plan.weeks)) {
      const src = plan.weeks[cw.week - 1];
      if (src === undefined) continue;
      const row = el('div', 'cal-week');
      row.dataset['testid'] = 'cal-week';
      row.dataset['week'] = String(cw.week);
      const label = src.repeat > 1 ? `Week ${cw.week} · ${cw.rep} of ${src.repeat}` : `Week ${cw.week}`;
      row.append(el('div', 'cal-week-label', label));
      const daysEl = el('div', 'cal-days');
      src.days.forEach((slot, di) => {
        const cell = el('div', 'cal-day');
        cell.append(el('span', 'day-label', DAY_LABELS[di]));
        if (slot.recipe !== undefined) {
          cell.classList.add('day--filled');
          cell.append(el('span', 'cal-slot', slot.recipe.name));
        }
        daysEl.append(cell);
      });
      row.append(daysEl);
      calBody.append(row);
    }
  };

  const renderBuilder = (): void => {
    builder.replaceChildren();
    plan.weeks.forEach((week, wi) => {
      const row = el('div', 'week');
      row.dataset['testid'] = 'week-row';

      const head = el('div', 'week-head');
      head.append(el('span', 'week-name', `Week ${wi + 1}`));

      const repeatWrap = el('label', 'week-repeat-wrap');
      repeatWrap.append(el('span', 'week-repeat-label', 'Repeat'));
      const repeatInput = el('input', 'week-repeat') as HTMLInputElement;
      repeatInput.type = 'number';
      repeatInput.min = String(REPEAT_MIN);
      repeatInput.max = String(REPEAT_MAX);
      repeatInput.value = String(week.repeat);
      repeatInput.dataset['testid'] = 'week-repeat';
      repeatInput.addEventListener('change', () => {
        const clamped = clampRepeat(Number(repeatInput.value));
        week.repeat = clamped;
        repeatInput.value = String(clamped);
        persist();
        rerender();
      });
      repeatWrap.append(repeatInput);
      head.append(repeatWrap);

      const removeBtn = el('button', 'button week-remove', 'Remove') as HTMLButtonElement;
      removeBtn.type = 'button';
      removeBtn.dataset['testid'] = 'remove-week';
      removeBtn.disabled = plan.weeks.length <= 1;
      removeBtn.addEventListener('click', () => {
        if (plan.weeks.length <= 1) return;
        plan.weeks.splice(wi, 1);
        persist();
        rerender();
      });
      head.append(removeBtn);
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
    builder.append(addBtn);
  };

  const rerender = (): void => {
    renderBuilder();
    renderCalendar();
  };

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

  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'meals', signedIn: signedInHint });
  void registerServiceWorker();
};

void main();
