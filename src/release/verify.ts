// Release-manifest verification (signed releases D3/D6). Pure core with
// injectable deps (fetch, signature verifier) — runs identically in window,
// service-worker, and vitest contexts. Verification scope THIS tier: manifest
// signature against the pinned pubkey, version identity, buildNumber
// monotonicity. The UI copy names exactly that scope; nothing here implies
// the Phase-3 offline-key / per-file refuse-mode guarantees.
//
// Crypto path: WebCrypto Ed25519 first (all engines since ~May 2025,
// feature-detected), else a dynamic import of @noble/ed25519 — so the
// install-only-verified default can never silently no-op on an older engine.

import {
  base64ToBytes,
  bytesToHex,
  canonicalManifestBytes,
  hexToBytes,
  parseReleaseManifest,
  type ReleaseManifest,
} from './manifest.js';

export type RunningMeta = { version: string; buildNumber: number };

export type VerifyOutcome =
  | { state: 'verified'; manifest: ReleaseManifest }
  /** Valid manifest for a DIFFERENT newer build: a deploy raced this check —
   * not an attack signal. Keep prior state, await the next update cycle. */
  | { state: 'stale-mismatch'; manifest: ReleaseManifest }
  | { state: 'unsigned'; manifest: ReleaseManifest }
  | {
      state: 'invalid';
      reason: 'malformed' | 'fingerprint-mismatch' | 'bad-signature' | 'regression';
      manifest?: ReleaseManifest;
    }
  | { state: 'unchecked'; reason: 'no-pinned-key' | 'fetch-failed' | 'crypto-unavailable' };

export type SigVerifier = (
  pubkey: Uint8Array,
  message: Uint8Array,
  sig: Uint8Array,
) => Promise<boolean>;

/** WebCrypto Ed25519 with the noble fallback (D6). Exported for the SW. */
export const verifyEd25519: SigVerifier = async (pubkey, message, sig) => {
  try {
    const key = await crypto.subtle.importKey('raw', pubkey as BufferSource, 'Ed25519', false, [
      'verify',
    ]);
    return await crypto.subtle.verify('Ed25519', key, sig as BufferSource, message as BufferSource);
  } catch {
    // Engine without WebCrypto Ed25519 → noble (lazy: pages load it only on
    // this path; the SW bundle inlines it).
    const noble = await import('@noble/ed25519');
    return noble.verifyAsync(sig, message, pubkey);
  }
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));

export type VerifyOptions = {
  /** The pinned raw Ed25519 pubkey (hex) this build carries; null = no key
   * pinned yet (pre-rollout builds) → signed manifests are UNCHECKABLE. */
  pubkeyHex: string | null;
  /** The build doing the checking. Omitted → identity/monotonicity checks are
   * skipped (signature + fingerprint only). */
  running?: RunningMeta;
  verifySig?: SigVerifier;
};

export const verifyReleaseManifest = async (
  data: unknown,
  opts: VerifyOptions,
): Promise<VerifyOutcome> => {
  const parsed = parseReleaseManifest(data);
  if (!parsed.ok) return { state: 'invalid', reason: 'malformed' };
  const manifest = parsed.manifest;

  // An honest unsigned build (local dev, previews) — reported as such even
  // when no key is pinned; never a banner off the production origin.
  if (manifest.sig === null) return { state: 'unsigned', manifest };

  if (opts.pubkeyHex === null) return { state: 'unchecked', reason: 'no-pinned-key' };
  const pubkey = hexToBytes(opts.pubkeyHex);

  // The manifest must name the key we pin — checked independently of the
  // signature so a valid sig from the WRONG key can never read as verified.
  if (manifest.pubkeyFingerprint !== (await sha256Hex(pubkey))) {
    return { state: 'invalid', reason: 'fingerprint-mismatch', manifest };
  }

  let sigOk: boolean;
  try {
    sigOk = await (opts.verifySig ?? verifyEd25519)(
      pubkey,
      canonicalManifestBytes(manifest),
      base64ToBytes(manifest.sig),
    );
  } catch {
    return { state: 'unchecked', reason: 'crypto-unavailable' };
  }
  if (!sigOk) return { state: 'invalid', reason: 'bad-signature', manifest };

  if (opts.running !== undefined) {
    if (manifest.buildNumber < opts.running.buildNumber) {
      return { state: 'invalid', reason: 'regression', manifest };
    }
    if (manifest.version !== opts.running.version) return { state: 'stale-mismatch', manifest };
  }
  return { state: 'verified', manifest };
};

export type OriginCheckOptions = VerifyOptions & { fetchFn?: typeof fetch };

/** Fetch the origin's manifest fresh (never a cached copy) and verify it.
 * Relative URL: a PR preview checks its own subtree's manifest, production
 * checks the origin root — same as build-info.json. */
export const checkOriginManifest = async (opts: OriginCheckOptions): Promise<VerifyOutcome> => {
  let data: unknown;
  try {
    const res = await (opts.fetchFn ?? fetch)('./release-manifest.json', { cache: 'reload' });
    if (!res.ok) return { state: 'unchecked', reason: 'fetch-failed' };
    data = await res.json();
  } catch (err) {
    // A non-JSON body on a 200 is a served-something-wrong signal, not a
    // network failure — but indistinguishable cases (opaque errors) stay
    // couldn't-check. SyntaxError from .json() = malformed content.
    if (err instanceof SyntaxError) return { state: 'invalid', reason: 'malformed' };
    return { state: 'unchecked', reason: 'fetch-failed' };
  }
  return verifyReleaseManifest(data, opts);
};
