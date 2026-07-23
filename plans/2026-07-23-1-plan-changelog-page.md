# Changelog page — a CI-generated, user-facing `/changelog` from commit trailers

**Status:** Planned — not started. TDD, red-first per `CLAUDE.md`. Record the outcome + green-gate counts
here when done.

## Problem

arecipe has no user-facing record of what changed. The footer build stamp shows `v<date>-<sha>` and the
user guide is a hand-written narrative, but there is nothing that answers "what's new since I last used
this?" A hand-maintained `CHANGELOG.md` rots and duplicates the commit history; auto-listing every commit
is noise (most commits are refactors/tests/chores, and subjects are inconsistent — some Conventional, most
plain, all squash-merged with a trailing `(#NN)`).

## Mission

A `/changelog` page, populated at build time by CI, showing a timeline of **only the changes worth telling
a user about**, each verifiable back to its commit. The source of the user-facing text is an **opt-in git
trailer** the author writes, so the timeline is curated by construction, and it extends the trailer habit
already in use (`Co-Authored-By`, `Claude-Session`).

## Design decisions (confirmed)

1. **Opt-in `Changelog:` trailer, not subject-parsing.** Only commits whose message carries a `Changelog:`
   trailer appear. Subjects are inconsistent (Conventional Commits not enforced), so the generator does NOT
   parse subjects for content — it reads the explicit trailer. Absence of a trailer is normal; no gate
   failure.
   - Form: `Changelog(<category>): <one-line user-facing text>` where `<category>` ∈ `added | changed |
     fixed | removed` (Keep a Changelog). Bare `Changelog: <text>` defaults to `changed`.
   - **Repeated trailers allowed** — one commit may ship two user-facing changes → two entries.
2. **Group by date/PR now; by signed release later.** No tags/releases exist on `main` (signed-releases is
   unmerged on `origin/claude/signed-releases-v2-*`). So entries are grouped by **date**, each linking to
   its **commit SHA** and, when present, the squash **PR `(#NN)`**. When signed-releases merges,
   `buildNumber` / `release-manifest.json` becomes the release-grouping key (a follow-up, not this plan).
3. **Verifiable, not marketing.** Every entry links to its commit (`…/commit/<sha>`) and PR. The changelog
   is provenance the reader can check — on-brand for the atproto/signed-releases lineage.
4. **User voice, enforced by guideline.** Present-tense, benefit-first, jargon-free, one line. "Added a
   shopping list you can check off as you cook," not "impl ShoppingListStore projection." A CLAUDE.md
   contributor/agent guideline (Phase 4) makes this explicit for Claude and humans.

## Reasoning / approach

Mirror arecipe's two established patterns so this adds no new machinery:
- **Generated-data pattern = `build-info.json`.** `scripts/build.mjs` writes `dist/build-info.json`; the
  app `fetch('./build-info.json')`s it and the SW keeps it live (early-return, uncached). `changelog.json`
  is generated the same way, in the same file, fetched the same way, with the same SW treatment.
- **Page pattern = the `user-guide` trio.** Root `changelog.html` (clone of `user-guide.html`) + a page
  entry `src/pages/changelog.ts` + a `renderChangelog()` view, registered in `scripts/build.mjs` `PAGES` +
  `HTML` (which gives bundling, content-hash, CSP, SRI, SW precache for free). Footer-linked (like the
  `agents.html` `agents-link` in `src/build-stamp.ts`), **not** a primary tab.
- **Separate pure logic from git I/O** (hexagonal, and it's what makes TDD clean): a **pure parser**
  (`gitLog[] -> ChangelogEntry[]`) unit-tested against fixtures, and a **thin git-exec** (`git log …` ->
  `gitLog[]`) that the build calls. The parser never shells out; the exec has no logic.

### The one required CI change (load-bearing — do first)

`actions/checkout` defaults to **`fetch-depth: 1`** (shallow); no workflow sets otherwise. A `git log`
generator would then see only the tip commit. **Set `fetch-depth: 0` on the deploy-job checkout in
`.github/workflows/ci.yml`** so full history is available at `npm run build`. (Local dev builds already have
full history, so `changelog.json` also generates locally — good for the e2e gate.) Optionally set it on
`preview.yml` too if previews should show the changelog.

### Data contract — `dist/changelog.json`

```json
{
  "generatedAt": "2026-07-23T12:00:00Z",
  "entries": [
    {
      "date": "2026-07-20",
      "category": "added",
      "text": "Added a shopping list you can check off as you cook",
      "sha": "1a2b3c4…",
      "shortSha": "1a2b3c4",
      "commitUrl": "https://github.com/CroftCommunity/arecipe/commit/1a2b3c4…",
      "pr": 40,
      "prUrl": "https://github.com/CroftCommunity/arecipe/pull/40"
    }
  ]
}
```
Entries newest-first; the page groups by `date`. `pr`/`prUrl` omitted when the subject has no `(#NN)`.
Repo slug read from `package.json`/remote so the URLs aren't hardcoded.

## Phases (each ends GREEN on the full gate: lint · typecheck · unit · build · e2e)

**Phase 0 — enable git history in CI.** Set `fetch-depth: 0` on the `ci.yml` deploy-job checkout. Verify
`npm run build` locally emits `dist/changelog.json` with >1 entry once trailers exist (or a fixture commit).
No app code yet.

**Phase 1 — the pure parser (RED first).** `src/changelog/parse.ts`: `parseChangelog(commits: GitCommit[])
-> ChangelogEntry[]`. Unit tests `tests/unit/changelog/parse.spec.ts` written RED:
- commit with no `Changelog:` trailer → excluded;
- `Changelog: X` → one `changed` entry with text X;
- `Changelog(added): X` → category `added`; unknown category → `changed` + (decide: keep text / drop);
- two `Changelog:` trailers in one commit → two entries;
- PR number extracted from a trailing `(#NN)` subject; absent → no `pr`;
- text trimmed; empty trailer → skipped; entries carry sha/shortSha/date.

**Phase 2 — git-exec + build wiring.** `src/changelog/collect.ts` (thin: `git log --format=…` →
`GitCommit[]`, using a `%x00`-delimited format so bodies/trailers survive). In `scripts/build.mjs`, after
`build-info.json` (line ~271): collect → parse → build URLs from the repo slug → `writeFileSync(
'dist/changelog.json', …)`. Add the `changelog.json` early-return to `src/sw.ts` (always live, like
build-info). Unit-test the URL builder + serializer shape.

**Phase 3 — the page (RED e2e first).** Root `changelog.html` (clone `user-guide.html`); `src/pages/
changelog.ts` (`mountShell` + `mountBuildStamp` + `registerServiceWorker`); `renderChangelog()` view:
`await fetch('./changelog.json')`, **degrade gracefully** (fetch fail / empty → "No changes recorded yet"),
render a date-grouped timeline with category badges and commit/PR links. Register `'changelog'` in
`scripts/build.mjs` `PAGES` + `'changelog.html':'changelog'` in `HTML`. Footer link in `src/build-stamp.ts`
(sibling to `agents-link`). e2e `tests/e2e/changelog.spec.ts` (hermetic, fixture `changelog.json`): renders
entries, category badges, working commit/PR links, empty-state; plus the standard `mobile-fit` check.

**Phase 4 — the commit guideline (the "good guidance for Claude").** Add a short section to `CLAUDE.md`
(and a `CONTRIBUTING.md` if wanted) defining the `Changelog:` trailer: when to add it (any user-facing
behavior change), the form, the four categories, and the **user-voice rules** with good/bad examples.
Explicitly instruct agents: "if a commit changes what a cook sees or can do, add a `Changelog(<cat>):` line
in the user's voice; internal-only commits omit it." No test; it's documentation, but it's what makes the
pipeline produce good copy.

## Open / deferred (surfaced, not resolved)

- **Backfill** of pre-trailer history: start going forward; optionally add a `changelog.seed.json`
  concatenated by the generator for a few notable past releases. Deferred.
- **Release grouping** when signed-releases merges: switch grouping key from date to `buildNumber` /
  `release-manifest.json`, and link entries to the signed release. Follow-up plan.
- **Squash-message discipline:** because PRs squash-merge, the `Changelog:` trailer must be in the squash
  commit message (the PR's final squash body), not only in intermediate commits. Note this in the guideline.
