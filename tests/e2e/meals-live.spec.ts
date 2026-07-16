// Phase 9 wiring (@live): a meal plan syncs to the REAL PDS and survives
// eviction. Sign in → place a recipe on a day → the app.arecipe.mealPlan record
// exists on the account's PDS → wipe local storage → reload → the plan is
// recovered from the PDS. Runs only with BSKY_TEST_* creds (`npm run test:live`);
// cleanup is HARD-GUARDED to the test account (marker name + pre-run/teardown
// purge). NOTE: authored to mirror drafts-live.spec.ts but not yet executed —
// this worktree has no test credentials (see the plan's D1 live-leg deferral).
import { expect, test } from '@playwright/test';
import { readEnv, signIn } from './helpers/live.js';

const env = readEnv();
const HANDLE = env['BSKY_TEST_HANDLE'] ?? '';
const PASSWORD = env['BSKY_TEST_PASSWORD'] ?? '';
const APP_PASSWORD = env['BSKY_TEST_APP_PASSWORD'] ?? '';

const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const MARKER = 'arecipe e2e meals';
const COLLECTION = 'app.arecipe.mealPlan';
const SEED = [
  { uri: 'at://did:plc:testcook/exchange.recipe.recipe/live1', cid: 'bafyliveone', name: `Live Dish (${MARKER})` },
];

type Session = { did: string; accessJwt: string };
const login = async (): Promise<Session> => {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE, password: APP_PASSWORD }),
  });
  const session = (await res.json()) as Session & { error?: string };
  if (session.error !== undefined) throw new Error(`cleanup login failed: ${session.error}`);
  if (session.did !== TEST_DID) {
    throw new Error(`SAFETY: cleanup session is ${session.did}, expected the test account`);
  }
  return session;
};

const isTestPlan = (v: Record<string, unknown>): boolean => String(v['name'] ?? '').includes(MARKER);

const listTestPlans = async (): Promise<{ uri: string; value: Record<string, unknown> }[]> => {
  const session = await login();
  const list = (await (
    await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${COLLECTION}&limit=100`,
      { headers: { authorization: `Bearer ${session.accessJwt}` } },
    )
  ).json()) as { records?: { uri: string; value: Record<string, unknown> }[] };
  return (list.records ?? []).filter((r) => isTestPlan(r.value));
};

const purge = async (): Promise<void> => {
  const session = await login();
  for (const record of await listTestPlans()) {
    const rkey = record.uri.split('/').pop() ?? '';
    await fetch('https://bsky.social/xrpc/com.atproto.repo.deleteRecord', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: TEST_DID, collection: COLLECTION, rkey }),
    });
  }
};

test('@live meal plan syncs to the PDS and survives eviction', async ({ page, baseURL }) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(300_000);
  await purge();
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  // Seed a deterministic palette item so placement doesn't depend on live feeds.
  // The plan's name carries the MARKER so cleanup can find it.
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('arecipe.meals.palette-seed', JSON.stringify(seed));
    } catch {
      /* ignore */
    }
  }, SEED);

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await page.goto('/meals.html');
  // Name the plan so the record is findable for cleanup (default name otherwise).
  await page.evaluate((marker) => {
    try {
      const raw = localStorage.getItem('arecipe.mealplans.v1');
      const all = raw === null ? {} : (JSON.parse(raw) as Record<string, { name: string }>);
      for (const id of Object.keys(all)) all[id]!.name = `Live Plan (${marker})`;
      localStorage.setItem('arecipe.mealplans.v1', JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, MARKER);
  await page.goto('/meals.html');

  // Place the seeded recipe on Monday of week 1 — this persists + syncs.
  await page.getByTestId('palette-chip').first().click();
  const mon = page.getByTestId('week-row').first().getByTestId('day-slot').first();
  await mon.click();
  await expect(mon.getByTestId('slot-filled')).toBeVisible();

  // The record exists on the account's PDS (authenticated read).
  await expect.poll(async () => (await listTestPlans()).length, { timeout: 30_000 }).toBeGreaterThan(0);

  // Simulated eviction: wipe the local plans, reload — the plan comes back from
  // the PDS and the placed recipe reappears (recovered with its cached name).
  await page.evaluate(() => {
    try {
      localStorage.removeItem('arecipe.mealplans.v1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/meals.html');
  await expect(page.getByTestId('slot-filled').first()).toBeVisible({ timeout: 30_000 });

  await purge();
});

test('@live publish a plan, then open the shared link anonymously', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(300_000);
  await purge();
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('arecipe.meals.palette-seed', JSON.stringify(seed));
    } catch {
      /* ignore */
    }
  }, SEED);

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await page.goto('/meals.html');
  // Name the plan (MARKER) so cleanup can find the record.
  await page.evaluate((marker) => {
    try {
      const raw = localStorage.getItem('arecipe.mealplans.v1');
      const all = raw === null ? {} : (JSON.parse(raw) as Record<string, { name: string }>);
      for (const id of Object.keys(all)) all[id]!.name = `Shared Plan (${marker})`;
      localStorage.setItem('arecipe.mealplans.v1', JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, MARKER);
  await page.goto('/meals.html');

  // Place a recipe and anchor a start date, then Publish.
  await page.getByTestId('palette-chip').first().click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await page.getByTestId('plan-start-date').fill('2026-07-13');
  await page.getByTestId('publish-plan').click();

  const shareUrl = page.getByTestId('share-url');
  await expect(shareUrl).toBeVisible({ timeout: 30_000 });
  const url = await shareUrl.inputValue();
  expect(url).toContain('mealplan=');
  expect(url).toContain('user=');

  // Reset-on-publish is on by default: the working canvas clears (fresh plan)
  // while the published record is preserved under its own id.
  await expect(page.getByTestId('slot-filled')).toHaveCount(0, { timeout: 15_000 });

  // Open the link in a fresh ANONYMOUS context (no session) — the shared,
  // read-only calendar must render with each meal linking to its recipe.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(url);
  await expect(anonPage.getByTestId('shared-plan')).toBeVisible({ timeout: 30_000 });
  await expect(anonPage.getByTestId('cal-week').first()).toContainText('Jul 13', { timeout: 30_000 });
  const meal = anonPage.getByTestId('shared-meal').first();
  await expect(meal).toBeVisible({ timeout: 30_000 });
  await expect(meal).toHaveAttribute('href', /recipe\.html\?u=/);
  await anon.close();

  await purge();
});

test('@live "Published" plans subpage lists a published plan, then deletes it', async ({ page, baseURL }) => {
  test.skip(
    HANDLE === '' || PASSWORD === '' || APP_PASSWORD === '',
    'needs BSKY_TEST_* credentials in .env',
  );
  test.setTimeout(300_000);
  await purge();
  const origin = baseURL ?? 'http://127.0.0.1:4173';

  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('arecipe.meals.palette-seed', JSON.stringify(seed));
    } catch {
      /* ignore */
    }
  }, SEED);

  await signIn(page, { handle: HANDLE, password: PASSWORD, origin });
  await page.goto('/meals.html');
  await page.evaluate((marker) => {
    try {
      const raw = localStorage.getItem('arecipe.mealplans.v1');
      const all = raw === null ? {} : (JSON.parse(raw) as Record<string, { name: string }>);
      for (const id of Object.keys(all)) all[id]!.name = `Managed Plan (${marker})`;
      localStorage.setItem('arecipe.mealplans.v1', JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, MARKER);
  await page.goto('/meals.html');

  await page.getByTestId('palette-chip').first().click();
  await page.getByTestId('week-row').first().getByTestId('day-slot').first().click();
  await page.getByTestId('plan-start-date').fill('2026-07-13');
  await page.getByTestId('publish-plan').click();
  await expect(page.getByTestId('share-url')).toBeVisible({ timeout: 30_000 });

  // The "Published" plans subpage lists the published plan with its week range + a
  // share link, and can delete it.
  await page.getByTestId('my-plans').click();
  await expect(page).toHaveURL(/meals\.html\?plans$/);
  // Plans are titled by date range now (not the generic name), so filter the
  // row by its published-date meta instead.
  const row = page.getByTestId('plan-row').filter({ hasText: 'published' });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  const open = row.getByTestId('plan-open');
  await expect(open).toHaveAttribute('href', /mealplan=.*user=/);
  await expect(open).toContainText('Jul 13'); // date-range title
  await expect(row.getByTestId('plan-meta')).toContainText('published');

  await row.getByTestId('plan-delete').click();
  await row.getByTestId('plan-delete-confirm').click();
  // Only this test's plan existed (purged at start), so the list empties.
  await expect(page.getByTestId('plan-row')).toHaveCount(0, { timeout: 30_000 });

  await purge();
});
