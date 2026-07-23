// Fold the current git-derived `Changelog:` entries into changelog.seed.json,
// making them a permanent, append-only record that survives a history rewrite or a
// shallow clone. Run on demand: `npm run changelog:bake`. This is OPTIONAL — the
// build already unions the seed with the live git-derived entries every deploy, so
// baking is for durability, not for the entries to appear.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { collectCommits, mergeChangelog, parseChangelog, repoUrlFromGit } from './changelog.mjs';

const SEED = 'changelog.seed.json';
const DEFAULT_COMMENT =
  'Hand-authored + baked backlog of user-facing changes. The build (scripts/build.mjs) unions this with the live git-derived entries, deduped by sha. New changes should use a Changelog: commit trailer (see CLAUDE.md); `npm run changelog:bake` folds current derived entries in here to make them permanent.';

const derived = parseChangelog(collectCommits(), { repoUrl: repoUrlFromGit() });
const prev = existsSync(SEED) ? JSON.parse(readFileSync(SEED, 'utf8')) : { entries: [] };
const before = (prev.entries ?? []).length;
// derived wins on a sha collision (freshest trailer text); seed-only entries kept.
const merged = mergeChangelog(prev.entries ?? [], derived);
writeFileSync(SEED, `${JSON.stringify({ _comment: prev._comment ?? DEFAULT_COMMENT, entries: merged }, null, 2)}\n`);
console.log(`baked: ${SEED} ${before} -> ${merged.length} entries (${derived.length} derived folded in)`);
