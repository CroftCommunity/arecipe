// Phase 9: meal-plan ↔ PDS sync — the durable, cross-browser layer (mirrors
// drafts-sync). Hermetic: an injected agent proves the putRecord call shape; an
// injected fetchFn proves listPdsPlans validates + skips malformed records and
// round-trips a plan back to the local buffer shape.
import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vitest';
import type { LocalPlan } from '../../../src/recipes/meal-plan-local.js';
import {
  listPdsPlans,
  planToRecord,
  syncPlanToPds,
} from '../../../src/recipes/meal-plan-sync.js';

const emptyDays = () => Array.from({ length: 7 }, () => ({}));

const aPlan = (): LocalPlan => ({
  id: 'plan-1',
  name: 'Week',
  updatedAt: '2026-07-10T00:00:00.000Z',
  weeks: [
    {
      repeat: 2,
      days: [
        { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, note: 'big batch' },
        ...emptyDays().slice(1),
      ],
    },
  ],
});

describe('planToRecord', () => {
  it('builds an app.arecipe.mealPlan value with strongRef slots + cached name', () => {
    const rec = planToRecord(aPlan());
    expect(rec['$type']).toBe('app.arecipe.mealPlan');
    expect(rec['name']).toBe('Week');
    expect(typeof rec['createdAt']).toBe('string');
    expect(typeof rec['updatedAt']).toBe('string');
    const weeks = rec['weeks'] as { repeat: number; days: Record<string, unknown>[] }[];
    expect(weeks[0]?.repeat).toBe(2);
    // Filled slot: strongRef (uri+cid only) + a cached display name + note.
    expect(weeks[0]?.days[0]).toEqual({
      recipe: { uri: 'at://d/c/r', cid: 'bafyx' },
      name: 'Lasagna',
      note: 'big batch',
    });
    expect(weeks[0]?.days[1]).toEqual({}); // empty slot stays empty
  });
});

describe('syncPlanToPds', () => {
  it('putRecords under the plan-id rkey (stable → re-saves overwrite)', async () => {
    const putRecord = vi.fn(async () => ({}));
    const agent = { did: 'did:me', com: { atproto: { repo: { putRecord } } } } as unknown as Agent;
    await syncPlanToPds(agent, aPlan());
    expect(putRecord).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'did:me', collection: 'app.arecipe.mealPlan', rkey: 'plan-1' }),
    );
  });

  it('throws when there is no signed-in account', async () => {
    const agent = { com: { atproto: { repo: { putRecord: vi.fn() } } } } as unknown as Agent;
    await expect(syncPlanToPds(agent, aPlan())).rejects.toThrow();
  });
});

describe('listPdsPlans', () => {
  it('validates records, skips malformed ones, and recovers the buffer shape', async () => {
    const valid = { uri: 'at://did:me/app.arecipe.mealPlan/plan-1', value: planToRecord(aPlan()) };
    const malformed = { uri: 'at://did:me/app.arecipe.mealPlan/bad', value: { name: 'no weeks' } };
    const fetchFn = (async () => ({
      ok: true,
      json: async () => ({ records: [valid, malformed] }),
    })) as unknown as typeof fetch;

    const plans = await listPdsPlans('https://pds.test', 'did:me', { fetchFn });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.id).toBe('plan-1'); // rkey → local id
    expect(plans[0]?.name).toBe('Week');
    // Recovered slot carries the cached display name (lossless round-trip).
    expect(plans[0]?.weeks[0]?.days[0]?.recipe).toEqual({
      uri: 'at://d/c/r',
      cid: 'bafyx',
      name: 'Lasagna',
    });
  });

  it('throws on a non-ok list response', async () => {
    const fetchFn = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(listPdsPlans('https://pds.test', 'did:me', { fetchFn })).rejects.toThrow();
  });
});
