// Meals planner page. Phase 1 stood up the route; Phase 5 grew it into the
// week builder (palette + tap-to-place + local persistence); Phase 6 adds the
// per-week repeat control and the calendar below, which stamps each week
// `repeat` times via the model's pure expandCalendar. The real Cookbook/Browse
// palette (Phase 7), drag (Phase 8), and PDS sync (Phase 9) build on this.
//
// The planner works signed-out: the local store is the in-flight buffer; the
// PDS record (Phase 9) is the durable, cross-browser home.

import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { expandCalendar } from '../recipes/meal-plan.js';
import {
  createMealPlanStore,
  type LocalPlan,
  type LocalWeek,
  type MealPlanStore,
} from '../recipes/meal-plan-local.js';
import { registerServiceWorker } from '../sw-register.js';

/** A placeable recipe: strong-ref material plus a display name. */
export type PaletteItem = { uri: string; cid: string; name: string };
export type PaletteProvider = () => Promise<PaletteItem[]>;

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

const emptyWeek = (): LocalWeek => ({ repeat: 1, days: Array.from({ length: 7 }, () => ({})) });

const clampRepeat = (raw: number): number => {
  const n = Math.floor(raw);
  if (!Number.isFinite(n) || n < REPEAT_MIN) return REPEAT_MIN;
  return Math.min(REPEAT_MAX, n);
};

/** Default palette provider (Phase 5): an optional localStorage seed, inert in
 * production. Phase 7 replaces this with the real Cookbook/Browse providers. */
const seededPalette: PaletteProvider = async () => {
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
  const provider = deps.palette ?? seededPalette;

  // Single implicit plan (v1): edit the first plan, creating one if absent.
  let plan: LocalPlan = store.list()[0] ?? store.save({ name: 'My meal plan', weeks: [emptyWeek()] });
  let armed: PaletteItem | null = null;
  let items: PaletteItem[] = [];

  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Meals'));

  const planner = el('div', 'meal-planner');
  const palette = el('aside', 'palette');
  palette.dataset['testid'] = 'palette';
  palette.append(el('h3', 'palette-title', 'Recipes'));
  const chips = el('div', 'palette-chips');
  palette.append(chips);
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

  const renderChips = (): void => {
    chips.replaceChildren();
    if (items.length === 0) {
      chips.append(el('p', 'status', 'No recipes yet — your Cookbook fills this in a later build.'));
      return;
    }
    for (const item of items) {
      const chip = el('button', 'chip', item.name) as HTMLButtonElement;
      chip.type = 'button';
      chip.dataset['testid'] = 'palette-chip';
      chip.dataset['uri'] = item.uri;
      if (armed?.uri === item.uri) chip.classList.add('chip--armed');
      chip.addEventListener('click', () => {
        armed = armed?.uri === item.uri ? null : item;
        renderChips();
      });
      chips.append(chip);
    }
  };

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
    // expandCalendar sequences the (week, rep) rows; the days are read from the
    // typed source week so the display name survives.
    for (const cw of expandCalendar(plan.weeks)) {
      const source = plan.weeks[cw.week - 1];
      if (source === undefined) continue;
      const row = el('div', 'cal-week');
      row.dataset['testid'] = 'cal-week';
      row.dataset['week'] = String(cw.week);
      const label = source.repeat > 1 ? `Week ${cw.week} · ${cw.rep} of ${source.repeat}` : `Week ${cw.week}`;
      row.append(el('div', 'cal-week-label', label));
      const daysEl = el('div', 'cal-days');
      source.days.forEach((slot, di) => {
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
        const placed = slot.recipe;
        if (placed !== undefined) {
          cell.classList.add('day--filled');
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
  renderChips();
  try {
    items = await provider();
  } catch (err) {
    log.warn('meal-plan', 'palette load failed', { error: String(err) });
    items = [];
  }
  renderChips();
  void mountBuildStamp(app);
  // signedIn is wired to a real agent in Phase 9 (auth arrives with PDS sync).
  log.debug('shell', 'mounted', { page: 'meals', signedIn: false });
  void registerServiceWorker();
};

void main();
