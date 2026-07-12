// Phase 4 (@live): schema-drift guard for the .ics feed reader. Reads the
// dedicated test account's PUBLIC app.arecipe.mealPlan records off its real PDS
// (no auth — the data is public, which is the whole premise of a secretless
// feed) and asserts the live record shape still matches what the hermetic
// fixtures assume. Runs only under `npm run test:live` (LIVE=1); excluded from
// push CI. Pure Node — no browser, no credentials, so it needs no .env.
import { expect, test } from '@playwright/test';
import { buildCalendar } from '../../src/recipes/ics-assemble.js';
import { listMealPlans } from '../../src/recipes/ics-read.js';

// The dedicated test account (public read only — no mutation here).
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';

test('@live listMealPlans reads the test account PDS; live shape matches the hermetic model', async () => {
  const plans = await listMealPlans(TEST_DID);

  if (plans.length === 0) {
    test.skip(true, 'no app.arecipe.mealPlan records on the test account to validate against');
    return;
  }

  for (const plan of plans) {
    expect(typeof plan.id).toBe('string');
    expect(typeof plan.name).toBe('string');
    expect(typeof plan.updatedAt).toBe('string'); // the DTSTAMP source
    expect(Array.isArray(plan.weeks)).toBe(true);
    for (const week of plan.weeks) {
      expect(typeof week.repeat).toBe('number');
      expect(week.days).toHaveLength(7); // the model's structural invariant, live
    }
  }

  // End-to-end: the assembler renders the LIVE plans into a valid VCALENDAR.
  const ics = buildCalendar(plans);
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  // Every physical line stays within the RFC 5545 75-octet fold bound.
  for (const physical of ics.split('\r\n')) {
    expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
  }
});
