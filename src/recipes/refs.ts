// strongRefs + revision staleness (Phase 8). A strongRef pins content
// (AT-URI + CID); the AT-URI alone follows the latest revision. Editing a
// recipe changes its CID, so anything holding the old CID can detect it is
// looking at (or referencing) an older version. Consumers today: the cache
// (pinned at view time → "updated since you last viewed" on the detail
// page). Phase 9's comments/interactions reuse these helpers.

export type StrongRef = { uri: string; cid: string };

/** com.atproto.repo.strongRef of any {uri, cid} carrier. */
export const strongRefOf = (entry: { uri: string; cid: string }): StrongRef => ({
  uri: entry.uri,
  cid: entry.cid,
});

export const sameRevision = (cidA: string, cidB: string): boolean => cidA === cidB;

/** Is the pinned revision no longer the current one? */
export const isStale = (args: { pinnedCid: string; currentCid: string }): boolean =>
  !sameRevision(args.pinnedCid, args.currentCid);
