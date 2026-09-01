// Plan archive (RUN-LAST-PLANNED D7/D8). Meal-plan ranges whose derived dates
// have entirely passed leave the active Meals list and live here — a VIEW, never
// a deletion: this page reads the account's app.arecipe.mealPlan records and
// NEVER deletes, trims, or rewrites one. Retention is unchanged.
//
// At the top, a stats block DERIVED from the same planned index (no new data,
// no stored aggregate): total planned meals, distinct recipes planned, the most
// commonly planned recipe, and the date span covered. The archived ranges list
// below it, newest first.
//
// This is NOT one of the zero-auth readers (Browse/Cookbook/recipe) — it is a
// signed-in Meals-surface management view, so it boots the session to read your
// own repo. It does not WRITE the planned-index cache: exactly one writer (the
// Meals page, D3) owns that; here the index is built in-memory just for stats.

import type { Agent } from '@atproto/api';
import { mountBuildStamp } from '../build-stamp.js';
import { resolveDidDoc } from '../identity/did.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { formatShortDate, weekRangeLabel } from '../recipes/meal-plan-dates.js';
import type { LocalPlan } from '../recipes/meal-plan-local.js';
import { listPdsPlans } from '../recipes/meal-plan-sync.js';
import { buildPlannedIndex } from '../recipes/planned-index.js';
import { partitionPlans, planDateSpan, plannedStats } from '../recipes/planned-archive.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const planTitle = (plan: LocalPlan): string => weekRangeLabel(plan.startDate, plan.weeks.length);

/** "Jul 10, 2026" from an ISO date (floating). */
const dateLabel = (iso: string): string => {
  const short = formatShortDate(iso);
  return short !== null ? `${short}, ${iso.slice(0, 4)}` : iso;
};

/** A recipe-URI → cached display name map, harvested from the plans' meals (the
 * open-world display-name cache each slot carries) so the "most planned" line
 * shows a name, not a raw AT-URI. */
const namesOf = (plans: readonly LocalPlan[]): Map<string, string> => {
  const names = new Map<string, string>();
  for (const plan of plans) {
    for (const week of plan.weeks) {
      for (const day of week.days) {
        for (const meal of day.meals) {
          if (!names.has(meal.recipe.uri)) names.set(meal.recipe.uri, meal.recipe.name);
        }
      }
    }
  }
  return names;
};

const renderStats = (plans: readonly LocalPlan[]): HTMLElement => {
  const stats = plannedStats(buildPlannedIndex(plans, new Date()));
  const names = namesOf(plans);
  const block = el('section', 'archive-stats');
  block.dataset['testid'] = 'archive-stats';
  block.append(el('h3', 'section-title', 'Your planning, so far'));
  const grid = el('div', 'archive-stats-grid');

  const stat = (label: string, value: string, testid: string): HTMLElement => {
    const cell = el('div', 'archive-stat');
    const v = el('span', 'archive-stat-value', value);
    v.dataset['testid'] = testid;
    cell.append(v, el('span', 'archive-stat-label', label));
    return cell;
  };

  grid.append(stat('meals planned', String(stats.totalPlanned), 'stat-total'));
  grid.append(stat('distinct recipes', String(stats.distinctRecipes), 'stat-distinct'));
  const most =
    stats.mostCommon === null
      ? '—'
      : `${names.get(stats.mostCommon.uri) ?? '(recipe)'} · ${stats.mostCommon.count}×`;
  grid.append(stat('most planned', most, 'stat-most-common'));
  const span = stats.span === null ? '—' : `${dateLabel(stats.span.first)} – ${dateLabel(stats.span.last)}`;
  grid.append(stat('span covered', span, 'stat-span'));

  block.append(grid);
  return block;
};

/** Newest first: by the range's last derived date, descending (undated sink). */
const byNewest = (a: LocalPlan, b: LocalPlan): number => {
  const ea = planDateSpan(a)?.end ?? '';
  const eb = planDateSpan(b)?.end ?? '';
  return eb.localeCompare(ea);
};

const renderArchive = (body: HTMLElement, did: string, plans: LocalPlan[]): void => {
  const { archived } = partitionPlans(plans, new Date());
  body.replaceChildren();
  body.append(renderStats(plans));

  const listEl = el('div', 'plan-list');
  listEl.dataset['testid'] = 'archived-plans';
  if (archived.length === 0) {
    listEl.append(el('p', 'empty-state', 'No archived plans yet — plans move here once every date has passed.'));
    body.append(listEl);
    return;
  }
  for (const plan of [...archived].sort(byNewest)) {
    const row = el('div', 'plan-row');
    row.dataset['testid'] = 'archive-plan-row';
    const info = el('div', 'plan-info');
    // Archived plans are read-only here; a link still opens the shared view.
    const shareUrl = new URL('meals.html', window.location.href);
    shareUrl.searchParams.set('mealplan', plan.id);
    shareUrl.searchParams.set('user', did);
    const open = el('a', 'plan-link', planTitle(plan)) as HTMLAnchorElement;
    open.href = shareUrl.toString();
    open.dataset['testid'] = 'archive-plan-open';
    const span = planDateSpan(plan);
    const meta = el('span', 'plan-meta', span !== null ? `ended ${dateLabel(span.end)}` : 'undated');
    info.append(open, meta);
    row.append(info);
    listEl.append(row);
  }
  body.append(listEl);
};

export const main = async (): Promise<void> => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  const header = el('div', 'meals-header');
  header.append(el('h2', 'section-title', 'Plan archive'));
  const back = el('a', 'friend-link', '‹ Back to Menu') as HTMLAnchorElement;
  back.href = './meals.html';
  back.dataset['testid'] = 'archive-back';
  header.append(back);
  content.append(header);
  const body = el('div');
  body.dataset['testid'] = 'archive-body';
  content.append(body);
  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();

  body.replaceChildren(el('p', 'status', 'loading your plan archive…'));
  let agent: Agent | null = null;
  try {
    const { bootSession } = await import('../auth/boot.js');
    ({ agent } = await bootSession());
  } catch (err) {
    log.warn('meal-plan', 'auth for archive failed', { error: String(err) });
  }
  if (agent === null || agent.did === undefined) {
    body.replaceChildren(el('p', 'status', 'Sign in to see your plan archive.'));
    return;
  }
  try {
    const { pds } = await resolveDidDoc(agent.did);
    const plans = await listPdsPlans(pds, agent.did);
    renderArchive(body, agent.did, plans);
    log.debug('shell', 'mounted', { page: 'archive' });
  } catch (err) {
    body.replaceChildren(el('p', 'status', `couldn’t load your archive: ${String(err)}`));
  }
};

void main();
