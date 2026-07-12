// Pure feed assembler: a user's app.arecipe.mealPlan records → one continuous
// VCALENDAR string. Runs the SHARED date derivation (deriveDatedSlots — the same
// code the planner renders with, so feed dates cannot drift from the app) then
// the RFC 5545 serializer. No I/O, no clock.
//
// Expansion mode: deriveDatedSlots already stamps each repeat as its own dated
// occurrence, so every meal-bearing day becomes ONE discrete VEVENT (no RRULE).
// Discrete events dedup and sort cleanly and sidestep RRULE/timezone edge cases
// in consumers; the serializer keeps RRULE support for a future compact mode.

import { deriveDatedSlots } from './meal-plan-calendar.js';
import type { LocalPlan, LocalSlot } from './meal-plan-local.js';
import { serializeCalendar, type IcsEvent } from './ics-serialize.js';

/** Default identity + origin. `siteOrigin` is where a recipe's page lives and is
 * overridable for tests; it never adds a runtime origin (the URL is a link in an
 * all-day event, fetched by the calendar client, not by arecipe). */
const DEFAULT_PROD_ID = '-//arecipe//meal-plan feed//EN';
const DEFAULT_SITE_ORIGIN = 'https://arecipe.app';
const UID_DOMAIN = 'arecipe.app';

export type BuildOpts = {
  prodId?: string;
  /** Origin for recipe-page links (default https://arecipe.app). No trailing slash. */
  siteOrigin?: string;
};

/** The recipe's arecipe.app page — mirrors the app's `./recipe.html?u=<uri>`. */
const recipeUrl = (siteOrigin: string, uri: string): string =>
  `${siteOrigin}/recipe.html?u=${encodeURIComponent(uri)}`;

/** A structural, date-independent UID: a function of the plan rkey and the
 * slot's structural coordinates (source week, occurrence, day). A date shift
 * moves the SAME UID (an update), never orphans it. */
const uidFor = (planId: string, weekIndex: number, occurrenceIndex: number, dayIndex: number): string =>
  `${planId}-w${weekIndex}-r${occurrenceIndex}-d${dayIndex}@${UID_DOMAIN}`;

/** Build the continuous VCALENDAR for a set of meal-plan records. Slots with no
 * recipe (empty or note-only) and plans with no `startDate` anchor are skipped.
 * Events are de-duplicated by UID and emitted in stable (date, day, uid) order,
 * so identical input yields byte-identical output. */
export const buildCalendar = (plans: readonly LocalPlan[], opts: BuildOpts = {}): string => {
  const prodId = opts.prodId ?? DEFAULT_PROD_ID;
  const siteOrigin = opts.siteOrigin ?? DEFAULT_SITE_ORIGIN;

  const byUid = new Map<string, { event: IcsEvent; date: string; dayIndex: number }>();
  for (const plan of plans) {
    for (const ds of deriveDatedSlots<LocalSlot>(plan.weeks, plan.startDate)) {
      if (ds.date === null) continue; // unanchored plan — cannot place on a calendar
      const recipe = ds.slot.recipe;
      if (recipe === undefined) continue; // empty / note-only slot
      const uid = uidFor(plan.id, ds.weekIndex, ds.occurrenceIndex, ds.dayIndex);
      if (byUid.has(uid)) continue; // dedup identical structural events
      const event: IcsEvent = {
        uid,
        dtstamp: plan.updatedAt,
        date: ds.date,
        summary: recipe.name,
        url: recipeUrl(siteOrigin, recipe.uri),
        ...(ds.slot.note !== undefined ? { description: ds.slot.note } : {}),
      };
      byUid.set(uid, { event, date: ds.date, dayIndex: ds.dayIndex });
    }
  }

  const ordered = [...byUid.values()]
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.dayIndex !== b.dayIndex
          ? a.dayIndex - b.dayIndex
          : a.event.uid < b.event.uid
            ? -1
            : 1,
    )
    .map((e) => e.event);

  return serializeCalendar(ordered, { prodId });
};
