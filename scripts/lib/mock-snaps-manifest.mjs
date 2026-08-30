// The snaps manifest, merged per file (tests/unit/mock-snaps-manifest.spec.ts says
// why). Every file carries its own `baseline` (<repo>@<sha>) and `population`; the
// manifest's only top-level field is the day of the last run.

/** @param {{capturedAt: string, files: object[]} | null} existing
 *  @param {{capturedAt: string, files: object[]}} run */
export function mergeManifest(existing, run) {
  const fresh = new Map(run.files.map((f) => [f.file, f]));
  const kept = (existing?.files ?? []).map((f) => fresh.get(f.file) ?? f);
  const seen = new Set(kept.map((f) => f.file));
  const added = run.files.filter((f) => !seen.has(f.file));
  return { capturedAt: run.capturedAt, files: [...kept, ...added] };
}
