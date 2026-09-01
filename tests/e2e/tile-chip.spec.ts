// RUN-EMPTY-TILE-CHIP — Phase 3 layout + a11y verification. Hermetic via the
// mixed browse fixture (four recipes, one pictureless: "Italian Minestrone"),
// routed exactly as browse.spec.ts does. We check that the pictureless tile
// renders as an inline chip at single-column widths and keeps a media band at
// multi-column widths, that the chip clears the 44px touch floor, that the tile
// link's accessible name is the recipe title, and that nothing overflows.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const atprotoFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/atproto/${name}`, import.meta.url), 'utf8');
const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const AUTHORS = [
  { did: 'did:plc:spfl4xaktvvchr2cqp2r2xvp', pds: 'https://pds0.test', records: true },
  { did: 'did:plc:26tsx5juuss4yealylyfbj4h', pds: 'https://pds1.test', records: false },
  { did: 'did:plc:4cx7ts7lqgjtsfquo53qo3sz', pds: 'https://pds2.test', records: false },
  { did: 'did:plc:vspq46f5zmrlesaszlyfliy2', pds: 'https://pds3.test', records: false },
];

const PICTURELESS = 'Italian Minestrone';
const WITH_PHOTO = 'Greek Salad';

const routeMixedFeed = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const author = AUTHORS.find((a) => a.did === did);
    if (author === undefined) return route.fulfill({ status: 404, body: '{}' });
    const doc = { ...template, id: author.did, service: [{ ...template.service[0]!, serviceEndpoint: author.pds }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  for (const author of AUTHORS) {
    await page.route(`${author.pds}/**`, async (route) => {
      const body = author.records
        ? atprotoFixture('listRecords-browse-mixed.json')
        : JSON.stringify({ records: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    });
  }
  // Photo thumbnails never load in CI; short-circuit so the error→placeholder
  // path is deterministic (the pictureless tile is what we assert on anyway).
  await page.route('https://cdn.bsky.app/**', (route) => route.fulfill({ status: 404, body: '' }));
};

const tile = (page: Page, title: string) =>
  page.getByTestId('recipe-item').filter({ hasText: title }).first();

const SINGLE = [360, 390];
const MULTI = [768, 1024, 1280];

for (const width of SINGLE) {
  test(`pictureless tile is an inline chip at ${width}px (single column)`, async ({ page }) => {
    await routeMixedFeed(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(tile(page, PICTURELESS)).toBeVisible({ timeout: 15_000 });

    const empty = tile(page, PICTURELESS);
    await expect(empty).toHaveClass(/card--chip/);
    await expect(empty.locator('.tile-chip')).toHaveCount(1);
    // No media band in the chip variant.
    await expect(empty.locator('.card-photo')).toHaveCount(0);
    await expect(empty.locator('.photo-wrap')).toHaveCount(0);

    // Chip clears the 44px touch-target floor.
    const box = await empty.locator('.tile-chip').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // The chip glyph is decorative (aria-hidden) and contributes no text, so the
    // tile link's accessible name leads with the recipe title. (These hermetic
    // fixture records are unverified, so the trust "ALTERED?" warning is also
    // part of the name — existing behavior, unrelated to the chip.)
    await expect(empty.locator('.tile-chip')).toHaveAttribute('aria-hidden', 'true');
    await expect(empty.locator('.tile-chip')).toHaveText('');
    await expect(page.getByRole('link', { name: new RegExp(`^${PICTURELESS}`) })).toBeVisible();

    // A photo tile is untouched: it still has its media band.
    await expect(tile(page, WITH_PHOTO).locator('.photo-wrap')).toHaveCount(1);
    await expect(tile(page, WITH_PHOTO)).not.toHaveClass(/card--chip/);

    // No horizontal overflow at this width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

for (const width of MULTI) {
  test(`pictureless tile keeps its media band at ${width}px (multi column)`, async ({ page }) => {
    await routeMixedFeed(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(tile(page, PICTURELESS)).toBeVisible({ timeout: 15_000 });

    const empty = tile(page, PICTURELESS);
    await expect(empty).not.toHaveClass(/card--chip/);
    await expect(empty.locator('.tile-chip')).toHaveCount(0);
    await expect(empty.locator('.card-photo--empty')).toHaveCount(1);
  });
}

test('keyboard focus lands on the tile link and shows a visible ring', async ({ page }) => {
  await routeMixedFeed(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(tile(page, PICTURELESS)).toBeVisible({ timeout: 15_000 });
  const link = page.getByRole('link', { name: new RegExp(`^${PICTURELESS}`) });
  await link.focus();
  await expect(link).toBeFocused();
  // The focus-visible outline is themed (--yolk) and non-zero; assert the tile
  // renders an outline width when focused (ring not suppressed by the chip row).
  const outline = await link.evaluate((n) => getComputedStyle(n).outlineWidth);
  expect(parseFloat(outline)).toBeGreaterThan(0);
});
