// Version derivation (plan 2026-07-18-1 D4) — ONE implementation, two
// consumers: scripts/build.mjs (the web display version baked into the SW +
// build-info.json) and the Android TWA build (versionName; versionCode from
// the monotonic `git rev-list --count HEAD`). Pure functions over injected
// inputs so both consumers stamp identical strings, never hand-edited.
import { describe, expect, it } from 'vitest';
import { displayVersion, versionCodeFrom } from '../../../scripts/version.mjs';

describe('displayVersion', () => {
  it('renders the date-sha display version exactly as the web build always has', () => {
    expect(displayVersion(new Date('2026-07-18T03:00:00Z'), '37026bc')).toBe(
      '2026.07.18-37026bc',
    );
  });

  it('uses the UTC date (no local-timezone drift between CI runners)', () => {
    // 23:30Z stays the same UTC day even where local time has rolled over.
    expect(displayVersion(new Date('2026-12-31T23:30:00Z'), 'abc1234')).toBe(
      '2026.12.31-abc1234',
    );
  });
});

describe('versionCodeFrom', () => {
  it('parses `git rev-list --count HEAD` output (trailing newline included)', () => {
    expect(versionCodeFrom('412\n')).toBe(412);
  });

  it('rejects non-numeric output loudly (a broken git call must not ship versionCode NaN)', () => {
    expect(() => versionCodeFrom('fatal: not a git repository')).toThrow();
    expect(() => versionCodeFrom('')).toThrow();
  });

  it('rejects zero and values beyond the Play/Android versionCode ceiling (2100000000)', () => {
    expect(() => versionCodeFrom('0')).toThrow();
    expect(() => versionCodeFrom('2100000001')).toThrow();
    expect(versionCodeFrom('2100000000')).toBe(2100000000);
  });
});
