// Pure changelog logic, shared by scripts/build.mjs (which collects commits from
// `git log` and writes dist/changelog.json) and tests/unit/changelog/parse.spec.ts.
// No I/O here — the git exec lives in build.mjs — so this stays unit-testable, the
// same split as scripts/md-to-html.mjs. Plain ESM JS with JSDoc types (not TS),
// because build.mjs is Node and cannot import TS at runtime.

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
