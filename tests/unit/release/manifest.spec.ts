// Signed releases Phase 1 (RED first): the manifest core — canonicalization,
// parsing, and the browser-side verifier — against COMMITTED fixtures produced
// by an independent node signer (tests/fixtures/release/generate.mjs). The
// committed canonical vector pins the byte format: if either implementation
// drifts, sign/verify stops round-tripping and these tests fail loud.
//
// Verdict semantics under test (run ruling D3):
// - valid sig + version identity + monotonic buildNumber → verified
// - valid sig for a DIFFERENT newer version → stale-mismatch (a racing deploy,
//   not an attack signal)
// - sig: null → unsigned
// - flipped byte anywhere in the signed fields, bad sig, wrong fingerprint,
//   or a buildNumber regression → invalid
// - no pinned key / fetch failure → unchecked (couldn't-check tier)
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalManifestBytes,
  parseReleaseManifest,
  type ReleaseManifest,
} from '../../../src/release/manifest.js';
import { checkOriginManifest, verifyReleaseManifest } from '../../../src/release/verify.js';

const fixture = (name: string): string =>
  readFileSync(new URL(`../../fixtures/release/${name}`, import.meta.url), 'utf8');

const SEED = Buffer.from(fixture('signing-seed.b64').trim(), 'base64');
const PUBKEY_HEX = fixture('pubkey.hex').trim();
const SIGNED = JSON.parse(fixture('signed-manifest.json')) as ReleaseManifest;
const SIGNED_NEWER = JSON.parse(fixture('signed-manifest-newer.json')) as ReleaseManifest;
const SIGNED_REGRESSION = JSON.parse(fixture('signed-manifest-regression.json')) as ReleaseManifest;
const UNSIGNED = JSON.parse(fixture('unsigned-manifest.json')) as ReleaseManifest;

/** The fixture build this device is "running" — matches signed-manifest.json. */
const RUNNING = { version: SIGNED.version, buildNumber: SIGNED.buildNumber };

/** Node-side signer for in-test cases (same PKCS8-from-seed shape as build.mjs). */
const signCanonical = (bytes: Uint8Array): string => {
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]);
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return nodeSign(null, bytes, key).toString('base64');
};

describe('canonicalManifestBytes', () => {
  it('is stable across input key order and byte-identical to the committed vector', () => {
    const canonical = new TextDecoder().decode(
      canonicalManifestBytes({
        buildNumber: SIGNED.buildNumber,
        version: SIGNED.version,
        builtAt: SIGNED.builtAt,
        files: SIGNED.files,
        pubkeyFingerprint: SIGNED.pubkeyFingerprint,
      }),
    );
    expect(canonical).toBe(fixture('canonical-vector.json').trim());

    // Scrambled input key order (incl. files) produces the same bytes.
    const scrambledFiles = Object.fromEntries(Object.entries(SIGNED.files).reverse());
    const scrambled = new TextDecoder().decode(
      canonicalManifestBytes({
        pubkeyFingerprint: SIGNED.pubkeyFingerprint,
        files: scrambledFiles,
        builtAt: SIGNED.builtAt,
        buildNumber: SIGNED.buildNumber,
        version: SIGNED.version,
      }),
    );
    expect(scrambled).toBe(canonical);
  });

  it('contains no whitespace outside string values', () => {
    const canonical = new TextDecoder().decode(
      canonicalManifestBytes({
        buildNumber: 1,
        version: 'v',
        builtAt: 't',
        files: { 'a b.html': 'x' },
        pubkeyFingerprint: null,
      }),
    );
    // Only the space inside the quoted filename survives.
    expect(canonical.split('"a b.html"').join('')).not.toMatch(/\s/);
  });
});

describe('parseReleaseManifest (boundary validator)', () => {
  it('accepts a well-formed manifest and tolerates unknown fields (open-world)', () => {
    const withExtra = { ...SIGNED, futureField: { anything: true } };
    const parsed = parseReleaseManifest(withExtra);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.manifest.version).toBe(SIGNED.version);
  });

  it.each([
    ['buildNumber missing', (() => { const m = { ...SIGNED } as Record<string, unknown>; delete m['buildNumber']; return m; })()],
    ['buildNumber mistyped', { ...SIGNED, buildNumber: '100' }],
    ['files mistyped', { ...SIGNED, files: ['index.html'] }],
    ['version missing', (() => { const m = { ...SIGNED } as Record<string, unknown>; delete m['version']; return m; })()],
    ['not an object', 'nope'],
  ])('fails loud on a missing/mistyped required field: %s', (_label, bad) => {
    expect(parseReleaseManifest(bad).ok).toBe(false);
  });
});

describe('verifyReleaseManifest', () => {
  it('verifies the node-signed fixture against the fixture pubkey (round-trip)', async () => {
    const outcome = await verifyReleaseManifest(SIGNED, { pubkeyHex: PUBKEY_HEX, running: RUNNING });
    expect(outcome.state).toBe('verified');
  });

  it('reports STALE-MISMATCH (not invalid) for a valid manifest of a newer version', async () => {
    const outcome = await verifyReleaseManifest(SIGNED_NEWER, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('stale-mismatch');
  });

  it('reports invalid (regression) when buildNumber goes backwards', async () => {
    const outcome = await verifyReleaseManifest(SIGNED_REGRESSION, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('invalid');
    if (outcome.state === 'invalid') expect(outcome.reason).toBe('regression');
  });

  it('reports unsigned for sig: null', async () => {
    const outcome = await verifyReleaseManifest(UNSIGNED, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('unsigned');
  });

  it('a flipped byte in a file hash invalidates the signature', async () => {
    const files = { ...SIGNED.files };
    const [path, hash] = Object.entries(files)[0]!;
    files[path] = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
    const outcome = await verifyReleaseManifest({ ...SIGNED, files }, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('invalid');
    if (outcome.state === 'invalid') expect(outcome.reason).toBe('bad-signature');
  });

  it('a flipped byte in the sig fails', async () => {
    const sigBytes = Buffer.from(SIGNED.sig!, 'base64');
    sigBytes[0]! ^= 0xff;
    const outcome = await verifyReleaseManifest({ ...SIGNED, sig: sigBytes.toString('base64') }, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('invalid');
  });

  it('a fingerprint that does not match the pinned pubkey is invalid (fingerprint-mismatch)', async () => {
    // Re-sign with a lying fingerprint so the sig itself is valid — the
    // fingerprint check must catch it independently of signature validity.
    const lying = {
      buildNumber: SIGNED.buildNumber,
      version: SIGNED.version,
      builtAt: SIGNED.builtAt,
      files: SIGNED.files,
      pubkeyFingerprint: 'ab'.repeat(32),
    };
    const sig = signCanonical(canonicalManifestBytes(lying));
    const outcome = await verifyReleaseManifest({ ...lying, sig }, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('invalid');
    if (outcome.state === 'invalid') expect(outcome.reason).toBe('fingerprint-mismatch');
  });

  it('reports unchecked (no-pinned-key) for a SIGNED manifest when no key is pinned', async () => {
    const outcome = await verifyReleaseManifest(SIGNED, { pubkeyHex: null, running: RUNNING });
    expect(outcome.state).toBe('unchecked');
    if (outcome.state === 'unchecked') expect(outcome.reason).toBe('no-pinned-key');
  });

  it('still reports unsigned (not unchecked) for sig: null with no pinned key', async () => {
    const outcome = await verifyReleaseManifest(UNSIGNED, { pubkeyHex: null, running: RUNNING });
    expect(outcome.state).toBe('unsigned');
  });

  it('without running meta it verifies signature + fingerprint only', async () => {
    // The panel's on-demand display check may run before the SW meta round-trip
    // resolves — identity/monotonicity checks are skipped, not failed.
    const outcome = await verifyReleaseManifest(SIGNED_NEWER, { pubkeyHex: PUBKEY_HEX });
    expect(outcome.state).toBe('verified');
  });

  it('reports invalid (malformed) for a structurally bad manifest', async () => {
    const outcome = await verifyReleaseManifest({ nope: true }, {
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
    });
    expect(outcome.state).toBe('invalid');
    if (outcome.state === 'invalid') expect(outcome.reason).toBe('malformed');
  });
});

describe('checkOriginManifest', () => {
  const fetchOk = (body: unknown): typeof fetch =>
    (() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;

  it('fetches ./release-manifest.json fresh and verifies it', async () => {
    let requested: RequestInfo | URL | undefined;
    let init: RequestInit | undefined;
    const fetchSpy: typeof fetch = (input, opts) => {
      requested = input;
      init = opts;
      return Promise.resolve(new Response(JSON.stringify(SIGNED), { status: 200 }));
    };
    const outcome = await checkOriginManifest({
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
      fetchFn: fetchSpy,
    });
    expect(outcome.state).toBe('verified');
    expect(String(requested)).toContain('release-manifest.json');
    // Always network — never a cached copy of an old manifest.
    expect(init?.cache).toBe('reload');
  });

  it('reports unchecked (fetch-failed) when the origin fetch rejects or 404s', async () => {
    const rejecting: typeof fetch = () => Promise.reject(new Error('offline'));
    const offline = await checkOriginManifest({
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
      fetchFn: rejecting,
    });
    expect(offline.state).toBe('unchecked');
    if (offline.state === 'unchecked') expect(offline.reason).toBe('fetch-failed');

    const missing: typeof fetch = () => Promise.resolve(new Response('nope', { status: 404 }));
    const notFound = await checkOriginManifest({
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
      fetchFn: missing,
    });
    expect(notFound.state).toBe('unchecked');
    if (notFound.state === 'unchecked') expect(notFound.reason).toBe('fetch-failed');
  });

  it('reports invalid (malformed) for a manifest that is not JSON', async () => {
    const garbage: typeof fetch = () => Promise.resolve(new Response('<html>', { status: 200 }));
    const outcome = await checkOriginManifest({
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
      fetchFn: garbage,
    });
    expect(outcome.state).toBe('invalid');
  });

  it('verifies via a WebCrypto-unavailable fallback path (injectable verifier)', async () => {
    // D6: the verify seam is injectable, so environments without WebCrypto
    // Ed25519 (older engines) can be exercised — here a stub records the call.
    let called = false;
    const outcome = await checkOriginManifest({
      pubkeyHex: PUBKEY_HEX,
      running: RUNNING,
      fetchFn: fetchOk(SIGNED),
      verifySig: (pubkey, message, sig) => {
        called = true;
        expect(pubkey).toHaveLength(32);
        expect(sig).toHaveLength(64);
        expect(message.length).toBeGreaterThan(0);
        return Promise.resolve(true);
      },
    });
    expect(called).toBe(true);
    expect(outcome.state).toBe('verified');
  });
});
