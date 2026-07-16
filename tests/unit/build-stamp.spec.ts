// @vitest-environment happy-dom
// M1-checkpoint rider on the bundle decision: the build must be visible —
// version + size stamped at build time, shown in the footer, logged at
// startup. Behaviors:
// - formatBuildStamp renders "v<version> · <n> KB (<n> KB gz)"
// - sizes are rendered in KB with one decimal
// - signed releases D4: under a version pin the stamp shows the RUNNING
//   (locked) version, never network-live build-info
import { describe, expect, it } from 'vitest';
import { formatBuildStamp, mountBuildStamp } from '../../src/build-stamp.js';

describe('formatBuildStamp', () => {
  it('renders version and both sizes in KB', () => {
    expect(
      formatBuildStamp({
        version: '2026.07.07-abc1234',
        builtAt: '2026-07-07T18:00:00Z',
        mainBytes: 936960,
        mainGzipBytes: 178176,
      }),
    ).toBe('v2026.07.07-abc1234 · 915.0 KB (174.0 KB gz)');
  });

  it('rounds to one decimal', () => {
    expect(
      formatBuildStamp({
        version: 'x',
        builtAt: 'y',
        mainBytes: 2713,
        mainGzipBytes: 1331,
      }),
    ).toBe('vx · 2.6 KB (1.3 KB gz)');
  });

  it('under a version pin the stamp shows the locked version, not network build-info (D4)', async () => {
    const host = document.createElement('div');
    await mountBuildStamp(host, {
      lockedVersion: () => Promise.resolve('2026.07.10-lock1'),
      fetchFn: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              version: '2026.07.17-newer',
              builtAt: 't',
              mainBytes: 1,
              mainGzipBytes: 1,
            }),
          ),
        ),
    });
    const stamp = host.querySelector('[data-testid=build-stamp]');
    expect(stamp?.textContent).toContain('v2026.07.10-lock1');
    expect(stamp?.textContent).toMatch(/locked/i);
    expect(stamp?.textContent).not.toContain('2026.07.17-newer');
  });

  it('unpinned, the stamp keeps the network build-info format', async () => {
    const host = document.createElement('div');
    await mountBuildStamp(host, {
      lockedVersion: () => Promise.resolve(null),
      fetchFn: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              version: '2026.07.17-live1',
              builtAt: 't',
              mainBytes: 10_240,
              mainGzipBytes: 4_096,
            }),
          ),
        ),
    });
    const stamp = host.querySelector('[data-testid=build-stamp]');
    expect(stamp?.textContent).toBe('v2026.07.17-live1 · 10.0 KB (4.0 KB gz)');
  });
});
