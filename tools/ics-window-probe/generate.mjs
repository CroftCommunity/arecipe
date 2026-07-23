// Emit the EXP-ICS-WINDOW probe feeds from the TESTED pure builder (feed.mjs).
// Run:  node tools/ics-window-probe/generate.mjs   (writes tools/ics-window-probe/feeds/*.ics)
//
// Dates are computed once from a FIXED base (2026-07-23, the experiment's "day
// 0") so the files are byte-reproducible — no wall clock. E1/E2/E3 are the three
// canonical probe events; the DTSTAMP is a fixed injected instant.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildProbeIcs, cancel } from './feed.mjs';

const BASE = '2026-07-23'; // experiment day 0
const DTSTAMP = '2026-07-23T12:00:00Z';

const offset = (isoBase, days) => {
  const [y, m, d] = isoBase.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const E1 = { uid: 'exp-ics-window-e1@arecipe.app', date: offset(BASE, -60), summary: 'ICS-WINDOW E1 (60 days past)', sequence: 0 };
const E2 = { uid: 'exp-ics-window-e2@arecipe.app', date: offset(BASE, -30), summary: 'ICS-WINDOW E2 (30 days past)', sequence: 0 };
const E3 = { uid: 'exp-ics-window-e3@arecipe.app', date: offset(BASE, 7), summary: 'ICS-WINDOW E3 (7 days future)', sequence: 0 };

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'feeds');

const feeds = {
  // Arm 1 — silent omission. Feed B simply drops E1's VEVENT.
  'arm1-feedA.ics': buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP, calName: 'EXP-ICS-WINDOW arm1 (omission)' }),
  'arm1-feedB.ics': buildProbeIcs([E2, E3], { dtstamp: DTSTAMP, calName: 'EXP-ICS-WINDOW arm1 (omission)' }),
  // Arm 2 — explicit cancellation. Feed B keeps E1 as a STATUS:CANCELLED tombstone
  // with SEQUENCE:1. Served from a SEPARATE URL from arm 1.
  'arm2-feedA.ics': buildProbeIcs([E1, E2, E3], { dtstamp: DTSTAMP, calName: 'EXP-ICS-WINDOW arm2 (cancellation)' }),
  'arm2-feedB.ics': buildProbeIcs([cancel(E1), E2, E3], { dtstamp: DTSTAMP, calName: 'EXP-ICS-WINDOW arm2 (cancellation)' }),
};

for (const [name, body] of Object.entries(feeds)) {
  writeFileSync(join(outDir, name), body);
  process.stdout.write(`wrote ${name} (${Buffer.byteLength(body)} bytes)\n`);
}
