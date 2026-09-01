// D1 build gate: the snapshot must actually land in dist/ (the whole feature is
// dead if it doesn't deploy — assets/ is an allowlist copy, and the versioned
// snapshot path has to be emitted + precached), and index.json must stay under
// the declared gzipped ceiling (a hard CI gate, else the file grows until it
// defeats its own purpose). We drive the REAL build.mjs so this can't drift from
// the shipped pipeline.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const STAGING = `${root}.snapshot-staging`;
const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';

const build = (env: Record<string, string> = {}): { code: number; stderr: string } => {
  try {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
    return { code: 0, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? 1, stderr: err.stderr ?? '' };
  }
};

/** A small, valid staging tree (one cook, two records). */
const writeStaging = (): void => {
  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(`${STAGING}/cooks`, { recursive: true });
  const shard = {
    did: DID,
    handle: 'seed.example.com',
    rev: 'rev-1',
    cid: 'commit-rev-1',
    part: 0,
    records: [
      { uri: `at://${DID}/exchange.recipe.recipe/a`, cid: 'bafa', value: { name: 'Apple' } },
      { uri: `at://${DID}/exchange.recipe.recipe/b`, cid: 'bafb', value: { name: 'Bread' } },
    ],
  };
  writeFileSync(`${STAGING}/cooks/${DID}.json`, JSON.stringify(shard));
  writeFileSync(
    `${STAGING}/manifest.json`,
    JSON.stringify({
      capturedAt: '2026-07-23T00:00:00Z',
      cooks: [
        {
          did: DID,
          handle: 'seed.example.com',
          displayName: 'seed.example.com',
          rev: 'rev-1',
          cid: 'commit-rev-1',
          recordCount: 2,
          sha256: 'deadbeef',
          capturedAt: '2026-07-23T00:00:00Z',
          shards: [{ file: `cooks/${DID}.json`, sha256: 'deadbeef', recordCount: 2 }],
        },
      ],
      omitted: [],
    }),
  );
  writeFileSync(
    `${STAGING}/index.json`,
    JSON.stringify({
      cooks: [
        {
          did: DID,
          handle: 'seed.example.com',
          displayName: 'seed.example.com',
          recipes: [
            { rkey: 'a', title: 'Apple' },
            { rkey: 'b', title: 'Bread' },
          ],
        },
      ],
    }),
  );
};

const version = (): string =>
  (JSON.parse(readFileSync(`${root}dist/build-info.json`, 'utf8')) as { version: string }).version;

describe('build snapshot emission', () => {
  // Leave dist/ clean (these tests build with fixture staging / a forced-fail
  // ceiling). The gate rebuilds before e2e anyway, but this avoids a confusing
  // stale dist for anyone running suites out of order.
  afterAll(() => {
    rmSync(STAGING, { recursive: true, force: true });
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'ignore' });
  });

  it('emits the snapshot from staging into dist/assets/snapshot/<buildId>/', () => {
    writeStaging();
    const { code, stderr } = build();
    expect(code, stderr).toBe(0);
    const dir = `${root}dist/assets/snapshot/${version()}`;
    expect(existsSync(`${dir}/index.json`)).toBe(true);
    expect(existsSync(`${dir}/manifest.json`)).toBe(true);
    expect(existsSync(`${dir}/cooks/${DID}.json`)).toBe(true);
    const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as { buildId: string; cooks: unknown[] };
    expect(index.buildId).toBe(version());
    expect(index.cooks).toHaveLength(1);
  });

  it('emits a valid empty skeleton when no staging exists (build never breaks)', () => {
    rmSync(STAGING, { recursive: true, force: true });
    const { code, stderr } = build();
    expect(code, stderr).toBe(0);
    const dir = `${root}dist/assets/snapshot/${version()}`;
    const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as { buildId: string; cooks: unknown[] };
    expect(index.buildId).toBe(version());
    expect(index.cooks).toEqual([]);
  });

  it('fails the build when gzipped index.json exceeds the ceiling', () => {
    writeStaging();
    const { code, stderr } = build({ SNAPSHOT_INDEX_GZIP_CEILING: '1' }); // 1 byte ceiling
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/index\.json|ceiling|size/i);
  });
});
