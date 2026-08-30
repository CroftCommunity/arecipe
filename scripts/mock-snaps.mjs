// Captures a running arecipe at the workspace's standard mock viewports, so a
// mock can stand real pixels beside each other and say what tree they came from.
// CroftC/.claude/MOCKS.md P4: arecipe has no hermetic sandbox; its PR preview IS
// the Proposed frame and production IS the Current one. Both are the built app
// served from `gh-pages` (docs/PREVIEWS.md), read-only by construction.
//
//   node scripts/mock-snaps.mjs --as current  --url https://arecipe.app/
//   node scripts/mock-snaps.mjs --as proposed --url https://arecipe.app/pr-preview/pr-57/
//   node scripts/mock-snaps.mjs --as proposed --url http://127.0.0.1:4173/   # `npm run serve` of a local build
//   --routes index,dish,recipe     which pages (default: index,cookbook,dish,recipe)
//   --out <dir>                    default mocks/snaps
//
// The baseline is READ FROM THE PAGE, never assumed: the footer build stamp
// (src/build-stamp.ts) says `v<date>-<sha>`, and that sha is what the pixels
// came from — for a preview, the PR's head; for production, the deployed main.
// Files are named <route>.<viewport>.<as>.png and the manifest merges per file
// (scripts/lib/mock-snaps-manifest.mjs), so re-capturing one column never
// renames the other's baseline.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeManifest } from './lib/mock-snaps-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const AS = opt('--as');
const URL_ = opt('--url');
if (!['current', 'proposed'].includes(AS ?? '') || !URL_) {
  console.error('usage: node scripts/mock-snaps.mjs --as current|proposed --url <origin/> [--routes a,b] [--out dir]');
  process.exit(2);
}
const base = URL_.endsWith('/') ? URL_ : URL_ + '/';
const ROUTES = (opt('--routes') ?? 'index,cookbook,dish,recipe').split(',');
const OUT = resolve(opt('--out') ?? join(ROOT, 'mocks', 'snaps'));
// The standard frames (MOCKS.md rule 3): 390×844 and 1280×900, true size.
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
const population = /\/pr-preview\/pr-(\d+)\//.test(base) ? `pr-preview/pr-${base.match(/pr-(\d+)/)[1]}`
  : /^https?:\/\/(127\.0\.0\.1|localhost)/.test(base) ? 'local' : 'production';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const files = [];
let baseline = null;
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: vp });
  for (const route of ROUTES) {
    await page.goto(`${base}${route}.html`, { waitUntil: 'networkidle' });
    const stamp = await page.locator('[data-testid="build-stamp"]').first().textContent({ timeout: 10000 }).catch(() => null);
    const sha = stamp?.match(/^v\S+-([0-9a-f]{7,})/)?.[1];
    if (!sha) { console.error(`refusing: ${base}${route}.html shows no build stamp, so the pixels cannot be named (${JSON.stringify(stamp)})`); process.exit(2); }
    if (baseline && baseline !== `arecipe@${sha}`) { console.error(`refusing: ${route} is build ${sha} but earlier pages were ${baseline} — a deploy moved mid-capture`); process.exit(2); }
    baseline = `arecipe@${sha}`;
    const file = `${route}.${name}.${AS}.png`;
    await page.screenshot({ path: join(OUT, file) });
    files.push({ file, route, viewport: name, ...vp, baseline, population, url: `${base}${route}.html` });
  }
  await page.close();
}
await browser.close();

const manifestPath = join(OUT, 'manifest.json');
const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const manifest = mergeManifest(existing, { capturedAt: new Date().toLocaleDateString('sv-SE'), files });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${baseline} (${population}) as ${AS} — ${files.length} snaps in ${OUT}`);
