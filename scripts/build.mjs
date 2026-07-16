// Build (Phase 8b shape): page bundles + styles get CONTENT-HASHED names
// injected into stable-named HTML (the peadoubleueh cache-buster: a deploy
// changes URLs, so stale JS is structurally impossible). The service worker
// is compiled with the build version + the stable-shell precache list baked
// in. build-info.json stays stable-named and uncached (deploy checks).
import { execSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';

// --- Release signing (signed releases D1/D2) ---------------------------------
// The canonicalization is the ONE shared implementation in src/release/
// (esbuild-bundled here so signer and browser verifier can never drift); the
// signing key is the `ARECIPE_SIGNING_SEED` env (base64 32-byte Ed25519 seed):
// present in CI's main-branch deploy job (and in `build:e2e` via the committed
// FIXTURE seed) — absent locally, where the manifest is emitted honestly
// unsigned (sig: null). Ed25519 DER framing: PKCS8/SPKI are fixed prefixes
// around the raw 32 bytes.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const releaseCore = await (async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arecipe-release-'));
  buildSync({
    entryPoints: ['src/release/manifest.ts', 'src/release/keys.ts'],
    bundle: true,
    format: 'esm',
    outdir: dir,
  });
  const [manifest, keys] = await Promise.all([
    import(pathToFileURL(join(dir, 'manifest.js')).href),
    import(pathToFileURL(join(dir, 'keys.js')).href),
  ]);
  return { ...manifest, ...keys };
})();

const signingSeed = (() => {
  const b64 = process.env.ARECIPE_SIGNING_SEED?.trim();
  if (b64 === undefined || b64 === '') return null;
  const seed = Buffer.from(b64, 'base64');
  if (seed.length !== 32) throw new Error('ARECIPE_SIGNING_SEED must be a base64 32-byte seed');
  return seed;
})();
const signingKey =
  signingSeed === null
    ? null
    : createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, signingSeed]), format: 'der', type: 'pkcs8' });
// The pubkey this build pins for its clients: derived from the seed when
// signing, else the committed key (src/release/keys.ts), else null (signing
// not yet enabled). A seed whose pubkey mismatches a committed key is a
// misconfiguration — fail the build, never sign with the wrong key.
const derivedPubkeyHex =
  signingKey === null
    ? null
    : createPublicKey(signingKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
if (
  derivedPubkeyHex !== null &&
  releaseCore.RELEASE_PUBKEY_HEX !== null &&
  derivedPubkeyHex !== releaseCore.RELEASE_PUBKEY_HEX
) {
  console.error('release signing: ARECIPE_SIGNING_SEED does not match the committed pubkey (src/release/keys.ts)');
  process.exit(1);
}
const releasePubkeyHex = derivedPubkeyHex ?? releaseCore.RELEASE_PUBKEY_HEX;
const pubkeyFingerprint =
  releasePubkeyHex === null
    ? null
    : createHash('sha256').update(Buffer.from(releasePubkeyHex, 'hex')).digest('hex');

const walkDist = (dir, prefix = '') =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walkDist(full, `${prefix}${name}/`) : [`${prefix}${name}`];
  });

const hashDistFiles = () => {
  const files = {};
  for (const path of walkDist('dist').filter((f) => f !== 'release-manifest.json').sort()) {
    files[path] = createHash('sha256').update(readFileSync(`dist/${path}`)).digest('hex');
  }
  return files;
};

// Self-check (wired into the gate as `node scripts/build.mjs --verify-manifest`
// and run in-process at the end of every build): the emitted manifest must
// name every dist file with its true hash, and the signature must be present
// and valid whenever a key is expected — a bad or missing-when-expected sig
// exits nonzero.
const verifyDistManifest = () => {
  const manifest = JSON.parse(readFileSync('dist/release-manifest.json', 'utf8'));
  const fail = (msg) => {
    console.error(`release-manifest self-check FAILED: ${msg}`);
    process.exit(1);
  };
  const actual = hashDistFiles();
  const missing = Object.keys(actual).filter((f) => manifest.files[f] !== actual[f]);
  const extra = Object.keys(manifest.files).filter((f) => actual[f] === undefined);
  if (missing.length > 0 || extra.length > 0) {
    fail(`file coverage/hash mismatch (bad-or-missing: ${missing.join(', ') || '—'}; extra: ${extra.join(', ') || '—'})`);
  }
  if (releasePubkeyHex === null) {
    if (manifest.sig !== null) fail('manifest is signed but this build expects no key');
    console.log('release-manifest self-check OK (unsigned build — no signing key expected)');
    return;
  }
  if (manifest.sig === null) fail('manifest is unsigned but a signing key was expected');
  if (manifest.pubkeyFingerprint !== pubkeyFingerprint) fail('pubkeyFingerprint mismatch');
  const pubkey = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(releasePubkeyHex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
  const canonical = releaseCore.canonicalManifestBytes(manifest);
  if (!verify(null, canonical, pubkey, Buffer.from(manifest.sig, 'base64'))) {
    fail('signature does not verify');
  }
  console.log(`release-manifest self-check OK (signed, fingerprint ${manifest.pubkeyFingerprint.slice(0, 16)}…)`);
};

if (process.argv.includes('--verify-manifest')) {
  verifyDistManifest();
  process.exit(0);
}

const PAGES = [
  'browse',
  'mine',
  'cookbook',
  'meals',
  'reference',
  'settings',
  'account',
  'recipe',
  'dish',
  'editor',
  'signin',
];
const HTML = {
  'index.html': 'browse',
  'mine.html': 'mine',
  'cookbook.html': 'cookbook',
  'meals.html': 'meals',
  'reference.html': 'reference',
  'settings.html': 'settings',
  'account.html': 'account',
  'recipe.html': 'recipe',
  'dish.html': 'dish',
  'editor.html': 'editor',
  'signin.html': 'signin',
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
  // The pinned release pubkey only — NOT version/buildNumber, which change
  // every deploy and would churn every content-hashed bundle name. Pages learn
  // the running build's version/buildNumber from the controlling SW instead.
  define: { __RELEASE_PUBKEY__: JSON.stringify(releasePubkeyHex) },
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
copyFileSync('CNAME', 'dist/CNAME'); // custom domain survives every deploy
// The site is served from a branch (gh-pages), where GitHub Pages runs Jekyll
// by default — which would reprocess this pre-built SPA and drop any
// underscore-prefixed path. `.nojekyll` at the deploy root disables it. (Under
// the old Actions/artifact Pages source this was unnecessary; the branch-based
// per-PR preview model — docs/PREVIEWS.md — makes it required.)
writeFileSync('dist/.nojekyll', '');
copyFileSync('client-metadata.json', 'dist/client-metadata.json'); // hosted OAuth client id (8c)
cpSync('assets', 'dist/assets', { recursive: true });

// Version + per-page sizes. The date-sha version stays the display string;
// buildNumber (commit count) is the MONOTONIC counter the release manifest
// and the client-side regression check compare (D1).
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const buildNumber = Number(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim());
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
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __RELEASE_PUBKEY__: JSON.stringify(releasePubkeyHex),
    __PRECACHE__: JSON.stringify(precache),
  },
});

// mainBytes = the landing page (browse) — what most visitors download first.
const info = {
  version,
  buildNumber,
  builtAt: now.toISOString(),
  mainBytes: pages['browse'].bytes,
  mainGzipBytes: pages['browse'].gzipBytes,
  pages,
};
writeFileSync('dist/build-info.json', JSON.stringify(info));

// --- Release manifest (last: it names every other dist file) ----------------
// Signed when the seed env is present (CI main deploys, build:e2e), emitted
// with sig: null otherwise — local and preview builds are honestly unsigned.
const unsignedManifest = {
  buildNumber,
  version,
  builtAt: now.toISOString(),
  files: hashDistFiles(),
  pubkeyFingerprint: signingKey === null ? null : pubkeyFingerprint,
};
const manifest = {
  ...unsignedManifest,
  sig:
    signingKey === null
      ? null
      : sign(null, releaseCore.canonicalManifestBytes(unsignedManifest), signingKey).toString('base64'),
};
writeFileSync('dist/release-manifest.json', JSON.stringify(manifest));
verifyDistManifest();

console.log(
  `built ${version} (#${buildNumber}${manifest.sig === null ? ', unsigned' : ', signed'}): ` +
    PAGES.map(
      (p) => `${p} ${(pages[p].bytes / 1024).toFixed(0)}K/${(pages[p].gzipBytes / 1024).toFixed(0)}Kgz`,
    ).join(' · '),
);
