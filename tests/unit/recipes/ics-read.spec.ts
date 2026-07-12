// Phase 4 (ICS feed): the read-only PDS reader. Hermetic — an injected fetchFn
// stands in for the network. Proves: cursor pages are followed and decode to
// typed plans; DID→PDS resolution flows through the (default) plc.directory
// resolver; malformed / open-world records are tolerated.
import { describe, expect, it, vi } from 'vitest';
import { listMealPlans } from '../../../src/recipes/ics-read.js';
import { planToRecord } from '../../../src/recipes/meal-plan-sync.js';
import type { LocalPlan } from '../../../src/recipes/meal-plan-local.js';

const emptyDays = () => Array.from({ length: 7 }, () => ({}));
const aPlan = (id: string, name: string): LocalPlan => ({
  id,
  name,
  updatedAt: '2026-07-10T00:00:00.000Z',
  startDate: '2026-07-13',
  weeks: [
    {
      repeat: 1,
      days: [
        { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' } },
        ...emptyDays().slice(1),
      ],
    },
  ],
});

const rec = (did: string, plan: LocalPlan) => ({
  uri: `at://${did}/app.arecipe.mealPlan/${plan.id}`,
  value: planToRecord(plan),
});

/** A fetchFn that serves a plc.directory DID doc and a paginated listRecords. */
const wiredFetch = (did: string, pages: { records: unknown[]; cursor?: string }[]): typeof fetch =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://plc.directory/')) {
      return {
        ok: true,
        json: async () => ({
          id: did,
          service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.test' }],
        }),
      } as Response;
    }
    // listRecords: pick the page by the cursor query param.
    const cursor = new URL(url).searchParams.get('cursor');
    const idx = cursor === null ? 0 : Number(cursor);
    return { ok: true, json: async () => pages[idx] } as Response;
  }) as unknown as typeof fetch;

describe('listMealPlans', () => {
  const DID = 'did:plc:feedowner00000000000000';

  it('resolves the DID to its PDS and decodes records to typed plans', async () => {
    const fetchFn = wiredFetch(DID, [{ records: [rec(DID, aPlan('p1', 'Week One'))] }]);
    const plans = await listMealPlans(DID, { fetchFn });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe('p1');
    expect(plans[0]?.name).toBe('Week One');
    expect(plans[0]?.weeks[0]?.days[0]?.recipe).toEqual({ uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' });
  });

  it('follows the cursor across pages and concatenates in order', async () => {
    const fetchFn = wiredFetch(DID, [
      { records: [rec(DID, aPlan('p1', 'One'))], cursor: '1' },
      { records: [rec(DID, aPlan('p2', 'Two'))], cursor: '2' },
      { records: [rec(DID, aPlan('p3', 'Three'))] }, // no cursor → last page
    ]);
    const plans = await listMealPlans(DID, { fetchFn });
    expect(plans.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('tolerates malformed records (skips) and unknown extra fields (open-world)', async () => {
    const good = rec(DID, aPlan('p1', 'Good'));
    // Open-world extra top-level field survives validation.
    (good.value as Record<string, unknown>)['mysteryField'] = { anything: true };
    const malformed = { uri: `at://${DID}/app.arecipe.mealPlan/bad`, value: { name: 'no weeks' } };
    const fetchFn = wiredFetch(DID, [{ records: [good, malformed] }]);
    const plans = await listMealPlans(DID, { fetchFn });
    expect(plans.map((p) => p.id)).toEqual(['p1']); // malformed skipped, good kept
  });

  it('accepts an injected resolvePds (no DID-doc fetch) and throws on a non-ok list', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 502 }) as Response) as unknown as typeof fetch;
    await expect(
      listMealPlans(DID, { fetchFn, resolvePds: async () => 'https://pds.test' }),
    ).rejects.toThrow(/HTTP 502/);
  });

  it('builds the listRecords query for the resolved PDS + collection', async () => {
    const seen: string[] = [];
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return { ok: true, json: async () => ({ records: [] }) } as Response;
    }) as unknown as typeof fetch;
    await listMealPlans(DID, { fetchFn, resolvePds: async () => 'https://pds.test' });
    expect(seen[0]).toContain('https://pds.test/xrpc/com.atproto.repo.listRecords');
    expect(seen[0]).toContain('collection=app.arecipe.mealPlan');
    expect(seen[0]).toContain(`repo=${encodeURIComponent(DID)}`);
  });
});
