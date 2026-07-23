// D15 Phase 8B — image manifest stage. For each page with an infobox image,
// resolve via Commons, cache the rendition bytes locally, and record a manifest
// entry (resolved w/ credit, or skipped w/ reason). Idempotent + resumable:
// a second run skips already-processed pages. Tested with a fake resolver + a
// tmp dir (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stageImages, type ImageTarget } from '../src/images/stage.ts';
import type { Resolution } from '../src/images/commons-client.ts';

const fakeCommons = (map: Record<string, Resolution>) => ({
  calls: [] as string[],
  async resolve(filename: string): Promise<Resolution> {
    this.calls.push(filename);
    return map[filename] ?? { skipped: true, reason: 'unmapped in fake' };
  },
});

const resolved = (bytes: number): Resolution => ({
  bytes: new Uint8Array(bytes), mime: 'image/jpeg', width: 800, height: 600,
  credit: { license: 'CC BY-SA 3.0', artist: 'Jane', source: 'https://commons/File:X.jpg' },
});

const targets: ImageTarget[] = [
  { pageid: 1, filename: 'Good.jpg', alt: 'Good Dish' },
  { pageid: 2, filename: 'Bad.jpg', alt: 'Bad Dish' },
];

test('resolves + caches bytes, records skips, writes a manifest', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbimg-'));
  try {
    const commons = fakeCommons({ 'Good.jpg': resolved(1000), 'Bad.jpg': { skipped: true, reason: 'non-commercial: CC BY-NC' } });
    const out = await stageImages({ commons, imagesDir: dir }, targets);
    assert.equal(out.resolved, 1);
    assert.equal(out.skipped, 1);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, { status: string; file?: string; reason?: string; credit?: { license: string }; alt?: string }>;
    assert.equal(manifest['1']!.status, 'resolved');
    assert.equal(manifest['1']!.credit?.license, 'CC BY-SA 3.0');
    assert.equal(manifest['1']!.alt, 'Good Dish');
    assert.ok(existsSync(join(dir, manifest['1']!.file!)), 'rendition bytes cached to disk');
    assert.equal(manifest['2']!.status, 'skipped');
    assert.match(manifest['2']!.reason ?? '', /commercial/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idempotent/resumable: a second run re-processes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbimg-'));
  try {
    const commons = fakeCommons({ 'Good.jpg': resolved(1000), 'Bad.jpg': { skipped: true, reason: 'x' } });
    await stageImages({ commons, imagesDir: dir }, targets);
    const before = commons.calls.length;
    const out2 = await stageImages({ commons, imagesDir: dir }, targets);
    assert.equal(commons.calls.length, before, 'no new Commons calls on resume');
    assert.equal(out2.alreadyDone, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
