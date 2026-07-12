// Phase 5 (ICS feed): the generator orchestration. Hermetic — the reader and the
// file writer are injected, so we assert the file path, content, determinism and
// per-DID isolation without touching the network or disk.
import { describe, expect, it, vi } from 'vitest';
import { generateFeeds, feedFileName, feedPath } from '../../../src/recipes/ics-generate.js';
import { buildCalendar } from '../../../src/recipes/ics-assemble.js';
import type { LocalPlan } from '../../../src/recipes/meal-plan-local.js';

const emptyDays = () => Array.from({ length: 7 }, () => ({}));
const aPlan = (id: string): LocalPlan => ({
  id,
  name: 'Week',
  updatedAt: '2026-07-10T00:00:00.000Z',
  startDate: '2026-07-13',
  weeks: [
    { repeat: 1, days: [{ recipe: { uri: 'at://d/c/r', cid: 'bafyx', name: 'Lasagna' } }, ...emptyDays().slice(1)] },
  ],
});

const DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';

describe('feed path helpers', () => {
  it('keys the file by DID with non-alphanumerics collapsed to underscore', () => {
    expect(feedFileName(DID)).toBe('did_plc_xyfhcaweaeyew3zrgk6jaln7.ics');
    expect(feedPath(DID)).toBe('calendars/did_plc_xyfhcaweaeyew3zrgk6jaln7.ics');
  });
});

describe('generateFeeds', () => {
  it('writes one file per DID at the DID-keyed name with the assembler output', async () => {
    const writes = new Map<string, string>();
    const listMealPlans = vi.fn(async (did: string) => (did === DID ? [aPlan('p1')] : []));
    const writeFile = vi.fn(async (name: string, content: string) => void writes.set(name, content));

    const feeds = await generateFeeds([DID], { listMealPlans, writeFile });

    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({ did: DID, fileName: feedFileName(DID), plans: 1, events: 1 });
    // Content equals a direct assembler render of the same plans.
    expect(writes.get(feedFileName(DID))).toBe(buildCalendar([aPlan('p1')]));
  });

  it('is a no-op determinism: identical data twice yields byte-identical files', async () => {
    const run = async () => {
      const writes = new Map<string, string>();
      await generateFeeds([DID], {
        listMealPlans: async () => [aPlan('p1')],
        writeFile: async (n, c) => void writes.set(n, c),
      });
      return writes.get(feedFileName(DID));
    };
    expect(await run()).toBe(await run());
  });

  it('produces one file each for multiple DIDs', async () => {
    const A = 'did:plc:aaa';
    const B = 'did:plc:bbb';
    const writes = new Map<string, string>();
    await generateFeeds([A, B], {
      listMealPlans: async (did) => [aPlan(`${did}-plan`)],
      writeFile: async (n, c) => void writes.set(n, c),
    });
    expect([...writes.keys()].sort()).toEqual([feedFileName(A), feedFileName(B)].sort());
  });

  it('writes a valid header/footer-only feed for a DID with no plans', async () => {
    const writes = new Map<string, string>();
    await generateFeeds([DID], {
      listMealPlans: async () => [],
      writeFile: async (n, c) => void writes.set(n, c),
    });
    const ics = writes.get(feedFileName(DID))!;
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('skips (and reports) a DID whose read throws, without sinking the run', async () => {
    const logs: string[] = [];
    const writes = new Map<string, string>();
    const feeds = await generateFeeds(['did:plc:bad', DID], {
      listMealPlans: async (did) => {
        if (did === 'did:plc:bad') throw new Error('PDS down');
        return [aPlan('p1')];
      },
      writeFile: async (n, c) => void writes.set(n, c),
      log: (m) => logs.push(m),
    });
    expect(feeds.map((f) => f.did)).toEqual([DID]); // bad DID skipped, good one written
    expect(logs.some((l) => l.includes('skip did:plc:bad'))).toBe(true);
  });
});
