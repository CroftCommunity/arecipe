// D4 — fetch stage. Fetches wikitext for new/changed pageids only, batched at
// the 50-cap. Each revision is written to raw/<pageid>/<revid>.json — content-
// addressable by revid, never mutated, only added to (keeping the previous
// revision's file so a six-month wikitext diff is one `diff` away). Resumable:
// progress.json records completed pageids after every batch, so a killed run
// costs exactly one batch.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from './util/clock.ts';
import type { PageContent } from './http/wiki-client.ts';

export type ContentFetcher = {
  fetchContent(pageids: number[]): Promise<PageContent[]>;
};

export type RawRecord = {
  pageid: number;
  title: string;
  revid: number;
  timestamp: string;
  wikitext: string;
  fetchedAt: string;
  requestUrl: string;
};

export type FetchOptions = {
  rawDir: string;
  runDir: string;
  clock: Clock;
  batchSize?: number;
};

export type FetchStageResult = {
  pagesWritten: number;
  batchesFetched: number;
  resumedSkipped: number;
};

const DEFAULT_BATCH = 50;

type Progress = { completed: number[] };

const progressPath = (runDir: string): string => join(runDir, 'progress.json');

const readProgress = (runDir: string): Progress => {
  const p = progressPath(runDir);
  if (!existsSync(p)) return { completed: [] };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Progress;
    return { completed: parsed.completed ?? [] };
  } catch {
    return { completed: [] };
  }
};

const writeProgress = (runDir: string, progress: Progress): void => {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(progressPath(runDir), JSON.stringify(progress, null, 2));
};

const rawPath = (rawDir: string, pageid: number, revid: number): string =>
  join(rawDir, String(pageid), `${revid}.json`);

const writeRaw = (rawDir: string, rec: RawRecord): void => {
  const dir = join(rawDir, String(rec.pageid));
  mkdirSync(dir, { recursive: true });
  const path = rawPath(rawDir, rec.pageid, rec.revid);
  // Immutable: never rewrite an existing revision file.
  if (existsSync(path)) return;
  writeFileSync(path, JSON.stringify(rec, null, 2));
};

/**
 * Fetch content for `pageids` (already filtered to new/changed by discovery),
 * writing raw files and updating progress after every batch. Re-running with the
 * same runDir resumes: already-completed pageids are skipped.
 */
export const fetchStage = async (
  fetcher: ContentFetcher,
  pageids: number[],
  opts: FetchOptions,
): Promise<FetchStageResult> => {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const progress = readProgress(opts.runDir);
  const done = new Set(progress.completed);
  const remaining = pageids.filter((id) => !done.has(id));
  const resumedSkipped = pageids.length - remaining.length;

  let pagesWritten = 0;
  let batchesFetched = 0;
  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const contents = await fetcher.fetchContent(batch);
    batchesFetched++;
    for (const c of contents) {
      writeRaw(opts.rawDir, {
        pageid: c.pageid,
        title: c.title,
        revid: c.revid,
        timestamp: c.timestamp,
        wikitext: c.wikitext,
        fetchedAt: new Date(opts.clock.now()).toISOString(),
        requestUrl: c.requestUrl,
      });
      pagesWritten++;
      done.add(c.pageid);
    }
    // Persist progress AFTER the batch's raw files are on disk, so a crash before
    // this line re-fetches the batch and a crash after it does not.
    writeProgress(opts.runDir, { completed: [...done] });
  }
  return { pagesWritten, batchesFetched, resumedSkipped };
};

/** Read the newest-revision raw record for a page, or undefined if none. */
export const latestRawFor = (rawDir: string, pageid: number): RawRecord | undefined => {
  const dir = join(rawDir, String(pageid));
  if (!existsSync(dir)) return undefined;
  const revids = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => Number(f.replace('.json', '')))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  const newest = revids[0];
  if (newest === undefined) return undefined;
  return JSON.parse(readFileSync(rawPath(rawDir, pageid, newest), 'utf8')) as RawRecord;
};

/** Every pageid that has at least one raw revision on disk. */
export const rawPageIds = (rawDir: string): number[] => {
  if (!existsSync(rawDir)) return [];
  return readdirSync(rawDir)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
};
