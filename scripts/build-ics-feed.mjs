// Meal-plan .ics feed generator (ops). Run by the scheduled workflow
// (.github/workflows/ics-feed.yml) and locally via `npm run build:ics`.
//
// This repo has no runtime TypeScript loader (native --strip-types can't follow
// the src tree's `.js` import specifiers), so — like scripts/build.mjs — we
// esbuild-bundle the pure generator exports to a temp ESM module, import it, and
// provide the real network reader + fs writer + config here. No credentials: the
// meal-plan data is public.
import { buildSync } from 'esbuild';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'config', 'ics-feeds.json');
const OUT_DIR = join(ROOT, 'calendars');

// Bundle the pure generator + reader (their `.js` specifiers resolve to `.ts`
// via esbuild) to a temp module we can import from this plain-JS script.
const tmp = mkdtempSync(join(tmpdir(), 'arecipe-ics-'));
const bundle = join(tmp, 'ics.mjs');
buildSync({
  stdin: {
    contents:
      "export { generateFeeds } from './src/recipes/ics-generate.ts';\n" +
      "export { listMealPlans } from './src/recipes/ics-read.ts';\n",
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  logLevel: 'warning',
});

const { generateFeeds, listMealPlans } = await import(pathToFileURL(bundle).href);

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const dids = Array.isArray(config.dids) ? config.dids : [];
if (dids.length === 0) {
  console.log('ics feed: no DIDs configured in config/ics-feeds.json — nothing to do');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  const writeFile = async (fileName, content) => {
    writeFileSync(join(OUT_DIR, fileName), content);
  };
  const feeds = await generateFeeds(dids, { listMealPlans, writeFile, log: (m) => console.log(m) });
  console.log(`ics feed: wrote ${feeds.length} calendar(s) to calendars/`);
}

rmSync(tmp, { recursive: true, force: true });
