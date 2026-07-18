// Digital Asset Links reach the built site (plan 2026-07-18-1): the build
// must land assetlinks.json at dist/.well-known/assetlinks.json, because
// Android verifies a TWA by fetching /.well-known/assetlinks.json from the
// live origin. This spec exercises the SERVED path (the e2e server serves
// dist/), and pins the served fingerprint to the committed constant in
// android/expected-cert-sha256.txt — same source the unit gate and the
// release workflow's apksigner check use.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('dist serves /.well-known/assetlinks.json for the TWA package', async ({ request }) => {
  const res = await request.get('/.well-known/assetlinks.json');
  expect(res.status()).toBe(200);

  const statements = (await res.json()) as {
    relation: string[];
    target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
  }[];
  expect(statements[0]!.relation).toContain('delegate_permission/common.handle_all_urls');
  expect(statements[0]!.target.namespace).toBe('android_app');
  expect(statements[0]!.target.package_name).toBe('app.arecipe.twa');

  const expected = readFileSync('android/expected-cert-sha256.txt', 'utf8').trim();
  expect(statements[0]!.target.sha256_cert_fingerprints[0]).toBe(expected);
});
