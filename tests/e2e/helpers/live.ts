// Shared support for the @live tier (real PDS, credentials from .env).
//
// Fill discipline (Phase 0 incident): never fill/retry an already-filled or
// disabled field — Playwright failure logs dump element state including
// values.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** The ONLY repo any @live suite may write to or purge — the dedicated test
 * account (did:plc:xyfhcaweaeyew3zrgk6jaln7). Every guarded mutation asserts
 * the session DID matches this before touching a record. */
export const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';

type Session = { did: string; accessJwt: string };

/** App-password login for cleanup, hard-guarded to the test account. */
const cleanupLogin = async (handle: string, appPassword: string): Promise<Session> => {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });
  const session = (await res.json()) as Session & { error?: string };
  if (session.error !== undefined) throw new Error(`cleanup login failed: ${session.error}`);
  if (session.did !== TEST_DID) {
    throw new Error(`SAFETY: cleanup session is ${session.did}, expected the test account`);
  }
  return session;
};

/**
 * Guarded purge of an app.arecipe.* collection on the test account. The M4
 * social record types (friend/comment/interaction/mute) carry no user-facing
 * `name` field, so the recipe suite's MARKER-substring guard does not transfer
 * — the safety boundary here is the hard TEST_DID check plus the fact that the
 * account is test-only, so every record in these collections is test-created.
 * Pass a `match` predicate to narrow (e.g. a marker) when a collection supports
 * one; the default deletes every record in the collection.
 */
export const purgeCollection = async (
  collection: string,
  opts: { handle: string; appPassword: string; match?: (value: Record<string, unknown>) => boolean },
): Promise<void> => {
  const session = await cleanupLogin(opts.handle, opts.appPassword);
  const list = (await (
    await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.listRecords?repo=${TEST_DID}&collection=${encodeURIComponent(collection)}&limit=100`,
      { headers: { authorization: `Bearer ${session.accessJwt}` } },
    )
  ).json()) as { records?: { uri: string; value: Record<string, unknown> }[] };
  for (const record of list.records ?? []) {
    if (opts.match !== undefined && !opts.match(record.value)) continue;
    const rkey = record.uri.split('/').pop() ?? '';
    await fetch('https://bsky.social/xrpc/com.atproto.repo.deleteRecord', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: TEST_DID, collection, rkey }),
    });
  }
};

/** Tolerant read: .env is absent in CI, where the @live tier never runs. */
export const readEnv = (): Record<string, string> => {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(/=(.*)/s).slice(0, 2)),
    ) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Walk the third-party login/consent pages until we're back at the app. */
export const walkAuthPages = async (
  page: Page,
  appOrigin: string,
  password: string,
): Promise<void> => {
  for (let i = 0; i < 15 && !page.url().startsWith(appOrigin); i++) {
    await page.waitForTimeout(900);
    if (page.url().startsWith(appOrigin)) break;
    const pw = page.locator('input[type=password]:visible').first();
    if ((await page.locator('input[type=password]:visible').count()) > 0) {
      const enabled = await pw.isEnabled().catch(() => false);
      const already = await pw.inputValue().catch(() => 'x');
      if (enabled && already === '') {
        await pw.fill(password, { timeout: 5_000 });
        await page
          .locator('button:has-text("Sign in"):visible, button[type=submit]:visible')
          .first()
          .click({ timeout: 5_000 });
      }
    } else {
      const authorize = page
        .locator('button:has-text("Authorize"):visible, button:has-text("Accept"):visible')
        .first();
      if ((await authorize.count()) > 0) await authorize.click({ timeout: 5_000 }).catch(() => {});
    }
  }
};

/** Full interactive login: sign-in lives on the dedicated signin.html. The
 * OAuth callback round-trips back there; signin.ts completes it and forwards a
 * live session to Cookbook. We wait for that forward — it fires only after the
 * session restores, so it doubles as a "session is persisted" signal — then
 * land the caller on account.html, the signed-in page that renders
 * `signed-in-did` (as "@handle · did:…"; Alchemy no longer shows it, and
 * cookbook.html never did). Every @live suite asserts `signed-in-did` right
 * after this returns, so the landing page matters. */
export const signIn = async (
  page: Page,
  opts: { handle: string; password: string; origin: string },
): Promise<void> => {
  await page.goto('/signin.html');
  await page.getByTestId('handle-input').fill(opts.handle);
  await page.getByTestId('oauth-signin').click();
  await page.waitForURL(/bsky\.social/, { timeout: 30_000 });
  await walkAuthPages(page, opts.origin, opts.password);
  await page.waitForURL(/cookbook\.html/, { timeout: 30_000 });
  await page.goto('/account.html');
};
