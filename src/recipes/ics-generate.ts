// Generator orchestration: for each configured DID, read its meal plans and write
// one `.ics` file. All I/O is INJECTED (the reader and the file writer), so this
// stays pure-ish and unit-testable; the real fs/network wiring lives in the
// esbuild-bundled CLI (scripts/build-ics-feed.mjs). Deterministic: identical PDS
// data yields byte-identical files, so the scheduled Action commits nothing on a
// no-op run.

import { buildCalendar, type BuildOpts } from './ics-assemble.js';
import { feedFileName } from './ics-feed-path.js';
import type { LocalPlan } from './meal-plan-local.js';

export { feedFileName, feedPath, FEED_DIR } from './ics-feed-path.js';

export type GenerateDeps = {
  /** Read all meal-plan records for a DID (Phase 4's `listMealPlans`). */
  listMealPlans: (did: string) => Promise<LocalPlan[]>;
  /** Persist one feed file: `(basename, icsContent)`. The caller owns the
   * directory (e.g. writes into `calendars/`). */
  writeFile: (fileName: string, content: string) => Promise<void>;
  /** Passed through to the assembler (prodId / siteOrigin overrides). */
  buildOpts?: BuildOpts;
  /** Optional progress line per feed. */
  log?: (message: string) => void;
};

export type GeneratedFeed = {
  did: string;
  fileName: string;
  plans: number;
  events: number;
  bytes: number;
};

/** Count the VEVENTs in a rendered calendar (for logging/verification). */
const countEvents = (ics: string): number => (ics.match(/^BEGIN:VEVENT$/gm) ?? []).length;

/** Generate and write one feed per DID. Returns a per-feed summary. A DID whose
 * read fails is reported (via `log`) and skipped, so one bad DID cannot sink the
 * whole run. */
export const generateFeeds = async (
  dids: readonly string[],
  deps: GenerateDeps,
): Promise<GeneratedFeed[]> => {
  const out: GeneratedFeed[] = [];
  for (const did of dids) {
    let plans: LocalPlan[];
    try {
      plans = await deps.listMealPlans(did);
    } catch (err) {
      deps.log?.(`skip ${did}: read failed — ${String(err)}`);
      continue;
    }
    const ics = buildCalendar(plans, deps.buildOpts);
    const fileName = feedFileName(did);
    await deps.writeFile(fileName, ics);
    const feed: GeneratedFeed = {
      did,
      fileName,
      plans: plans.length,
      events: countEvents(ics),
      bytes: ics.length,
    };
    deps.log?.(`wrote ${fileName}: ${feed.plans} plan(s), ${feed.events} event(s), ${feed.bytes}B`);
    out.push(feed);
  }
  return out;
};
