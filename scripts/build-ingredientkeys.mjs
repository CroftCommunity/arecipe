// Phase 1 build tool (plans/2026-08-12-1): auto-propose the canonical ingredient
// vocabulary from the census, print a REVIEW REPORT, and (unless --dry-run)
// write src/recipes/ingredientkeys.json + runs/ingredient-normalization/REVIEW.md.
// Sibling of spike/import/build-dishkeys.mjs in workflow (propose → human
// review → commit); it lives in scripts/ because its logic is the TS core in
// src/recipes/ingredient-vocab-build.ts (bundled here with esbuild) — the
// proposal must group lines exactly as the runtime resolver reads them.
//
//   node scripts/build-ingredientkeys.mjs                  # census fixture → propose + write
//   node scripts/build-ingredientkeys.mjs --dry-run        # report only
//   node scripts/build-ingredientkeys.mjs --snapshot DIR   # rebuild the census from a
//                                                          # snapshot dir (npm run snapshot)
//                                                          # and refresh the fixture too
//   --min-lines N   line floor for a key (default 3)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const DRY = flag('--dry-run');
const MIN_LINES = Number(opt('--min-lines', '3'));
const CENSUS = 'tests/fixtures/ingredients/census-lines.json';
const OUT = 'src/recipes/ingredientkeys.json';
const REPORT = 'runs/ingredient-normalization/REVIEW.md';

const core = await (async () => {
  const bundled = await build({
    stdin: {
      contents: "export * from './src/recipes/ingredient-vocab-build.ts'; export * from './src/recipes/ingredient-key.ts';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const js = bundled.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
})();

const censusFromSnapshot = (dir) => {
  const counts = new Map();
  let records = 0;
  const cooksDir = `${dir}/cooks`;
  for (const f of readdirSync(cooksDir).filter((n) => n.endsWith('.json'))) {
    const shard = JSON.parse(readFileSync(`${cooksDir}/${f}`, 'utf8'));
    for (const r of shard.records ?? []) {
      records += 1;
      for (const line of r.value?.ingredients ?? []) {
        if (typeof line !== 'string') continue;
        const t = line.trim();
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  return {
    _comment: 'Ingredient census fixture (plans/2026-08-12-1 Phase 0/1): every distinct raw ingredient line in the snapshot with its line count, so the resolver coverage floor is measured by LINE WEIGHT over the real corpus. Regenerate: node scripts/build-ingredientkeys.mjs --snapshot <dir>.',
    snapshot: manifest.capturedAt ?? 'unknown',
    records,
    lines: rows.reduce((n, [, c]) => n + c, 0),
    distinct: rows.length,
    rows,
  };
};

const snapshotDir = opt('--snapshot', null);
const census = snapshotDir ? censusFromSnapshot(snapshotDir) : JSON.parse(readFileSync(CENSUS, 'utf8'));
if (snapshotDir && !DRY) writeFileSync(CENSUS, JSON.stringify(census));

const seed = JSON.parse(readFileSync('scripts/ingredient-vocab-seed.json', 'utf8'));
const proposal = core.proposeVocabulary(census.rows, {
  taxonomy: seed.descriptors,
  minLines: MIN_LINES,
  seedAliases: seed.seedAliases,
  seedKeys: seed.seedKeys ?? [],
});

const keyCount = Object.keys(proposal.keys).length;
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const topKeys = Object.entries(proposal.keys).slice(0, 40);
const promotion = Object.entries(proposal.keys)
  .flatMap(([key, k]) => k.variants.filter((v) => v.lines >= 20).map((v) => ({ key, ...v })))
  .sort((a, b) => b.lines - a.lines);
const aliased = Object.entries(proposal.keys).filter(([, k]) => k.aliases.length > 0);
const tailLines = proposal.tail.reduce((n, t) => n + t.lines, 0);

const report = `# Ingredient vocabulary — review report

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/build-ingredientkeys.mjs\` (min-lines ${MIN_LINES}).
Census: ${census.records} records / ${census.lines} lines / ${census.distinct} distinct raw lines (snapshot ${census.snapshot}).

**This is a PROPOSAL until a human has reviewed it** (plan Phase 1, the single quality gate).
Review = read the promotion candidates and the alias merges below; edit
\`scripts/ingredient-vocab-seed.json\` (taxonomy words, seeded synonyms), re-run, repeat.

| Measure | Value |
|---|---|
| Keys proposed | ${keyCount} |
| Coverage by line weight (resolver over the census) | **${pct(proposal.coverage.share)}** (${proposal.coverage.matched} / ${proposal.coverage.lines}) |
| Tail (heads under the floor) | ${proposal.tail.length} heads, ${tailLines} lines (${pct(tailLines / proposal.coverage.lines)}) |
| Keys carrying aliases | ${aliased.length} |

## Top keys by line weight

| key | lines | top variants (descriptor forms folded in) |
|---|---:|---|
${topKeys.map(([k, v]) => `| ${k} | ${v.lines} | ${v.variants.slice(0, 4).map((x) => `${x.full} (${x.lines})`).join(' · ')} |`).join('\n')}

## Promotion candidates — variants with ≥ 20 lines

A variant is a descriptor-bearing form the resolver reads as key + variety. If it
is really its own ingredient (\`bread crumb\` is not a crumb variety), give it a
key: add it to the seed as a key with itself as alias, or remove the descriptor
word from the taxonomy if it never modifies.

| variant | folded under | lines |
|---|---|---:|
${promotion.map((p) => `| ${p.full} | ${p.key} | ${p.lines} |`).join('\n')}

## Alias merges (seeded synonyms + hyphen/space near-misses)

${aliased.map(([k, v]) => `- **${k}** ← ${v.aliases.join(', ')}`).join('\n')}

## Tail — first 100 heads under the floor

${proposal.tail.slice(0, 100).map((t) => `${t.head} (${t.lines})`).join(' · ')}
`;

console.log(report.split('\n').slice(0, 14).join('\n'));
console.log(`promotion candidates: ${promotion.length}; alias-carrying keys: ${aliased.length}`);

if (!DRY) {
  const vocab = {
    _meta: {
      why: 'Canonical ingredient vocabulary (plans/2026-08-12-1 Phase 1). GENERATED by scripts/build-ingredientkeys.mjs from the census + scripts/ingredient-vocab-seed.json; edit the seed, not this file. Keys are descriptor-stripped heads; the resolver (src/recipes/ingredient-key.ts) peels variety/prep/quality words and looks the head up most-specific-first.',
      generated: new Date().toISOString().slice(0, 10),
      census: { snapshot: census.snapshot, records: census.records, lines: census.lines },
      minLines: MIN_LINES,
      keys: keyCount,
      coverage: Number(proposal.coverage.share.toFixed(4)),
      reviewed: false,
    },
    descriptors: proposal.vocabulary.descriptors,
    keys: proposal.vocabulary.keys,
  };
  writeFileSync(OUT, `${JSON.stringify(vocab, null, 1)}\n`);
  mkdirSync('runs/ingredient-normalization', { recursive: true });
  writeFileSync(REPORT, report);
  console.log(`wrote ${OUT} (${keyCount} keys) and ${REPORT}`);
}
