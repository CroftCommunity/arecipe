// One-off generator for the committed release-signing fixtures. Run from the
// repo root: `node tests/fixtures/release/generate.mjs`. Deliberately carries
// its OWN canonicalization (not the src/release/manifest.ts one) so the
// committed vectors independently cross-pin the app implementation — if either
// side drifts, tests/unit/release/manifest.spec.ts fails loud.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const out = (name) => new URL(name, here);

// Keypair: reuse the committed seed if present (regenerating manifests must not
// silently rotate the fixture key), else mint one.
let seed;
if (existsSync(out('signing-seed.b64'))) {
  seed = Buffer.from(readFileSync(out('signing-seed.b64'), 'utf8').trim(), 'base64');
} else {
  const { privateKey } = generateKeyPairSync('ed25519');
  // PKCS8 for Ed25519 = fixed 16-byte prefix + the raw 32-byte seed.
  seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  writeFileSync(out('signing-seed.b64'), `${seed.toString('base64')}\n`);
}
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, seed]),
  format: 'der',
  type: 'pkcs8',
});
// SPKI for Ed25519 = fixed 12-byte prefix + the raw 32-byte public key.
const pubRaw = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
writeFileSync(out('pubkey.hex'), `${pubRaw.toString('hex')}\n`);
const fingerprint = createHash('sha256').update(pubRaw).digest('hex');

// Canonical JSON: exactly these five keys in this order, files keys sorted,
// no whitespace (JSON.stringify of explicitly ordered objects emits none).
const canonical = (m) =>
  JSON.stringify({
    buildNumber: m.buildNumber,
    version: m.version,
    builtAt: m.builtAt,
    files: Object.fromEntries(Object.entries(m.files).sort(([a], [b]) => (a < b ? -1 : 1))),
    pubkeyFingerprint: m.pubkeyFingerprint,
  });

const FILES = {
  'index.html': createHash('sha256').update('<!doctype html>index').digest('hex'),
  'browse-abc123.js': createHash('sha256').update('console.log("browse")').digest('hex'),
  'styles-def456.css': createHash('sha256').update('body{}').digest('hex'),
  'sw.js': createHash('sha256').update('// sw').digest('hex'),
};

const signManifest = (m) => ({
  ...m,
  sig: sign(null, Buffer.from(canonical(m), 'utf8'), privateKey).toString('base64'),
});

const base = {
  buildNumber: 100,
  version: '2026.07.16-fixt100',
  builtAt: '2026-07-16T12:00:00.000Z',
  files: FILES,
  pubkeyFingerprint: fingerprint,
};

const write = (name, value) => writeFileSync(out(name), `${JSON.stringify(value, null, 2)}\n`);

write('signed-manifest.json', signManifest(base));
write('signed-manifest-newer.json', signManifest({ ...base, buildNumber: 101, version: '2026.07.17-fixt101' }));
write(
  'signed-manifest-regression.json',
  signManifest({ ...base, buildNumber: 99, version: '2026.07.15-fixt099' }),
);
write('unsigned-manifest.json', { ...base, pubkeyFingerprint: null, sig: null });
writeFileSync(out('canonical-vector.json'), `${canonical(base)}\n`);
console.log('release fixtures written; pubkey fingerprint:', fingerprint);
