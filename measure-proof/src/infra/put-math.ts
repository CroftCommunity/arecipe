// E7 — receiver/infra fit, as arithmetic.
//
// The measurement service is one canonical SQLite DB replicated to R2 by
// Litestream (matching the existing kit shape: Caddy vhost, systemd unit,
// Litestream → R2). R2 Class-A operations (PUTs) have a 1M/month free tier.
//
// The key structural fact, confirmed by the prior run: Litestream PUTs are
// driven by its SYNC INTERVAL, not directly by flush cadence. Each sync interval
// that contains ≥1 write uploads a WAL segment (~1 PUT). So the WAL-PUT count is
// bounded above by intervals/month = 2,592,000 / syncIntervalSec — independent
// of how many writes happen. At a 1s interval on a continuously-written DB that
// ceiling is 2,592,000 ≈ the prior box's ~2.6M/month, over the free tier.

export const SECONDS_PER_MONTH = 2_592_000; // 30 days

export type Cadence = 'per-session' | 'hourly' | 'daily';

export interface PutModel {
  syncIntervalSec: number;
  /** Litestream periodic snapshots (default ~daily). */
  snapshotsPerMonth: number;
  /** PUTs per snapshot (snapshot object + generation/retention housekeeping). */
  putsPerSnapshot: number;
}

export const DEFAULT_MODEL: PutModel = {
  syncIntervalSec: 1,
  snapshotsPerMonth: 30,
  putsPerSnapshot: 3,
};

/** WAL-PUT ceiling at a sync interval: the DB can be written no more often than this many times/month. */
export function intervalsPerMonth(syncIntervalSec: number): number {
  return Math.floor(SECONDS_PER_MONTH / syncIntervalSec);
}

/** Per-site DB writes/month, capped by the flush cadence. */
export function flushesPerMonth(cadence: Cadence, sessionsPerSiteMonth: number): number {
  switch (cadence) {
    case 'per-session':
      return sessionsPerSiteMonth;
    case 'hourly':
      return Math.min(sessionsPerSiteMonth, 24 * 30); // ≤ one flush/hour
    case 'daily':
      return Math.min(sessionsPerSiteMonth, 30); // ≤ one flush/day
  }
}

/**
 * Estimated R2 PUTs/month for N sites feeding one shared DB.
 * WAL PUTs = min(interval ceiling, aggregate writes) — writes within one sync
 * interval coalesce into a single segment upload — plus snapshot overhead.
 */
export function putsPerMonth(
  sites: number,
  cadence: Cadence,
  sessionsPerSiteMonth: number,
  model: PutModel,
): number {
  const aggregateWrites = sites * flushesPerMonth(cadence, sessionsPerSiteMonth);
  const walPuts = Math.min(intervalsPerMonth(model.syncIntervalSec), aggregateWrites);
  return walPuts + model.snapshotsPerMonth * model.putsPerSnapshot;
}

/**
 * Smallest site count whose PUTs/month exceed `budget`. Returns Infinity when the
 * interval ceiling itself is under budget (WAL PUTs can never cross it, no matter
 * how many sites) — the "no crossover" case.
 */
export function crossoverSites(
  cadence: Cadence,
  sessionsPerSiteMonth: number,
  model: PutModel,
  budget = 1_000_000,
): number {
  const ceiling = intervalsPerMonth(model.syncIntervalSec) + model.snapshotsPerMonth * model.putsPerSnapshot;
  if (ceiling <= budget) return Infinity; // WAL PUTs cannot exceed budget
  const perSite = flushesPerMonth(cadence, sessionsPerSiteMonth);
  if (perSite <= 0) return Infinity;
  // Find smallest N with putsPerMonth(N) > budget.
  const overhead = model.snapshotsPerMonth * model.putsPerSnapshot;
  const need = budget - overhead;
  return Math.floor(need / perSite) + 1;
}
