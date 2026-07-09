// Build (Phase 8b shape): page bundles + styles get CONTENT-HASHED names
// injected into stable-named HTML (the peadoubleueh cache-buster: a deploy
// changes URLs, so stale JS is structurally impossible). The service worker
// is compiled with the build version + the stable-shell precache list baked
// in. build-info.json stays stable-named and uncached (deploy checks).
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

const PAGES = ['browse', 'mine', 'cookbook', 'settings', 'account', 'recipe', 'dish', 'editor'];
const HTML = {
  'index.html': 'browse',
  'mine.html': 'mine',
  'cookbook.html': 'cookbook',
  'settings.html': 'settings',
  'account.html': 'account',
  'recipe.html': 'recipe',
  'dish.html': 'dish',
  'editor.html': 'editor',
};

rmSync('dist', { recursive: true, force: true }); // no stale artifacts
mkdirSync('dist', { recursive: true });

// Page bundles with content hashes.
const result = buildSync({
  entryPoints: PAGES.map((p) => `src/pages/${p}.ts`),
  bundle: true,
  minify: true,
  format: 'esm',
  // Code-splitting: dynamic import()s (recipe.ts defers the heavy auth client)
  // become shared chunks, and code common to multiple pages (@atproto/api)
  // dedupes into one chunk instead of being copied into every auth-bearing page.
  splitting: true,
  chunkNames: 'chunk-[hash]',
  entryNames: '[name]-[hash]',
  outdir: 'dist',
  metafile: true,
});
const bundleOf = {};
for (const [outPath, meta] of Object.entries(result.metafile.outputs)) {
  const entry = meta.entryPoint;
  if (entry === undefined) continue;
  const page = entry.replace('src/pages/', '').replace('.ts', '');
  bundleOf[page] = outPath.replace('dist/', '');
}

// Hashed styles.
const cssBytes = readFileSync('styles.css');
const cssName = `styles-${createHash('sha256').update(cssBytes).digest('hex').slice(0, 8)}.css`;
writeFileSync(`dist/${cssName}`, cssBytes);

// HTML with hashed refs injected.
for (const [file, page] of Object.entries(HTML)) {
  let html = readFileSync(file, 'utf8');
  html = html.replace(`./${page}.js`, `./${bundleOf[page]}`);
  html = html.replace('./styles.css', `./${cssName}`);
  writeFileSync(`dist/${file}`, html);
}
copyFileSync('manifest.webmanifest', 'dist/manifest.webmanifest');
copyFileSync('friends.html', 'dist/friends.html'); // legacy path → redirect stub (CB3)
copyFileSync('CNAME', 'dist/CNAME'); // custom domain survives every deploy
copyFileSync('client-metadata.json', 'dist/client-metadata.json'); // hosted OAuth client id (8c)
cpSync('assets', 'dist/assets', { recursive: true });

// Version + per-page sizes.
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const now = new Date();
const date = now.toISOString().slice(0, 10).replaceAll('-', '.');
const version = `${date}-${sha}`;
const pages = Object.fromEntries(
  PAGES.map((p) => {
    const bytes = readFileSync(`dist/${bundleOf[p]}`);
    return [p, { bytes: bytes.length, gzipBytes: gzipSync(bytes).length, file: bundleOf[p] }];
  }),
);

// Service worker: version + stable-shell precache baked in. Stable names
// only — hashed assets cache on first fetch.
// Precache the light shell — page entries + their small shared chunks. Large
// vendor chunks (the ~870KB @atproto/api client, split out by recipe.ts's
// deferred import) are NOT precached: they'd bloat every SW install for a
// capability you can't use offline anyway (OAuth needs the network), and the
// fetch handler runtime-caches them on first use. This keeps the code-split's
// benefit — the heavy client is downloaded only when a page actually needs it.
const HEAVY_CHUNK_BYTES = 150 * 1024;
const jsToPrecache = [];
const jsDeferred = [];
for (const k of Object.keys(result.metafile.outputs).filter((k) => k.endsWith('.js'))) {
  const f = k.replace('dist/', '');
  (readFileSync(`dist/${f}`).length > HEAVY_CHUNK_BYTES ? jsDeferred : jsToPrecache).push(f);
}
if (jsDeferred.length > 0) {
  // No silent caps: say what's deferred to runtime caching.
  console.log(`SW precache: deferring ${jsDeferred.length} heavy chunk(s) to runtime cache — ${jsDeferred.join(', ')}`);
}
const precache = [
  './', // the bare origin navigation ('/') must hit the cache too
  // Current hashed assets: the build knows their exact names, so precaching
  // is safe (and closes the first-visit gap where the page loads before the
  // SW controls). Old versions vanish with their version-named cache.
  // Page entries + light shared chunks (heavy vendor chunks runtime-cache).
  ...jsToPrecache.map((f) => `./${f}`),
  `./${cssName}`,
  ...Object.keys(HTML).map((f) => `./${f}`),
  './friends.html', // legacy redirect stub (offline-resolvable)
  './manifest.webmanifest',
  './assets/fonts/fonts.css',
  ...readdirSync('assets/fonts')
    .filter((f) => f.endsWith('.woff2'))
    .map((f) => `./assets/fonts/${f}`),
  ...readdirSync('assets/icons').map((f) => `./assets/icons/${f}`),
  './assets/logo-light.png',
  './assets/logo-dark.png',
  './assets/no-meal-light.png',
  './assets/no-meal-dark.png',
];
buildSync({
  entryPoints: ['src/sw.ts'],
  bundle: true,
  minify: true,
  outfile: 'dist/sw.js',
  define: {
    __BUILD_VERSION__: JSON.stringify(version),
    __PRECACHE__: JSON.stringify(precache),
  },
});

// mainBytes = the landing page (browse) — what most visitors download first.
const info = {
  version,
  builtAt: now.toISOString(),
  mainBytes: pages['browse'].bytes,
  mainGzipBytes: pages['browse'].gzipBytes,
  pages,
};
writeFileSync('dist/build-info.json', JSON.stringify(info));
console.log(
  `built ${version}: ` +
    PAGES.map(
      (p) => `${p} ${(pages[p].bytes / 1024).toFixed(0)}K/${(pages[p].gzipBytes / 1024).toFixed(0)}Kgz`,
    ).join(' · '),
);
