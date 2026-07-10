// Generic offset-window pagination. Pure: windows an already-prepared list to a
// page and reports the state prev/next arrows and a "Showing X–Y of N" hint
// need. A stale offset past the end clamps to the last page.

/** A page window over `items`. `start`/`end` are 1-based (0 when empty). */
export type Page<T> = {
  items: T[];
  total: number;
  start: number;
  end: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export const windowPage = <T>(items: readonly T[], opts: { offset: number; size: number }): Page<T> => {
  const total = items.length;
  if (total === 0) {
    return { items: [], total: 0, start: 0, end: 0, hasPrev: false, hasNext: false };
  }
  const lastOffset = Math.floor((total - 1) / opts.size) * opts.size;
  const offset = Math.min(Math.max(0, opts.offset), lastOffset);
  const page = items.slice(offset, offset + opts.size);
  return {
    items: page,
    total,
    start: offset + 1,
    end: offset + page.length,
    hasPrev: offset > 0,
    hasNext: offset + opts.size < total,
  };
};
