// Generic offset-window pagination (Browse pages its filtered feed at 50 with
// prev/next arrows). Pure: takes an already-filtered list + an offset/size and
// returns the visible slice plus the state the arrows and "Showing X–Y of N"
// hint need. A stale offset past the end clamps to the last page.
import { describe, expect, it } from 'vitest';
import { windowPage } from '../../../src/recipes/paginate.js';

const nums = (n: number): number[] => Array.from({ length: n }, (_unused, i) => i);

describe('windowPage', () => {
  it('returns the first page and reports paging state', () => {
    const p = windowPage(nums(55), { offset: 0, size: 50 });
    expect(p.items).toHaveLength(50);
    expect(p.items[0]).toBe(0);
    expect(p.total).toBe(55);
    expect(p.start).toBe(1);
    expect(p.end).toBe(50);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(true);
  });

  it('returns the last (short) page with no next', () => {
    const p = windowPage(nums(55), { offset: 50, size: 50 });
    expect(p.items).toEqual([50, 51, 52, 53, 54]);
    expect(p.start).toBe(51);
    expect(p.end).toBe(55);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(false);
  });

  it('clamps a stale offset past the end to the last page', () => {
    const p = windowPage(nums(55), { offset: 999, size: 50 });
    expect(p.start).toBe(51);
    expect(p.end).toBe(55);
    expect(p.hasNext).toBe(false);
  });

  it('fits everything on one page when total <= size (no paging)', () => {
    const p = windowPage(nums(10), { offset: 0, size: 50 });
    expect(p.items).toHaveLength(10);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });

  it('reports an empty list cleanly', () => {
    const p = windowPage<number>([], { offset: 0, size: 50 });
    expect(p.items).toEqual([]);
    expect(p.total).toBe(0);
    expect(p.start).toBe(0);
    expect(p.end).toBe(0);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });
});
