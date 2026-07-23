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
import { generateGuideIndex } from './build-guide-index.mjs';
import { htmlShell, mdToHtml } from './md-to-html.mjs';

const PAGES = [
  'browse',
  'mine',
  'cookbook',
  'meals',
  'archive',
  'reference',
  'settings',
  'account',
  'recipe',
  'dish',
  'editor',
  'signin',
  'user-guide',
];
const HTML = {
  'index.html': 'browse',
  'mine.html': 'mine',
  'cookbook.html': 'cookbook',
  'meals.html': 'meals',
  'archive.html': 'archive',
  'reference.html': 'reference',
  'settings.html': 'settings',
  'account.html': 'account',
  'recipe.html': 'recipe',
  'dish.html': 'dish',
  'editor.html': 'editor',
  'signin.html': 'signin',
  'user-guide.html': 'user-guide',
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

// --- Content-Security-Policy (Phase 2) -------------------------------------
// GitHub Pages sets no response headers, so a strict CSP is delivered via
// <meta http-equiv>. Inline <script> blocks are admitted by their exact sha256
// hash, computed here from the real content so the hash can never drift from
// the script it governs (Phase 0 D2). A <meta> CSP does not govern inline
// scripts that precede it (proven in D2), so the meta is injected immediately
// after <meta charset> — charset stays the genuine first child, and the CSP
// still precedes every inline script. No 'unsafe-inline'/'unsafe-eval': the
// built output contains no eval/new Function/WebAssembly (D1).
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

const cspFor = (html) => {
  const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
  return [
    "default-src 'none'",
    `script-src ${["'self'", ...hashes].join(' ')}`,
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://bsky.social https://public.api.bsky.app https://plc.directory https:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
  ].join('; ');
};

const injectCsp = (html) =>
  html.replace(
    /(<meta charset="utf-8" \/>)/i,
    `$1\n    <meta http-equiv="Content-Security-Policy" content="${cspFor(html)}" />`,
  );

// --- Subresource Integrity (Phase 3) ---------------------------------------
// sha384 integrity on the entry ES module + both stylesheets, computed from the
// exact bytes served. Scope is bounded: code-split import() chunks carry no HTML
// tag, so HTML integrity is not expressible on them (Phase 0 D3) — documented in
// docs/SECURITY.md, not silently skipped. crossorigin="anonymous" is required
// for the browser to run the integrity check.
const sri = (bytes) => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
const stylesSri = sri(cssBytes);
const fontsSri = sri(readFileSync('assets/fonts/fonts.css'));

// HTML with hashed refs + CSP + SRI injected.
for (const [file, page] of Object.entries(HTML)) {
  let html = readFileSync(file, 'utf8');
  html = html.replace(`./${page}.js`, `./${bundleOf[page]}`);
  html = html.replace('./styles.css', `./${cssName}`);
  const entrySri = sri(readFileSync(`dist/${bundleOf[page]}`));
  html = html.replace(
    `<script type="module" src="./${bundleOf[page]}"></script>`,
    `<script type="module" src="./${bundleOf[page]}" integrity="${entrySri}" crossorigin="anonymous"></script>`,
  );
  html = html.replace(
    `<link rel="stylesheet" href="./${cssName}" />`,
    `<link rel="stylesheet" href="./${cssName}" integrity="${stylesSri}" crossorigin="anonymous" />`,
  );
  html = html.replace(
    `<link rel="stylesheet" href="./assets/fonts/fonts.css" />`,
    `<link rel="stylesheet" href="./assets/fonts/fonts.css" integrity="${fontsSri}" crossorigin="anonymous" />`,
  );
  html = injectCsp(html);
  writeFileSync(`dist/${file}`, html);
}
copyFileSync('manifest.webmanifest', 'dist/manifest.webmanifest');
// Legacy path → redirect stub (CB3). Copied outside the HTML map, so CSP is
// injected here explicitly or this document would ship with none.
writeFileSync('dist/friends.html', injectCsp(readFileSync('friends.html', 'utf8')));
// Calendar-publish setup guide (P7): a static, JS-less page. It carries no page
// bundle, so it's handled here rather than in the HTML map — but it DOES use the
// shared stylesheet + fonts, so it gets the hashed CSS name + SRI + CSP exactly
// like a mapped page (a <meta> CSP with style-src 'self' forbids inline styles).
{
  let html = readFileSync('calendar-setup.html', 'utf8');
  html = html.replace('./styles.css', `./${cssName}`);
  html = html.replace(
    `<link rel="stylesheet" href="./${cssName}" />`,
    `<link rel="stylesheet" href="./${cssName}" integrity="${stylesSri}" crossorigin="anonymous" />`,
  );
  html = html.replace(
    `<link rel="stylesheet" href="./assets/fonts/fonts.css" />`,
    `<link rel="stylesheet" href="./assets/fonts/fonts.css" integrity="${fontsSri}" crossorigin="anonymous" />`,
  );
  writeFileSync('dist/calendar-setup.html', injectCsp(html));
}
// Agent-facing endpoints (agents-page run): llms.txt (discovery index) and
// agents.md (canonical guide) ship verbatim; agents.html is GENERATED from
// agents.md here — same chrome treatment as calendar-setup.html (hashed CSS +
// SRI + CSP), so the mirror can never drift from the canonical Markdown.
copyFileSync('llms.txt', 'dist/llms.txt');
copyFileSync('agents.md', 'dist/agents.md');
writeFileSync(
  'dist/agents.html',
  injectCsp(
    htmlShell({
      title: 'arecipe — a guide for AI agents',
      body: mdToHtml(readFileSync('agents.md', 'utf8')),
      stylesheets: [
        { href: './assets/fonts/fonts.css', integrity: fontsSri },
        { href: `./${cssName}`, integrity: stylesSri },
      ],
    }),
  ),
);
// Guide helper (RUN-GUIDE-HELPER): the section index, GENERATED from the guide
// by rendering it under happy-dom and walking the same code the browser uses.
// generateGuideIndex enforces the D2 anchor-validity gate — an emitted anchor
// absent from the rendered guide throws here and fails the build. The JSON is a
// deterministic, machine-readable help index; the app itself rebuilds the same
// index from the live guide DOM at runtime (no fetch, drift-proof).
const { serialized: guideIndexJson } = await generateGuideIndex();
writeFileSync('dist/guide-index.json', guideIndexJson);

copyFileSync('CNAME', 'dist/CNAME'); // custom domain survives every deploy
// The site is served from a branch (gh-pages), where GitHub Pages runs Jekyll
// by default — which would reprocess this pre-built SPA and drop any
// underscore-prefixed path. `.nojekyll` at the deploy root disables it. (Under
// the old Actions/artifact Pages source this was unnecessary; the branch-based
// per-PR preview model — docs/PREVIEWS.md — makes it required.)
writeFileSync('dist/.nojekyll', '');
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
  './calendar-setup.html', // calendar-publish setup guide (offline-resolvable)
  './agents.html', // agent guide mirror (offline-resolvable, footer-linked)
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
