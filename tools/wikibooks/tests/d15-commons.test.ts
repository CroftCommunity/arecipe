// D15 Phase 8 — Commons resolver + license gate. Resolves an infobox image
// filename to a web-optimized rendition (largest ≤1 MB via the iiurlwidth
// ladder, measured on the DOWNLOADED bytes — imageinfo.size is the original,
// not the thumb), with per-image credit. Free-culture license allowlist. All
// tested with a fake fetch (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptLicense } from '../src/images/license.ts';
import { CommonsClient } from '../src/images/commons-client.ts';
import { FakeClock } from '../src/util/clock.ts';

test('license allowlist: free-culture accepted, NC/ND/unknown skipped (version-agnostic)', () => {
  for (const ok of ['CC BY-SA 3.0', 'CC BY-SA 2.5', 'CC BY 4.0', 'CC0 1.0', 'Public domain', 'CC0']) {
    assert.equal(acceptLicense(ok).accept, true, `${ok} should be accepted`);
  }
  for (const no of ['CC BY-NC 3.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 4.0', 'GFDL', 'All rights reserved', '']) {
    assert.equal(acceptLicense(no).accept, false, `${no} should be skipped`);
    assert.ok(acceptLicense(no).reason, 'skip carries a reason');
  }
});

// Fake Commons: imageinfo returns license/artist + a thumburl per requested
// width; the thumb download returns bytes sized by width (1024→1.1MB, 800→0.9MB).
const bytesForWidth = (w: number): Uint8Array => new Uint8Array(w >= 1024 ? 1_100_000 : 900_000);

const fakeFetch = (opts: { license?: string; artistHtml?: string; missing?: boolean } = {}) =>
  async (url: string) => {
    if (url.includes('api.php')) {
      const w = Number(new URL(url).searchParams.get('iiurlwidth') ?? '0');
      const page = opts.missing
        ? { missing: true }
        : {
            title: 'File:X.jpg',
            imageinfo: [{
              thumburl: `https://upload/thumb/${w}px-X.jpg`, thumbwidth: w, thumbheight: Math.round(w * 0.75),
              mime: 'image/jpeg', size: 5_000_000, descriptionurl: 'https://commons/File:X.jpg',
              extmetadata: {
                LicenseShortName: { value: opts.license ?? 'CC BY-SA 3.0' },
                Artist: { value: opts.artistHtml ?? '<a href="/x">Jane Doe</a>' },
              },
            }],
          };
      return { status: 200, headers: { get: () => null }, json: async () => ({ query: { pages: [page] } }), text: async () => '' };
    }
    // thumb download
    const w = Number(/(\d+)px-/.exec(url)?.[1] ?? '0');
    const body = bytesForWidth(w);
    return { status: 200, headers: { get: () => null }, arrayBuffer: async () => body.buffer, text: async () => '' };
  };

const client = (opts = {}) => new CommonsClient({ fetch: fakeFetch(opts) as never, clock: new FakeClock(0), contact: 'ops@arecipe.app' });

test('resolves to the largest rendition <=1MB, stepping down past an oversized one', async () => {
  const r = await client().resolve('X.jpg');
  assert.equal(r.skipped, undefined);
  assert.equal(r.width, 800, 'stepped down from 1024 (1.1MB) to 800 (0.9MB)');
  assert.ok(r.bytes && r.bytes.length <= 1_000_000);
  assert.equal(r.credit?.license, 'CC BY-SA 3.0');
  assert.equal(r.credit?.artist, 'Jane Doe', 'HTML stripped from Artist');
  assert.equal(r.credit?.source, 'https://commons/File:X.jpg');
});

test('skips a non-free image with a reason (no bytes)', async () => {
  const r = await client({ license: 'CC BY-NC 3.0' }).resolve('X.jpg');
  assert.equal(r.skipped, true);
  assert.match(r.reason ?? '', /commercial/i);
  assert.equal(r.bytes, undefined);
});

test('drops the "No machine-readable author" boilerplate from credit', async () => {
  const r = await client({ artistHtml: 'No machine-readable author provided. Dbenbenn assumed.' }).resolve('X.jpg');
  assert.equal(r.credit?.artist, undefined, 'boilerplate author omitted');
  assert.equal(r.credit?.license, 'CC BY-SA 3.0');
});

test('skips a missing file', async () => {
  const r = await client({ missing: true }).resolve('Nope.jpg');
  assert.equal(r.skipped, true);
});
