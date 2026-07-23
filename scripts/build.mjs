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
  existsSync,
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
import { collectCommits, mergeChangelog, parseChangelog, repoUrlFromGit } from './changelog.mjs';

// Gzipped ceiling for the snapshot index.json (RUN-BUNDLE-PRECACHE, D1). Set
// from D6 measurement: the seed index.json gzips to well under a KB; the corpus
// (titles + rkeys only, thousands of records) is the design's growth case. 96 KB
// gzipped leaves generous headroom for the corpus tenant while still failing the
// build long before the file could defeat its own instant-first-paint purpose.
// Override per build with SNAPSHOT_INDEX_GZIP_CEILING (used by the gate test).
const SNAPSHOT_INDEX_GZIP_CEILING = 96 * 1024;

const PAGES = [
  'browse',
  'mine',
  'cookbook',
  'meals',
  'archive',
  'reference',
  'timers',
  'settings',
  'account',
  'recipe',
  'dish',
  'editor',
  'signin',
  'user-guide',
  'changelog',
];
const HTML = {
  'index.html': 'browse',
  'mine.html': 'mine',
  'cookbook.html': 'cookbook',
  'meals.html': 'meals',
  // Plan (the builder) shares the meals bundle; meals.ts routes on pathname.
  'plan.html': 'meals',
  'archive.html': 'archive',
  'reference.html': 'reference',
  'timers.html': 'timers',
  'settings.html': 'settings',
  'account.html': 'account',
  'recipe.html': 'recipe',
  'dish.html': 'dish',
  'editor.html': 'editor',
  'signin.html': 'signin',
  'user-guide.html': 'user-guide',
  'changelog.html': 'changelog',
};

rmSync('dist', { recursive: true, force: true }); // no stale artifacts
mkdirSync('dist', { recursive: true });

// Version string (buildId). Computed up front because the snapshot path
// (assets/snapshot/<buildId>/) is immutable + versioned, and the page bundles
// bake it in via __SNAPSHOT_BUILD__ so the boot path knows the exact, precached
// index.json URL with zero runtime lookup.
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const now = new Date();
const date = now.toISOString().slice(0, 10).replaceAll('-', '.');
const version = `${date}-${sha}`;

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
  define: { __SNAPSHOT_BUILD__: JSON.stringify(version) },
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

// Every page keeps the same strict no-eval/no-wasm policy: script-src is 'self'
// plus the sha256 of each inline script, nothing else. Documented in
// docs/SECURITY.md.
const cspFor = (html) => {
  const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
  const scriptSrc = ["'self'", ...hashes];
  return [
    "default-src 'none'",
    `script-src ${scriptSrc.join(' ')}`,
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

// Guard: asset/nav paths must be RELATIVE, never absolute-root. arecipe deploys
// to a domain root (arecipe.app) AND serves per-PR previews under
// gh-pages:/pr-preview/pr-N/ (docs/PREVIEWS.md). An absolute-root href/src like
// `/assets/x.js` resolves to the domain root and 404s under the preview subpath —
// a silently-blank preview. The hermetic gate serves at a root, so it cannot
// catch this; fail the build instead. (scheme-absolute URLs like https://… are
// fine and not matched.)
const absoluteOffenders = readdirSync('dist')
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ file: f, hits: readFileSync(`dist/${f}`, 'utf8').match(/(?:href|src)="\/[^"]*"/g) }))
  .filter((o) => o.hits);
if (absoluteOffenders.length > 0) {
  const detail = absoluteOffenders
    .map((o) => `  ${o.file}: ${o.hits.join(', ')}`)
    .join('\n');
  throw new Error(
    `build: absolute-root asset path(s) found — these break the /pr-preview/ subpath.\n${detail}\n` +
      `Use relative paths (e.g. "assets/x.js", not "/assets/x.js").`,
  );
}

// --- Build-time snapshot (RUN-BUNDLE-PRECACHE, D1) --------------------------
// scripts/snapshot.mjs (run in CI before this build) captures each seed cook's
// repo torn-shard-safely into `.snapshot-staging/`. Here we STAMP it with the
// build id and place it at the immutable versioned path dist/assets/snapshot/
// <buildId>/, enforce the gzipped index.json ceiling, and return the file list
// for precache. If staging is absent (local build with no network step), we emit
// a valid empty skeleton so the build never breaks and the app degrades to live
// loading. build.mjs itself stays hermetic — no network here.
const emitSnapshot = () => {
  const staging = '.snapshot-staging';
  const outDir = `dist/assets/snapshot/${version}`;
  mkdirSync(`${outDir}/cooks`, { recursive: true });
  const files = [`./assets/snapshot/${version}/index.json`, `./assets/snapshot/${version}/manifest.json`];

  const have = existsSync(staging);
  const index = have
    ? JSON.parse(readFileSync(`${staging}/index.json`, 'utf8'))
    : { cooks: [] };
  const manifest = have
    ? JSON.parse(readFileSync(`${staging}/manifest.json`, 'utf8'))
    : { capturedAt: now.toISOString(), cooks: [], omitted: [] };
  index.buildId = version;
  manifest.buildId = version;

  if (have && existsSync(`${staging}/cooks`)) {
    for (const f of readdirSync(`${staging}/cooks`)) {
      cpSync(`${staging}/cooks/${f}`, `${outDir}/cooks/${f}`);
      files.push(`./assets/snapshot/${version}/cooks/${f}`);
    }
  }
  const indexBytes = Buffer.from(JSON.stringify(index));
  writeFileSync(`${outDir}/index.json`, indexBytes);
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest));

  // Size gate: gzipped index.json must stay under the declared ceiling. The
  // number is set from D6 measurement (see RUN-BUNDLE-PRECACHE-SUMMARY.md); the
  // env override exists so the gate itself is testable.
  const CEILING = Number(process.env.SNAPSHOT_INDEX_GZIP_CEILING ?? SNAPSHOT_INDEX_GZIP_CEILING);
  const gz = gzipSync(indexBytes).length;
  if (gz > CEILING) {
    throw new Error(
      `snapshot index.json is ${gz} B gzipped, over the ${CEILING} B ceiling — ` +
        `trim the index (titles + rkeys only) or raise SNAPSHOT_INDEX_GZIP_CEILING deliberately`,
    );
  }
  console.log(`snapshot: ${index.cooks.length} cook(s), index.json ${indexBytes.length}B raw / ${gz}B gz (ceiling ${CEILING}B)`);
  return files;
};
const snapshotFiles = emitSnapshot();

// Version + per-page sizes.
const pages = Object.fromEntries(
  PAGES.map((p) => {
    const bytes = readFileSync(`dist/${bundleOf[p]}`);
    return [p, { bytes: bytes.length, gzipBytes: gzipSync(bytes).length, file: bundleOf[p] }];
  }),
);

// Bundle-size budget (adopted from croft-pwa): each PAGE ENTRY's gzipped size is
// capped — a tripwire against accidental entry bloat. Shared chunks (incl. the
// ~176K gz @atproto/api client, lazy-loaded via recipe.ts and runtime-cached) are
// intentionally excluded, since they are not a page's up-front cost. Raise it
// deliberately rather than letting it drift.
const PAGE_ENTRY_GZ_BUDGET = 24 * 1024;
const overBudget = Object.entries(pages).filter(([, s]) => s.gzipBytes > PAGE_ENTRY_GZ_BUDGET);
if (overBudget.length > 0) {
  throw new Error(
    `build: page bundle budget exceeded (${(PAGE_ENTRY_GZ_BUDGET / 1024).toFixed(0)}K gz/entry):\n` +
      overBudget.map(([p, s]) => `  ${p}: ${(s.gzipBytes / 1024).toFixed(1)}K gz`).join('\n'),
  );
}

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
  './changelog.json', // generated changelog data (offline-resolvable; the page fetches it)
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
  // Build-time snapshot (D5): precached at install so first paint reads it from
  // the Cache API with zero network. Versioned + immutable — an old build's
  // snapshot vanishes with its version-named cache on activate.
  ...snapshotFiles,
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

// Changelog: opt-in `Changelog:` commit trailers (collected from `git log`, parsed
// by scripts/changelog.mjs — unit-tested) unioned with the hand-authored backlog
// seed. Needs git history — CI checks out fetch-depth:0 for this reason; a shallow
// clone just yields fewer derived entries (the seed is unaffected), never a failure.
const commits = collectCommits();
const derivedEntries = parseChangelog(commits, { repoUrl: repoUrlFromGit() });
// Backlog seed: hand-authored pre-convention history (changelog.seed.json), unioned +
// deduped with the git-derived entries so the timeline is complete and only grows.
let seedEntries = [];
try {
  seedEntries = JSON.parse(readFileSync('changelog.seed.json', 'utf8')).entries ?? [];
} catch {
  /* no seed committed — derived entries only */
}
const changelog = { generatedAt: now.toISOString(), entries: mergeChangelog(seedEntries, derivedEntries) };
writeFileSync('dist/changelog.json', JSON.stringify(changelog));
console.log(
  `changelog: ${changelog.entries.length} entries (${seedEntries.length} seed + ${derivedEntries.length} derived) from ${commits.length} commits`,
);
console.log(
  `built ${version}: ` +
    PAGES.map(
      (p) => `${p} ${(pages[p].bytes / 1024).toFixed(0)}K/${(pages[p].gzipBytes / 1024).toFixed(0)}Kgz`,
    ).join(' · '),
);
