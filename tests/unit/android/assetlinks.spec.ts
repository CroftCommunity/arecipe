// Digital Asset Links (Android TWA, plan 2026-07-18-1). The committed
// assetlinks.json at the repo root is the source of truth for what the site
// serves at /.well-known/assetlinks.json; a TWA only renders full-screen
// (no browser UI) when the fingerprint here matches the APK's signing
// certificate. The fingerprint itself lives in ONE committed place —
// android/expected-cert-sha256.txt — shared by this test (assetlinks must
// agree) and the release workflow's apksigner check (the APK must agree),
// so a keystore rotation cannot silently desync the site from the app.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// apksigner's SHA-256 format: 32 colon-separated uppercase hex byte pairs.
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const expectedFingerprint = (): string =>
  readFileSync('android/expected-cert-sha256.txt', 'utf8').trim();

type Statement = {
  relation: string[];
  target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
};

describe('android/expected-cert-sha256.txt (the single fingerprint source)', () => {
  it('holds exactly one well-formed SHA-256 certificate fingerprint', () => {
    const value = expectedFingerprint();
    expect(value).toMatch(FINGERPRINT_RE);
    // One line, no extra content — the release workflow reads it with shell.
    expect(readFileSync('android/expected-cert-sha256.txt', 'utf8').trim().split('\n').length).toBe(1);
  });
});

describe('assetlinks.json (served as /.well-known/assetlinks.json)', () => {
  const statements = JSON.parse(readFileSync('assetlinks.json', 'utf8')) as Statement[];

  it('is a statement list granting handle_all_urls to the TWA package', () => {
    expect(Array.isArray(statements)).toBe(true);
    expect(statements.length).toBeGreaterThanOrEqual(1);
    const st = statements[0]!;
    expect(st.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(st.target.namespace).toBe('android_app');
    expect(st.target.package_name).toBe('app.arecipe.twa');
  });

  it('carries well-formed fingerprints, and the first equals the committed constant', () => {
    const prints = statements[0]!.target.sha256_cert_fingerprints;
    // Array shape: a later Play App Signing entry is an additive second element.
    expect(Array.isArray(prints)).toBe(true);
    expect(prints.length).toBeGreaterThanOrEqual(1);
    for (const p of prints) expect(p).toMatch(FINGERPRINT_RE);
    expect(prints[0]).toBe(expectedFingerprint());
  });
});
