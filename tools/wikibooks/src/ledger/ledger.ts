// D2 — the ledger. SQLite (node:sqlite, zero deps), one row per recipe keyed by
// pageid. Page moves keep the pageid and change the title; keying by title would
// manufacture delete+create pairs on every rename. Also a `runs` table.
import { DatabaseSync } from 'node:sqlite';

export type RecipeStatus = 'active' | 'decategorised' | 'deleted' | 'skipped';

export type RecipeRow = {
  pageid: number;
  title: string;
  revid: number;
  rev_timestamp: string | null;
  raw_sha256: string | null;
  ir_sha256: string | null;
  transform_version: number | null;
  status: RecipeStatus;
  skip_reason: string | null;
  record_rkey: string | null;
  record_cid: string | null;
  published_at: string | null;
  published_repo_rev: string | null;
  first_seen: string | null;
  last_seen: string | null;
};

export type RunCounts = {
  new: number;
  changed: number;
  unchanged: number;
  decategorised: number;
  deleted: number;
  skipped: number;
};

export type RunRow = {
  id: number;
  started: string;
  finished: string | null;
  mode: string;
  counts_json: string;
  wiki_requests: number;
  pds_writes: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipes (
  pageid             INTEGER PRIMARY KEY,
  title              TEXT    NOT NULL,
  revid              INTEGER NOT NULL,
  rev_timestamp      TEXT,
  raw_sha256         TEXT,
  ir_sha256          TEXT,
  transform_version  INTEGER,
  status             TEXT    NOT NULL DEFAULT 'active',
  skip_reason        TEXT,
  record_rkey        TEXT,
  record_cid         TEXT,
  published_at       TEXT,
  published_repo_rev TEXT,
  first_seen         TEXT,
  last_seen          TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started       TEXT    NOT NULL,
  finished      TEXT,
  mode          TEXT    NOT NULL,
  counts_json   TEXT    NOT NULL DEFAULT '{}',
  wiki_requests INTEGER NOT NULL DEFAULT 0,
  pds_writes    INTEGER NOT NULL DEFAULT 0
);
`;

const COLS: (keyof RecipeRow)[] = [
  'pageid', 'title', 'revid', 'rev_timestamp', 'raw_sha256', 'ir_sha256',
  'transform_version', 'status', 'skip_reason', 'record_rkey', 'record_cid',
  'published_at', 'published_repo_rev', 'first_seen', 'last_seen',
];

export class Ledger {
  private readonly db: DatabaseSync;
  private nowFn: () => string;

  constructor(db: DatabaseSync, nowFn: () => string) {
    this.db = db;
    this.nowFn = nowFn;
    this.db.exec(SCHEMA);
  }

  upsert(row: RecipeRow): void {
    const placeholders = COLS.map(() => '?').join(', ');
    const updates = COLS.filter((c) => c !== 'pageid')
      .map((c) => `${c}=excluded.${c}`)
      .join(', ');
    const stmt = this.db.prepare(
      `INSERT INTO recipes (${COLS.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(pageid) DO UPDATE SET ${updates}`,
    );
    stmt.run(...COLS.map((c) => normalize(row[c])));
  }

  get(pageid: number): RecipeRow | undefined {
    const raw = this.db.prepare('SELECT * FROM recipes WHERE pageid = ?').get(pageid);
    return raw === undefined ? undefined : toRow(raw as Record<string, unknown>);
  }

  all(): RecipeRow[] {
    return (this.db.prepare('SELECT * FROM recipes ORDER BY pageid').all() as Record<string, unknown>[]).map(
      toRow,
    );
  }

  allWithStatus(status: RecipeStatus): RecipeRow[] {
    return (
      this.db.prepare('SELECT * FROM recipes WHERE status = ? ORDER BY pageid').all(status) as Record<
        string,
        unknown
      >[]
    ).map(toRow);
  }

  count(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM recipes').get() as { n: number };
    return r.n;
  }

  startRun(mode: string): number {
    const stmt = this.db.prepare('INSERT INTO runs (started, mode) VALUES (?, ?)');
    const info = stmt.run(this.nowFn(), mode);
    return Number(info.lastInsertRowid);
  }

  finishRun(
    id: number,
    result: { counts: RunCounts; wikiRequests: number; pdsWrites: number },
  ): void {
    this.db
      .prepare('UPDATE runs SET finished = ?, counts_json = ?, wiki_requests = ?, pds_writes = ? WHERE id = ?')
      .run(this.nowFn(), JSON.stringify(result.counts), result.wikiRequests, result.pdsWrites, id);
  }

  runs(): RunRow[] {
    return this.db.prepare('SELECT * FROM runs ORDER BY id').all() as unknown as RunRow[];
  }

  lastRun(): RunRow | undefined {
    const r = this.db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get();
    return r === undefined ? undefined : (r as unknown as RunRow);
  }

  close(): void {
    this.db.close();
  }
}

const normalize = (v: unknown): string | number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
};

const toRow = (r: Record<string, unknown>): RecipeRow => ({
  pageid: r.pageid as number,
  title: r.title as string,
  revid: r.revid as number,
  rev_timestamp: (r.rev_timestamp ?? null) as string | null,
  raw_sha256: (r.raw_sha256 ?? null) as string | null,
  ir_sha256: (r.ir_sha256 ?? null) as string | null,
  transform_version: (r.transform_version ?? null) as number | null,
  status: r.status as RecipeStatus,
  skip_reason: (r.skip_reason ?? null) as string | null,
  record_rkey: (r.record_rkey ?? null) as string | null,
  record_cid: (r.record_cid ?? null) as string | null,
  published_at: (r.published_at ?? null) as string | null,
  published_repo_rev: (r.published_repo_rev ?? null) as string | null,
  first_seen: (r.first_seen ?? null) as string | null,
  last_seen: (r.last_seen ?? null) as string | null,
});

/** Open (or create) a ledger at `path`. Use ':memory:' in tests. */
export const openLedger = (path: string, nowFn: () => string = () => new Date().toISOString()): Ledger =>
  new Ledger(new DatabaseSync(path), nowFn);
