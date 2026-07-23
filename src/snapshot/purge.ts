// D5: which precached snapshot files to purge on service-worker activate. Pure
// so it is unit-testable off the SW. A cache entry belongs to a snapshot build
// if its URL path is `/assets/snapshot/<buildId>/...`; it is purged unless its
// build id is in the keep set.
//
// The keep set is the active build PLUS any pinned builds. This is load-bearing:
// a version-pinned install pins the current version only and refuses upgrades,
// so it must keep its own snapshot — the purge must never delete the pinned
// build's directory even after a newer build's worker would otherwise activate.

const SNAPSHOT_DIR = /\/assets\/snapshot\/([^/]+)\//;

export const snapshotDirsToPurge = (cachedUrls: string[], keepBuildIds: Iterable<string>): string[] => {
  const keep = new Set(keepBuildIds);
  const purge: string[] = [];
  for (const url of cachedUrls) {
    const match = SNAPSHOT_DIR.exec(url);
    if (match !== null && !keep.has(match[1]!)) purge.push(url);
  }
  return purge;
};
