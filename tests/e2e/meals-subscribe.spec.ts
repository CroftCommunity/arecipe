// Phase 7 (ICS feed): the "Add to Google Calendar" affordance on meals.html.
// Hermetic, against the built bundle. The control renders for a DID that has a
// published feed (the config allowlist), exposes the stable feed URL and the
// webcal quick-subscribe deep link, opens in a new tab, and adds NO third-party
// subresource (the links are plain anchors — a navigation, not a load).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The allowlist the client and the generator both read — source of truth.
const feedsConfig = JSON.parse(
  readFileSync(new URL('../../config/ics-feeds.json', import.meta.url), 'utf8'),
) as { dids: string[] };
const ALLOWLISTED_DID = feedsConfig.dids[0]!;
const FEED_FILE = `${ALLOWLISTED_DID.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;

// A palette seed keeps the planner fully offline (no source fetch).
const seedPalette = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'arecipe.meals.palette-seed',
        JSON.stringify([{ uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }]),
      );
    } catch {
      /* private mode */
    }
  });
};

const seedDid = async (page: Page, did: string): Promise<void> => {
  await page.addInitScript((d) => {
    try {
      localStorage.setItem('arecipe.meals.did', d);
    } catch {
      /* private mode */
    }
  }, did);
};

test('renders the subscribe control for an allowlisted DID with correct links', async ({ page }) => {
  await seedPalette(page);
  await seedDid(page, ALLOWLISTED_DID);
  await page.goto('/meals.html');

  const control = page.getByTestId('calendar-subscribe');
  await expect(control).toBeVisible();

  const gcal = page.getByTestId('gcal-subscribe');
  await expect(gcal).toHaveText('Add to Google Calendar');
  // The webcal quick-subscribe deep link (render?cid=webcal://arecipe.app/…).
  await expect(gcal).toHaveAttribute(
    'href',
    `https://www.google.com/calendar/render?cid=webcal://arecipe.app/calendars/${FEED_FILE}`,
  );
  await expect(gcal).toHaveAttribute('target', '_blank');
  await expect(gcal).toHaveAttribute('rel', /noopener/);

  const feed = page.getByTestId('feed-url');
  // The stable feed URL — usable in any calendar app.
  await expect(feed).toHaveAttribute('href', `https://arecipe.app/calendars/${FEED_FILE}`);
  await expect(feed).toHaveText(`https://arecipe.app/calendars/${FEED_FILE}`);
  await expect(feed).toHaveAttribute('target', '_blank');
});

test('adds no third-party subresource (links are anchors, not loads)', async ({ page }) => {
  await seedPalette(page);
  await seedDid(page, ALLOWLISTED_DID);
  await page.goto('/meals.html');
  await expect(page.getByTestId('calendar-subscribe')).toBeVisible();

  // The ONLY reference to google.com is the anchor href — no script/style/img/
  // iframe pulls a third-party origin into the page.
  const thirdParty = page.locator(
    'script[src*="google."], link[href*="google."], img[src*="google."], iframe',
  );
  await expect(thirdParty).toHaveCount(0);
});

test('hides the control for a DID with no published feed', async ({ page }) => {
  await seedPalette(page);
  await seedDid(page, 'did:plc:nofeedaccount0000000000000');
  await page.goto('/meals.html');
  await expect(page.getByTestId('cal-week').or(page.getByTestId('calendar-empty')).first()).toBeVisible();
  await expect(page.getByTestId('calendar-subscribe')).toHaveCount(0);
});

test('hides the control when there is no current DID (signed out)', async ({ page }) => {
  await seedPalette(page);
  await page.goto('/meals.html');
  await expect(page.getByTestId('calendar-empty').or(page.getByTestId('cal-week')).first()).toBeVisible();
  await expect(page.getByTestId('calendar-subscribe')).toHaveCount(0);
});
