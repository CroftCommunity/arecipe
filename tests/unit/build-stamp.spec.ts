// M1-checkpoint rider on the bundle decision: the build must be visible —
// version + size stamped at build time, shown in the footer, logged at
// startup. Behaviors:
// - formatBuildStamp renders "v<version> · <n> KB (<n> KB gz)"
// - sizes are rendered in KB with one decimal
import { describe, expect, it } from 'vitest';
import { formatBuildStamp } from '../../src/build-stamp.js';

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
});
