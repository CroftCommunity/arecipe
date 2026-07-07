// Build: bundle one entry per destination page (page-per-destination — the
// Browse page ships zero auth code), plus the SW, copy the shell files, and
// emit dist/build-info.json so the running app can show which build it is
// and how big (see src/build-stamp.ts). Version = UTC date + short git SHA.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

const PAGES = ['browse', 'mine', 'settings', 'account'];
const HTML = ['index.html', 'mine.html', 'settings.html', 'account.html'];

mkdirSync('dist', { recursive: true });
buildSync({
  entryPoints: PAGES.map((p) => `src/pages/${p}.ts`),
  bundle: true,
  minify: true,
  format: 'esm',
  outdir: 'dist',
});
buildSync({ entryPoints: ['src/sw.ts'], bundle: true, minify: true, outfile: 'dist/sw.js' });
for (const file of [...HTML, 'styles.css']) copyFileSync(file, `dist/${file}`);

const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const now = new Date();
const date = now.toISOString().slice(0, 10).replaceAll('-', '.');
const pages = Object.fromEntries(
  PAGES.map((p) => {
    const bytes = readFileSync(`dist/${p}.js`);
    return [p, { bytes: bytes.length, gzipBytes: gzipSync(bytes).length }];
  }),
);
// mainBytes = the landing page (browse) — what most visitors download first.
const info = {
  version: `${date}-${sha}`,
  builtAt: now.toISOString(),
  mainBytes: pages['browse'].bytes,
  mainGzipBytes: pages['browse'].gzipBytes,
  pages,
};
writeFileSync('dist/build-info.json', JSON.stringify(info));
console.log(
  `built ${info.version}: ` +
    PAGES.map((p) => `${p}.js ${(pages[p].bytes / 1024).toFixed(0)}K/${(pages[p].gzipBytes / 1024).toFixed(0)}Kgz`).join(' · '),
);
