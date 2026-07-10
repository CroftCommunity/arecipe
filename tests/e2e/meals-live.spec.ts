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
