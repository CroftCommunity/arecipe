// Release manifest core (signed releases D1). Platform-neutral — imported by
// the browser verifier, the service worker, vitest, AND (esbuild-bundled at
// build time) the node signer in scripts/build.mjs, so signer and verifier
// share ONE canonicalization. The byte format is pinned by committed vectors
// (tests/fixtures/release/canonical-vector.json): canonical JSON is exactly
// the five signed fields in a fixed order, `files` keys sorted, no whitespace.
// Unknown fields are TOLERATED at parse (open-world posture) but are NOT part
// of the signed bytes — adding a signed field is a format version bump, not a
// silent extension.

export type UnsignedManifest = {
  /** Monotonic release counter (`git rev-list --count HEAD`). */
  buildNumber: number;
  /** Display version, the existing `${date}-${shortSha}` string. */
  version: string;
  builtAt: string;
  /** Path → SHA-256 hex for every dist file except the manifest itself. */
  files: Record<string, string>;
  /** SHA-256 hex of the raw 32-byte Ed25519 pubkey; null on unsigned builds. */
  pubkeyFingerprint: string | null;
};

export type ReleaseManifest = UnsignedManifest & {
  /** Ed25519 over the canonical JSON of the preceding fields, base64; null =
   * honest unsigned build (local dev, PR previews). */
  sig: string | null;
};

/** Canonical signed bytes: fixed key order, sorted files, no whitespace. */
export const canonicalManifestBytes = (m: UnsignedManifest): Uint8Array => {
  const files: Record<string, string> = {};
  for (const path of Object.keys(m.files).sort()) files[path] = m.files[path]!;
  const canonical = JSON.stringify({
    buildNumber: m.buildNumber,
    version: m.version,
    builtAt: m.builtAt,
    files,
    pubkeyFingerprint: m.pubkeyFingerprint,
  });
  return new TextEncoder().encode(canonical);
};

export type ParseResult =
  | { ok: true; manifest: ReleaseManifest }
  | { ok: false; error: string };

const isStringRecord = (v: unknown): v is Record<string, string> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every((entry) => typeof entry === 'string');

/** Boundary validator: only missing/mistyped REQUIRED fields fail; unknown
 * fields pass through untouched on the returned object. */
export const parseReleaseManifest = (data: unknown): ParseResult => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'manifest is not an object' };
  }
  const m = data as Record<string, unknown>;
  if (typeof m['buildNumber'] !== 'number' || !Number.isInteger(m['buildNumber'])) {
    return { ok: false, error: 'buildNumber missing or not an integer' };
  }
  if (typeof m['version'] !== 'string') return { ok: false, error: 'version missing' };
  if (typeof m['builtAt'] !== 'string') return { ok: false, error: 'builtAt missing' };
  if (!isStringRecord(m['files'])) return { ok: false, error: 'files missing or mistyped' };
  if (m['pubkeyFingerprint'] !== null && typeof m['pubkeyFingerprint'] !== 'string') {
    return { ok: false, error: 'pubkeyFingerprint mistyped' };
  }
  if (m['sig'] !== null && typeof m['sig'] !== 'string') {
    return { ok: false, error: 'sig mistyped' };
  }
  return { ok: true, manifest: data as ReleaseManifest };
};

export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

export const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export const base64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};
