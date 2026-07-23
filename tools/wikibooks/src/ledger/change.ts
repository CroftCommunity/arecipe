// The two independent change axes (D2). This is the intelligence the brief asks
// for: distinguish "the wiki moved" from "our parser got better."
//
//   axis 1 — upstream: revid differs from the ledger. Requires a wiki fetch.
//   axis 2 — local:    transform_version differs, OR re-transforming stored raw
//                      content yields a different ir_sha256. No wiki traffic.
//
// Either axis triggers a republish. Only axis 1 triggers a fetch.
import type { RecipeRow } from './ledger.ts';

export type ChangeAxes = { upstreamChanged: boolean; localChanged: boolean };

export type Observed = {
  revid: number;
  irSha256: string;
  transformVersion: number;
};

export const computeAxes = (row: RecipeRow, obs: Observed): ChangeAxes => ({
  upstreamChanged: row.revid !== obs.revid,
  localChanged: row.transform_version !== obs.transformVersion || row.ir_sha256 !== obs.irSha256,
});

export const needsRepublish = (axes: ChangeAxes): boolean =>
  axes.upstreamChanged || axes.localChanged;

/** Only axis 1 justifies spending a wiki request. */
export const needsFetch = (axes: ChangeAxes): boolean => axes.upstreamChanged;
