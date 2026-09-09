// Types for snapshot-drift.mjs so tests/unit/snapshot/drift.spec.ts can import
// it under strict TS (same pattern as md-to-html.d.mts).
export type ManifestCook = { did: string; rev: string };
export type DriftInput = { captured: { cooks: ManifestCook[] }; live: { cooks: ManifestCook[] } };
export type Drift = {
  changed: boolean;
  moved: { did: string; from: string | null; to: string }[];
  dropped: string[];
};
export function snapshotDrift(opts: DriftInput): Drift;
