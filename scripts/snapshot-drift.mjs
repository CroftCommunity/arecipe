// snapshot-refresh guard. Compares a freshly captured snapshot manifest against
// the one the live site serves and answers ONE question: should this refresh
// deploy? Pure logic in snapshotDrift (unit-tested in
// tests/unit/snapshot/drift.spec.ts); the CLI below is the workflow's thin
// shell around it. See .github/workflows/snapshot-refresh.yml for why a
// no-change refresh must not deploy (a new version string costs every client a
// full snapshot refetch).
import { readFileSync } from 'node:fs';

/**
 * @param {{ captured: { cooks: { did: string; rev: string }[] }, live: { cooks: { did: string; rev: string }[] } }} opts
 * @returns {{ changed: boolean; moved: { did: string; from: string | null; to: string }[]; dropped: string[] }}
 */
export function snapshotDrift({ captured, live }) {
  const liveRev = new Map(live.cooks.map((c) => [c.did, c.rev]));
  const capturedDids = new Set(captured.cooks.map((c) => c.did));
  const moved = captured.cooks
    .filter((c) => liveRev.get(c.did) !== c.rev)
    .map((c) => ({ did: c.did, from: liveRev.get(c.did) ?? null, to: c.rev }));
  const dropped = live.cooks.filter((c) => !capturedDids.has(c.did)).map((c) => c.did);
  return { changed: moved.length > 0, moved, dropped };
}

/** Fetch the manifest the live site currently serves, via its build-info. */
async function fetchLiveManifest(siteUrl) {
  const info = await (await fetch(`${siteUrl}/build-info.json`, { cache: 'no-store' })).json();
  if (typeof info.version !== 'string') throw new Error(`${siteUrl}/build-info.json has no version`);
  const url = `${siteUrl}/assets/snapshot/${info.version}/manifest.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`live manifest ${url} → HTTP ${res.status}`);
  return { version: info.version, manifest: await res.json() };
}

async function main(argv) {
  const [capturedPath, siteUrl] = argv;
  if (!capturedPath || !siteUrl) {
    console.error('usage: node scripts/snapshot-drift.mjs <captured manifest.json> <live site url>');
    return 1;
  }
  const captured = JSON.parse(readFileSync(capturedPath, 'utf8'));
  // A failure to read the live side is NOT "changed": fail the run with words
  // and let tomorrow retry — the last good snapshot stays live.
  const { version, manifest: live } = await fetchLiveManifest(siteUrl);
  const drift = snapshotDrift({ captured, live });
  const deploy = drift.changed && drift.dropped.length === 0;
  const { appendFileSync } = await import('node:fs');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);

  console.log(`live build ${version}: ${live.cooks.length} cook(s); captured ${captured.cooks.length} cook(s)`);
  for (const m of drift.moved) console.log(`  moved   ${m.did}  ${m.from ?? '(new)'} → ${m.to}`);
  for (const d of drift.dropped) console.log(`  DROPPED ${d} — captured manifest lacks a cook the live site serves`);
  if (drift.dropped.length > 0) {
    console.error('refusing to deploy: the capture lost a cook; deploying would drop them from the live snapshot');
    return 2;
  }
  console.log(deploy ? 'deploy: a seed repo moved' : 'skip: every seed repo is at the rev the live site already serves');
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exitCode = await main(process.argv.slice(2));
}
