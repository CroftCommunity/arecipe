// Phase 6 (2026-08-06 sharding plan): the Cookbook feed must WINDOW its list
// like Browse does — a large cookbook renders one page of cards plus pager
// arrows, never a card per record. Hermetic: the shared cookbook view
// (cookbook.html?did=…) over routed fixtures, 120 published recipes.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const identityFixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/identity/${name}`, import.meta.url), 'utf8');

const VIEWED = { did: 'did:plc:viewed0000000000000000aa', pds: 'https://viewed.test' };
const TOTAL = 120;
const PAGE_SIZE = 50; // mirrors Browse's BROWSE_PAGE_SIZE

type FixtureRecord = { uri: string; cid: string; value: Record<string, unknown> };

const bigFeed = (): FixtureRecord[] =>
  Array.from({ length: TOTAL }, (_, i) => ({
    uri: `at://${VIEWED.did}/exchange.recipe.recipe/big${String(i).padStart(4, '0')}`,
    cid: `bafyreibig${String(i).padStart(4, '0')}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    value: {
      name: `Dish ${String(i).padStart(4, '0')}`,
      text: 'A test dish.',
      ingredients: ['water'],
      instructions: ['boil'],
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    },
  }));

const routeBigCookbook = async (page: Page): Promise<void> => {
  const template = JSON.parse(identityFixture('plc-diddoc-ngvalidation2112.json')) as {
    id: string;
    alsoKnownAs?: string[];
    service: { serviceEndpoint: string }[];
  };
  await page.route('https://plc.directory/**', async (route) => {
    const did = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    if (did !== VIEWED.did) return route.fulfill({ status: 404, body: '{}' });
    const doc = {
      ...template,
      id: did,
      alsoKnownAs: ['at://viewed.example.com'],
      service: [{ ...template.service[0]!, serviceEndpoint: VIEWED.pds }],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(doc) });
  });
  await page.route('https://public.api.bsky.app/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ followers: [] }) });
  });
  const records = bigFeed();
  await page.route(`${VIEWED.pds}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('com.atproto.repo.listRecords')) {
      const collection = url.searchParams.get('collection');
      if (collection === 'exchange.recipe.recipe') {
        // Page like a real PDS: limit=100 + cursor, so the reader's pagination
        // is exercised rather than bypassed.
        const cursor = Number(url.searchParams.get('cursor') ?? '0');
        const pageRecords = records.slice(cursor, cursor + 100);
        const next = cursor + 100 < records.length ? String(cursor + 100) : undefined;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(next === undefined ? { records: pageRecords } : { records: pageRecords, cursor: next }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
};

test('a large shared cookbook renders ONE page of cards with working pager arrows', async ({ page }) => {
  await routeBigCookbook(page);
  await page.goto(`/cookbook.html?did=${VIEWED.did}`);

  // The feed settles on the first WINDOW, not all 120 cards.
  const cards = page.getByTestId('recipe-item');
  await expect(page.getByTestId('cookbook-pager')).toBeVisible({ timeout: 15_000 });
  await expect(cards).toHaveCount(PAGE_SIZE);
  await expect(page.getByTestId('cookbook-pager')).toContainText(`1–${PAGE_SIZE} of ${TOTAL}`);

  // ◀ is parked on page 1; ▶ steps forward.
  await expect(page.getByTestId('cookbook-prev')).toBeDisabled();
  await page.getByTestId('cookbook-next').click();
  await expect(page.getByTestId('cookbook-pager')).toContainText(`51–100 of ${TOTAL}`);
  await expect(cards).toHaveCount(PAGE_SIZE);
  await page.getByTestId('cookbook-next').click();
  await expect(page.getByTestId('cookbook-pager')).toContainText(`101–${TOTAL} of ${TOTAL}`);
  await expect(cards).toHaveCount(TOTAL - 2 * PAGE_SIZE);
  await expect(page.getByTestId('cookbook-next')).toBeDisabled();

  // Windowing must not break the count line: the toolbar still reports the
  // full eligible pool.
  await expect(page.getByTestId('recipes-status')).toContainText(`${TOTAL} recipes`);
});
