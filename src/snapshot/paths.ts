// Snapshot bundle paths (RUN-BUNDLE-PRECACHE). The build id is baked into the
// page bundles at build time (__SNAPSHOT_BUILD__, see scripts/build.mjs), so the
// boot path knows the exact, immutable, precached index.json URL with zero
// runtime lookup — the fetch hits the Cache API and never the network.

declare const __SNAPSHOT_BUILD__: string;

/** The active build id. `typeof` guards the un-defined case (vitest, dev serve)
 * without throwing on the bare identifier. */
export const snapshotBuildId = (): string =>
  typeof __SNAPSHOT_BUILD__ === 'string' ? __SNAPSHOT_BUILD__ : 'dev';

export const snapshotBase = (buildId: string = snapshotBuildId()): string =>
  `./assets/snapshot/${buildId}`;

export const indexPath = (buildId?: string): string => `${snapshotBase(buildId)}/index.json`;
export const manifestPath = (buildId?: string): string => `${snapshotBase(buildId)}/manifest.json`;

/** A cook's shard file (single-file cooks) or a specific part (sharded cooks).
 * `shardFile` is the index/manifest-relative name (`cooks/<did>.json`). */
export const cookShardPath = (did: string, buildId?: string): string =>
  `${snapshotBase(buildId)}/cooks/${did}.json`;
export const shardFilePath = (shardFile: string, buildId?: string): string =>
  `${snapshotBase(buildId)}/${shardFile}`;
