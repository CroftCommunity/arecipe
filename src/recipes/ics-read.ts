// Read-only PDS reader for the .ics feed generator: a DID → all its
// app.arecipe.mealPlan records, resolving the DID's PDS host and following
// listRecords cursor pages. UNAUTHENTICATED — the data is public (CORS-open,
// D2-verified) — so it runs under Node with no credentials, which is what lets
// the scheduled Action publish with no secrets.
//
// It reuses `planFromRecord` (the sync module's record→plan mapping) so the feed
// and the app's cross-device recovery decode a record identically, and tolerates
// malformed records the same way (skip + warn, open-world). This is a read-only
// sibling of `listPdsPlans` (which is pds-scoped and single-page); it is DID-
// scoped and cursor-following, for the potentially unbounded feed history.

import { log } from '../log.js';
import { resolveDidDoc } from '../identity/did.js';
import type { LocalPlan } from './meal-plan-local.js';
import { MEAL_PLAN_COLLECTION, planFromRecord } from './meal-plan-sync.js';

/** listRecords page size. The PDS caps this (typically 100); we page past it. */
const PAGE_LIMIT = 100;
/** Backstop against a pathological/looping cursor — far above any real history. */
const MAX_PAGES = 1000;

export type ListMealPlansOpts = {
  /** Injectable fetch (tests, or a custom agent). Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable DID→PDS-host resolver. Defaults to plc.directory via `resolveDidDoc`. */
  resolvePds?: (did: string) => Promise<string>;
};

type ListRecordsPage = {
  records: { uri: string; value: Record<string, unknown> }[];
  cursor?: string;
};

/** Every `app.arecipe.mealPlan` record for `did`, in repo order, malformed
 * records skipped. Resolves the DID's PDS then follows listRecords cursors to
 * the end. Throws only on resolution failure or a non-ok list response. */
export const listMealPlans = async (did: string, opts: ListMealPlansOpts = {}): Promise<LocalPlan[]> => {
  const fetchFn = opts.fetchFn ?? fetch;
  const resolvePds = opts.resolvePds ?? (async (d) => (await resolveDidDoc(d, fetchFn)).pds);

  const pds = await resolvePds(did);
  const plans: LocalPlan[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', MEAL_PLAN_COLLECTION);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    if (cursor !== undefined) url.searchParams.set('cursor', cursor);

    const res = await fetchFn(url.toString());
    if (!res.ok) throw new Error(`meal-plan list failed (HTTP ${res.status}) for ${did}`);
    const body = (await res.json()) as ListRecordsPage;

    for (const record of body.records) {
      try {
        plans.push(planFromRecord(record.uri, record.value));
      } catch (err) {
        log.warn('meal-plan', 'skipping malformed PDS plan', { uri: record.uri, error: String(err) });
      }
    }
    cursor = body.cursor !== undefined && body.cursor !== '' ? body.cursor : undefined;
    pages += 1;
  } while (cursor !== undefined && pages < MAX_PAGES);

  if (cursor !== undefined) {
    log.warn('meal-plan', 'listMealPlans hit the page cap; feed may be truncated', { did, pages });
  }
  return plans;
};
