// Signed releases Phase 1 (build wiring): the built dist carries a
// release-manifest.json that names every dist file with its true SHA-256 and
// is SIGNED — the e2e dist is built with the committed FIXTURE seed
// (`npm run build:e2e`), the same env seam CI's real secret uses, so the
// signed path is exercised end-to-end here without any real key material.
// A plain `npm run build` (no seed) emits sig: null — the honest-unsigned
// posture covered by the unit tier and the build's own self-check.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { verifyReleaseManifest } from '../../src/release/verify.js';
import type { ReleaseManifest } from '../../src/release/manifest.js';

const DIST = new URL('../../dist/', import.meta.url).pathname;
const FIXTURE_PUBKEY = readFileSync(
  new URL('../fixtures/release/pubkey.hex', import.meta.url),
  'utf8',
).trim();

const walk = (dir: string, prefix = ''): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, `${prefix}${name}/`) : [`${prefix}${name}`];
  });

const manifest = (): ReleaseManifest =>
  JSON.parse(readFileSync(join(DIST, 'release-manifest.json'), 'utf8')) as ReleaseManifest;

test('release-manifest.json covers every dist file except itself, with true hashes', () => {
  const m = manifest();
  const distFiles = walk(DIST).filter((f) => f !== 'release-manifest.json');
  expect(Object.keys(m.files).sort()).toEqual(distFiles.sort());
  for (const [path, hash] of Object.entries(m.files)) {
    const actual = createHash('sha256').update(readFileSync(join(DIST, path))).digest('hex');
    expect(actual, `hash of ${path}`).toBe(hash);
  }
});

test('the e2e dist is signed with the fixture key and verifies', async () => {
  const m = manifest();
  expect(m.sig, 'e2e dist must be built via build:e2e (fixture-signed)').not.toBeNull();
  expect(m.buildNumber).toBeGreaterThan(0);
  expect(Number.isInteger(m.buildNumber)).toBe(true);
  const outcome = await verifyReleaseManifest(m, { pubkeyHex: FIXTURE_PUBKEY });
  expect(outcome.state).toBe('verified');
});

test('build-info.json carries the same buildNumber + version as the manifest', () => {
  const m = manifest();
  const info = JSON.parse(readFileSync(join(DIST, 'build-info.json'), 'utf8')) as {
    version: string;
    buildNumber: number;
  };
  expect(info.buildNumber).toBe(m.buildNumber);
  expect(info.version).toBe(m.version);
});
