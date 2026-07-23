// D3 — delta discovery. Full enumeration + a batched revision sweep, classified
// against the ledger. Deliberately NO recentchanges anywhere in this module: a
// six-month gap exceeds $wgRCMaxAge (30 days), so recentchanges would silently
// miss five months of edits. The constraint has a test named for it (d3).
import type { WikiClient } from './http/wiki-client.ts';
import type { Config } from './config.ts';
import type { Ledger, RecipeRow } from './ledger/ledger.ts';

export type EnumPage = { pageid: number; title: string };
export type RevInfo = { pageid: number; revid: number; timestamp: string };

export type Classified = {
  newPages: EnumPage[];
  changed: EnumPage[];
  unchanged: EnumPage[];
  vanished: number[];
};

/**
 * Classify each pageid by comparing the ledger against the fresh enumeration +
 * revision sweep. Keyed by pageid throughout, so a title change on a kept pageid
 * lands in `changed`, never as a `vanished` + `new` pair.
 */
export const classifyPages = (
  ledgerRows: RecipeRow[],
  enumeration: EnumPage[],
  revs: RevInfo[],
): Classified => {
  const ledgerByPage = new Map(ledgerRows.map((r) => [r.pageid, r]));
  const revByPage = new Map(revs.map((r) => [r.pageid, r]));
  const enumeratedIds = new Set(enumeration.map((p) => p.pageid));

  const newPages: EnumPage[] = [];
  const changed: EnumPage[] = [];
  const unchanged: EnumPage[] = [];
  for (const page of enumeration) {
    const row = ledgerByPage.get(page.pageid);
    if (row === undefined) {
      newPages.push(page);
      continue;
    }
    const rev = revByPage.get(page.pageid);
    if (rev !== undefined && rev.revid !== row.revid) changed.push(page);
    else unchanged.push(page);
  }

  // Only ACTIVE rows can vanish — a row already decategorised/deleted must not
  // re-trigger every run.
  const vanished: number[] = [];
  for (const row of ledgerRows) {
    if (row.status === 'active' && !enumeratedIds.has(row.pageid)) vanished.push(row.pageid);
  }

  return { newPages, changed, unchanged, vanished };
};

export type VanishedSplit = { decategorised: number[]; deleted: number[] };

/**
 * Resolve each vanished pageid with a prop=info follow-up. Still exists →
 * decategorised (the {{Recipe}} template was removed); gone → deleted. Both get
 * their record retracted, but they are reported separately because a bulk
 * upstream decategorisation must be visible, not silent.
 */
export const resolveVanished = async (
  pageids: number[],
  pageInfo: (pageid: number) => Promise<{ missing: boolean }>,
): Promise<VanishedSplit> => {
  const decategorised: number[] = [];
  const deleted: number[] = [];
  for (const id of pageids) {
    const info = await pageInfo(id);
    if (info.missing) deleted.push(id);
    else decategorised.push(id);
  }
  return { decategorised, deleted };
};

export class BlastRadiusError extends Error {
  readonly vanishedCount: number;
  readonly ledgerCount: number;
  constructor(vanishedCount: number, ledgerCount: number) {
    const pct = ledgerCount === 0 ? 0 : ((vanishedCount / ledgerCount) * 100).toFixed(1);
    super(
      `blast-radius guard: ${vanishedCount} of ${ledgerCount} ledger recipes vanished ` +
        `(${pct}%), over the 5% threshold. Aborting before any PDS write. A category ` +
        `rename or template edit upstream must not be able to gut the corpus unattended.`,
    );
    this.name = 'BlastRadiusError';
    this.vanishedCount = vanishedCount;
    this.ledgerCount = ledgerCount;
  }
};

export const BLAST_RADIUS_THRESHOLD = 0.05;

/** Throw if vanished EXCEEDS 5% of the ledger (strict — exactly 5% is allowed). */
export const assertBlastRadius = (vanishedCount: number, ledgerCount: number): void => {
  if (ledgerCount === 0) return;
  if (vanishedCount / ledgerCount > BLAST_RADIUS_THRESHOLD) {
    throw new BlastRadiusError(vanishedCount, ledgerCount);
  }
};

export type FlatnessReport = {
  flatCount: number;
  subcatSum: number;
  ok: boolean;
  fallbackUsed: boolean;
  discrepancy: number;
  note: string;
};

/**
 * VERIFY category flatness. Compare the flat Category:Recipes enumeration count
 * against the sum of the "Category:Recipes by difficulty" subcategories. If the
 * flat count is materially smaller (<90%), the category is not the complete
 * automatic enumeration we assume — fall back to a recursive subcategory walk
 * (depth cap 3, visited-set cycle guard) and report the discrepancy prominently.
 */
export const verifyCategoryFlatness = async (
  client: WikiClient,
  flatCount: number,
): Promise<FlatnessReport> => {
  const subcats = await client.enumerateSubcategories('Category:Recipes by difficulty');
  let subcatSum = 0;
  for (const sc of subcats) subcatSum += await client.categoryCount(sc);
  const ratio = subcatSum === 0 ? 1 : flatCount / subcatSum;
  const ok = ratio >= 0.9;
  const discrepancy = subcatSum - flatCount;
  return {
    flatCount,
    subcatSum,
    ok,
    fallbackUsed: !ok,
    discrepancy,
    note: ok
      ? `flat enumeration (${flatCount}) covers the difficulty subcategories (${subcatSum})`
      : `FLAT ENUMERATION SHORT: ${flatCount} vs subcategory sum ${subcatSum} (short by ${discrepancy}); recursive subcategory-walk fallback engaged`,
  };
};

/**
 * Recursive subcategory walk fallback: gather page members across a category
 * tree, depth-capped at 3 with a visited-set cycle guard. Used only when the
 * flat enumeration is materially short.
 */
export const recursiveCategoryWalk = async (
  client: WikiClient,
  rootCategory: string,
  maxDepth = 3,
): Promise<EnumPage[]> => {
  const seenCats = new Set<string>();
  const byPage = new Map<number, EnumPage>();
  const walk = async (category: string, depth: number): Promise<void> => {
    if (depth > maxDepth || seenCats.has(category)) return;
    seenCats.add(category);
    for (const p of await client.enumerateRecipes(category)) byPage.set(p.pageid, p);
    for (const sub of await client.enumerateSubcategories(category)) await walk(sub, depth + 1);
  };
  await walk(rootCategory, 0);
  return [...byPage.values()].sort((a, b) => a.pageid - b.pageid);
};

export type DiscoveryResult = {
  namespaceId: number;
  newPages: EnumPage[];
  changed: EnumPage[];
  unchanged: EnumPage[];
  decategorised: number[];
  deleted: number[];
  vanishedCount: number;
  activeLedgerCount: number;
};

/**
 * Orchestrate discovery: verify the namespace, enumerate, sweep revisions,
 * classify, and resolve vanished pages. Does NOT itself apply the blast-radius
 * guard or write anything — the caller runs `assertBlastRadius` before any fetch
 * or PDS write, so the guard can abort with the plan already written.
 */
export const discover = async (
  client: WikiClient,
  ledger: Ledger,
  cfg: Config,
): Promise<DiscoveryResult> => {
  const namespaceId = await client.resolveCookbookNamespaceId();
  if (namespaceId !== cfg.expectedCookbookNamespaceId) {
    throw new Error(
      `Cookbook namespace id resolved to ${namespaceId} but config expected ` +
        `${cfg.expectedCookbookNamespaceId}. Refusing to proceed on a stale assumption.`,
    );
  }
  const enumeration = await client.enumerateRecipes();
  const revs = await client.revisionSweep(enumeration.map((p) => p.pageid));
  const rows = ledger.all();
  const classified = classifyPages(rows, enumeration, revs);
  const split = await resolveVanished(classified.vanished, (id) => client.pageInfo(id));
  const activeLedgerCount = rows.filter((r) => r.status === 'active').length;
  return {
    namespaceId,
    newPages: classified.newPages,
    changed: classified.changed,
    unchanged: classified.unchanged,
    decategorised: split.decategorised,
    deleted: split.deleted,
    vanishedCount: classified.vanished.length,
    activeLedgerCount,
  };
};
