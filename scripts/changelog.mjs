// Changelog logic, shared by scripts/build.mjs (writes dist/changelog.json),
// scripts/changelog-bake.mjs (folds derived entries into the seed), and
// tests/unit/changelog/parse.spec.ts. The parse/merge/normalize functions are
// PURE (no I/O) so they stay unit-testable; collectCommits/repoUrlFromGit are the
// thin git-exec used by the build tools (never imported by the app or the tests).
// Plain ESM JS with JSDoc types (not TS), because build.mjs is Node and cannot
// import TS at runtime — same split as scripts/md-to-html.mjs.
import { execSync } from 'node:child_process';

// Control-char delimiters that never occur in commit text.
const FIELD = '\x1f';
const REC = '\x1e';

/** @typedef {'added' | 'changed' | 'fixed' | 'removed'} Category */
/** @typedef {{ sha: string, subject: string, date: string, body: string }} GitCommit */
/**
 * @typedef {object} ChangelogEntry
 * @property {string} date       ISO date (YYYY-MM-DD)
 * @property {Category} category
 * @property {string} text       user-facing one-liner
 * @property {string} sha
 * @property {string} shortSha
 * @property {string} commitUrl
 * @property {number} [pr]
 * @property {string} [prUrl]
 */

/** @type {Category[]} */
const CATEGORIES = ['added', 'changed', 'fixed', 'removed'];

// One `Changelog:` or `Changelog(<cat>):` trailer line. Matched per body line.
const TRAILER = /^Changelog(?:\(([^)]*)\))?:\s*(.*)$/;
// A trailing "(#NN)" squash-merge PR reference in a commit subject.
const PR_IN_SUBJECT = /\(#(\d+)\)\s*$/;

/**
 * Extract user-facing changelog entries from commits (opt-in `Changelog:`
 * trailers only). Input order is preserved (callers pass newest-first).
 * @param {GitCommit[]} commits
 * @param {{ repoUrl: string }} opts
 * @returns {ChangelogEntry[]}
 */
export function parseChangelog(commits, { repoUrl }) {
  /** @type {ChangelogEntry[]} */
  const entries = [];
  for (const c of commits) {
    const prMatch = c.subject.match(PR_IN_SUBJECT);
    const pr = prMatch ? Number(prMatch[1]) : undefined;
    for (const line of c.body.split('\n')) {
      const m = line.match(TRAILER);
      if (m === null) continue;
      const text = m[2].trim();
      if (text === '') continue; // an empty trailer is not an entry
      const raw = (m[1] ?? '').trim().toLowerCase();
      const category = CATEGORIES.includes(/** @type {Category} */ (raw))
        ? /** @type {Category} */ (raw)
        : 'changed';
      /** @type {ChangelogEntry} */
      const entry = {
        date: c.date.slice(0, 10),
        category,
        text,
        sha: c.sha,
        shortSha: c.sha.slice(0, 7),
        commitUrl: `${repoUrl}/commit/${c.sha}`,
      };
      if (pr !== undefined) {
        entry.pr = pr;
        entry.prUrl = `${repoUrl}/pull/${pr}`;
      }
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Merge a hand-authored backlog seed with the git-derived entries: union deduped
 * by sha, newest date first. A git-derived (live-trailer) entry wins over a seed
 * entry with the same sha, so an edited trailer self-heals on the next build.
 * Seed-only entries — shas absent from the derived set, i.e. the pre-convention
 * backlog or commits whose trailers a history rewrite dropped — are kept, so the
 * published changelog only grows.
 * @param {ChangelogEntry[]} seed
 * @param {ChangelogEntry[]} derived
 * @returns {ChangelogEntry[]}
 */
export function mergeChangelog(seed, derived) {
  /** @type {Map<string, ChangelogEntry>} */
  const bySha = new Map();
  for (const entry of seed) bySha.set(entry.sha, entry);
  for (const entry of derived) bySha.set(entry.sha, entry); // live entry wins on collision
  return [...bySha.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Normalize a git remote URL to its canonical `https://github.com/<owner>/<repo>`
 * form. Handles SSH remotes (including SSH-alias hosts like `github-personal`)
 * and https remotes, and strips a trailing `.git`. Forces the github.com host so
 * an SSH alias never leaks into a user-facing link.
 * @param {string} remote
 * @returns {string}
 */
export function normalizeRepoUrl(remote) {
  const s = remote.trim().replace(/\.git$/, '');
  const m = s.match(/[:/]([^/:]+\/[^/:]+)$/); // last two path segments = owner/repo
  const ownerRepo = m ? m[1] : s;
  return `https://github.com/${ownerRepo}`;
}

// --- git-exec (Node-only build helpers; not imported by the app or the tests) ---

/**
 * Collect commits from `git log`, newest-first, as GitCommit records. Needs git
 * history (CI checks out fetch-depth:0); a shallow clone just yields fewer commits.
 * @returns {GitCommit[]}
 */
export function collectCommits() {
  const raw = execSync(`git log --format=%H${FIELD}%aI${FIELD}%s${FIELD}%b${REC}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw
    .split(REC)
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((rec) => {
      const parts = rec.split(FIELD);
      return { sha: parts[0], date: parts[1], subject: parts[2] ?? '', body: parts.slice(3).join(FIELD) };
    });
}

/** The canonical github.com repo URL, from `git config remote.origin.url`. */
export function repoUrlFromGit() {
  return normalizeRepoUrl(execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim());
}
