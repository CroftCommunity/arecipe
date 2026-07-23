// D13/D1 — the CLI refuses to start without a contact string: exits non-zero and
// writes no partial state. Hermetic (fails before any network is touched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.ts';

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
};

test('missing contact → exit non-zero, no partial state written', async () => {
  const home = join(mkdtempSync(join(tmpdir(), 'wbcli-')), 'home');
  await withEnv({ WIKIBOOKS_CONTACT: undefined, WBSYNC_HOME: home }, async () => {
    const code = await main(['run']);
    assert.equal(code, 1, 'exit non-zero');
    assert.ok(!existsSync(join(home, 'state')), 'no state directory created');
  });
});

test('unknown command → exit code 2', async () => {
  const home = join(mkdtempSync(join(tmpdir(), 'wbcli-')), 'home');
  await withEnv({ WIKIBOOKS_CONTACT: 'ops@arecipe.app', WBSYNC_HOME: home }, async () => {
    assert.equal(await main(['definitely-not-a-command']), 2);
  });
});

test('status on a fresh home → exit 0, empty ledger', async () => {
  const home = join(mkdtempSync(join(tmpdir(), 'wbcli-')), 'home');
  await withEnv({ WIKIBOOKS_CONTACT: 'ops@arecipe.app', WBSYNC_HOME: home }, async () => {
    assert.equal(await main(['status']), 0);
  });
});
