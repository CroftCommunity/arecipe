// Phase 9: meal-plan ↔ PDS sync — the durable, cross-browser layer (mirrors
// drafts-sync). Hermetic: an injected agent proves the putRecord call shape; an
// injected fetchFn proves listPdsPlans validates + skips malformed records and
// round-trips a plan back to the local buffer shape.
import type { Agent } from '@atproto/api';
import { describe, expect, it, vi } from 'vitest';
import type { LocalPlan } from '../../../src/recipes/meal-plan-local.js';
import {
  getPdsPlan,
  listPdsPlans,
  planToRecord,
  syncPlanToPds,
} from '../../../src/recipes/meal-plan-sync.js';

const emptyDays = () => Array.from({ length: 7 }, () => ({ meals: [] }));

const aPlan = (): LocalPlan => ({
  id: 'plan-1',
  name: 'Week',
  mealsPerDay: 3,
  updatedAt: '2026-07-10T00:00:00.000Z',
  weeks: [
    {
      repeat: 2,
      days: [
        {
          meals: [
            { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, category: 'dinner', note: 'big batch' },
            { recipe: { uri: 'at://d/c/r2', cid: 'bafyy', name: 'Oatmeal' }, category: 'breakfast' },
          ],
        },
        ...emptyDays().slice(1),
      ],
    },
  ],
});

describe('planToRecord', () => {
  it('builds an app.arecipe.mealPlan value with a meals[] list + cached name/category + mealsPerDay', () => {
    const rec = planToRecord(aPlan());
    expect(rec['$type']).toBe('app.arecipe.mealPlan');
    expect(rec['name']).toBe('Week');
    expect(rec['mealsPerDay']).toBe(3);
    expect(typeof rec['createdAt']).toBe('string');
    expect(typeof rec['updatedAt']).toBe('string');
    const weeks = rec['weeks'] as { repeat: number; days: Record<string, unknown>[] }[];
    expect(weeks[0]?.repeat).toBe(2);
    // Filled day: each meal is a strongRef (uri+cid only) + cached name/category (+note).
    expect(weeks[0]?.days[0]).toEqual({
      meals: [
        { recipe: { uri: 'at://d/c/r', cid: 'bafyx' }, name: 'Lasagna', category: 'dinner', note: 'big batch' },
        { recipe: { uri: 'at://d/c/r2', cid: 'bafyy' }, name: 'Oatmeal', category: 'breakfast' },
      ],
    });
    expect(weeks[0]?.days[1]).toEqual({ meals: [] }); // empty day → empty list
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
    expect(plans[0]?.mealsPerDay).toBe(3);
    // Recovered meals carry the cached display name + category (lossless round-trip).
    expect(plans[0]?.weeks[0]?.days[0]?.meals).toEqual([
      { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' }, category: 'dinner', note: 'big batch' },
      { recipe: { uri: 'at://d/c/r2', cid: 'bafyy', name: 'Oatmeal' }, category: 'breakfast' },
    ]);
  });

  it('migrates a legacy single-recipe record (no meals[]) to a one-meal day', async () => {
    const legacy = {
      uri: 'at://did:me/app.arecipe.mealPlan/legacy',
      value: {
        $type: 'app.arecipe.mealPlan',
        name: 'Legacy',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        weeks: [
          {
            repeat: 1,
            days: [
              { recipe: { uri: 'at://d/c/r', cid: 'bafyx' }, name: 'Lasagna' },
              ...Array.from({ length: 6 }, () => ({})),
            ],
          },
        ],
      },
    };
    const fetchFn = (async () => ({ ok: true, json: async () => ({ records: [legacy] }) })) as unknown as typeof fetch;
    const plans = await listPdsPlans('https://pds.test', 'did:me', { fetchFn });
    expect(plans[0]?.weeks[0]?.days[0]?.meals).toEqual([
      { recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' } },
    ]);
    expect(plans[0]?.weeks[0]?.days[1]?.meals).toEqual([]);
    expect(plans[0]?.mealsPerDay).toBe(3); // absent → default
  });

  it('throws on a non-ok list response', async () => {
    const fetchFn = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(listPdsPlans('https://pds.test', 'did:me', { fetchFn })).rejects.toThrow();
  });
});

describe('getPdsPlan', () => {
  it('reads one plan by rkey (public getRecord) and recovers the buffer shape', async () => {
    let calledUrl = '';
    const fetchFn = (async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          uri: 'at://did:me/app.arecipe.mealPlan/plan-1',
          value: planToRecord(aPlan()),
        }),
      };
    }) as unknown as typeof fetch;

    const plan = await getPdsPlan('https://pds.test', 'did:me', 'plan-1', { fetchFn });
    expect(calledUrl).toContain('com.atproto.repo.getRecord');
    expect(calledUrl).toContain('rkey=plan-1');
    expect(plan.id).toBe('plan-1');
    expect(plan.name).toBe('Week');
    expect(plan.weeks[0]?.days[0]?.meals[0]?.recipe.name).toBe('Lasagna');
  });

  it('throws on a non-ok getRecord response (plan not found)', async () => {
    const fetchFn = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await expect(
      getPdsPlan('https://pds.test', 'did:me', 'missing', { fetchFn }),
    ).rejects.toThrow();
  });
});
