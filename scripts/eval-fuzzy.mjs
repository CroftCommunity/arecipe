// M4 evaluation (plans/2026-08-12-1): battle-test the closed-set fuzzy tier on
// the real corpus and write runs/ingredient-normalization/FUZZY-EVAL.md. Same
// shape as the other tools: the logic is the TS core, bundled with esbuild.
// The numbers here are the ones the plan cites; the suite in
// tests/unit/recipes/ingredient-fuzzy-corpus.spec.ts pins floors under them.
//
//   node scripts/eval-fuzzy.mjs            # write the report
//   node scripts/eval-fuzzy.mjs --json     # print the numbers as JSON only
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const JSON_ONLY = process.argv.includes('--json');
const SEP = '\t';
const bundled = await build({
  stdin: {
    contents:
      "export * from './src/recipes/ingredient-key.ts'; export * from './src/recipes/ingredient-vocabulary.ts'; export * from './src/recipes/ingredient-fuzzy.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const m = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const V = m.INGREDIENT_VOCABULARY;
const census = JSON.parse(readFileSync('tests/fixtures/ingredients/census-lines.json', 'utf8'));
const judged = JSON.parse(readFileSync('tests/fixtures/ingredients/fuzzy-judged.json', 'utf8'));

// Coverage without / with the tier, and the tier's picks by line weight.
let det = 0;
let withFuzzy = 0;
const picks = new Map();
const tail = new Map();
for (const [raw, c] of census.rows) {
  const r0 = m.resolveIngredient(raw, V);
  if (r0.method !== 'unmatched') {
    det += c;
    withFuzzy += c;
    continue;
  }
  const r1 = m.resolveIngredient(raw, V, { fuzzy: true });
  if (r1.method === 'fuzzy') {
    withFuzzy += c;
    const k = `${r1.head}${SEP}${r1.key}`;
    picks.set(k, (picks.get(k) ?? 0) + c);
  } else if (r0.head !== '') {
    tail.set(r0.name, (tail.get(r0.name) ?? 0) + c);
  }
}
// Precision by band, re-scored with the current matcher.
const bands = [
  [0.85, 1.01],
  [0.75, 0.85],
  [0.65, 0.75],
  [0.55, 0.65],
];
const byBand = bands.map(([lo, hi]) => {
  const rows = judged.rows
    .map((r) => ({ ...r, now: m.fuzzyMatch(r.name, V, { threshold: 0.5 }) }))
    .filter((r) => r.now && r.now.score >= lo && r.now.score < hi);
  const right = rows.filter((r) => r.now.key === r.pick && r.verdict === 'right').length;
  return { lo, hi, n: rows.length, right, precision: rows.length ? right / rows.length : null };
});
// Generic single-word keys a reviewer should consider retiring.
const GENERIC = new Set([
  'powder', 'sauce', 'mix', 'filling', 'seasoning', 'spice', 'paste', 'juice', 'oil', 'stock', 'broth', 'cream', 'cheese',
  'meat', 'fish', 'nut', 'fruit', 'vegetable', 'flake', 'seed', 'leaf', 'piece', 'chip', 'crumb', 'fat', 'water', 'wine',
  'sugar', 'flour',
]);
const generic = Object.keys(V.keys).filter((k) => GENERIC.has(k));
const out = {
  generated: new Date().toISOString().slice(0, 10),
  threshold: m.FUZZY_THRESHOLD,
  lines: census.lines,
  coverage: {
    deterministic: det / census.lines,
    withFuzzy: withFuzzy / census.lines,
    fuzzyLines: withFuzzy - det,
    stillUnmatchedLines: census.lines - withFuzzy,
  },
  precisionByBand: byBand,
  keys: Object.keys(V.keys).length,
  genericKeys: generic,
  topPicks: [...picks.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, c]) => {
      const [name, key] = k.split(SEP);
      return { name, key, lines: c };
    }),
  topTail: [...tail.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, c]) => ({ name, lines: c })),
};
if (JSON_ONLY) {
  console.log(JSON.stringify(out));
  process.exit(0);
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const report = `# Fuzzy tier — corpus evaluation

Generated ${out.generated} by \`scripts/eval-fuzzy.mjs\` against the census (${out.lines} lines from the
arecipe account's recipes), vocabulary of ${out.keys} keys, threshold **${out.threshold}**.

| Measure | Value |
|---|---|
| Coverage, deterministic paths only | **${pct(out.coverage.deterministic)}** |
| Coverage with the fuzzy tier | **${pct(out.coverage.withFuzzy)}** (+${out.coverage.fuzzyLines} lines) |
| Still unmatched | ${out.coverage.stillUnmatchedLines} lines |

## Precision by score band (judged sample, re-scored today)

The judged sample is \`tests/fixtures/ingredients/fuzzy-judged.json\` (160 real unmatched names, a
semantic right/wrong each). The threshold sits where the band below it falls off a cliff.

| band | judged | right | precision |
|---|---:|---:|---:|
${byBand.map((b) => `| ${b.lo.toFixed(2)}–${Math.min(b.hi, 1).toFixed(2)} | ${b.n} | ${b.right} | ${b.precision === null ? '—' : pct(b.precision)} |`).join('\n')}

## The tier's picks, by line weight (review these)

| unmatched name | fuzzy pick | lines |
|---|---|---:|
${out.topPicks.map((p) => `| ${p.name} | ${p.key} | ${p.lines} |`).join('\n')}

## Still unmatched, by line weight (vocabulary candidates)

${out.topTail.map((t) => `${t.name} (${t.lines})`).join(' · ')}

## Generic single-word keys the vocabulary carries

A reviewer should consider whether these name an ingredient or a category: ${generic.join(', ') || 'none'}.
`;
mkdirSync('runs/ingredient-normalization', { recursive: true });
writeFileSync('runs/ingredient-normalization/FUZZY-EVAL.md', report);
console.log(report.split('\n').slice(0, 22).join('\n'));
