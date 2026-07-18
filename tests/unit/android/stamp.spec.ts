// Version stamping into the Bubblewrap config (plan 2026-07-18-1 D4): the
// committed twa-manifest.json carries placeholders; scripts/android-build.sh
// writes a STAMPED COPY into its scratch build dir via
// scripts/stamp-twa-version.mjs, whose pure core is stampTwaVersions. The
// committed file is never rewritten — versions are derived, not hand-edited.
import { describe, expect, it } from 'vitest';
import { stampTwaVersions } from '../../../scripts/version.mjs';

const base = {
  packageId: 'app.arecipe.twa',
  host: 'arecipe.app',
  appVersionCode: 1,
  appVersion: '0.0.0-unstamped',
  signingKey: { path: './android.keystore', alias: 'arecipe' },
};

describe('stampTwaVersions', () => {
  it('sets appVersionCode and appVersion (Bubblewrap’s on-disk versionName field)', () => {
    const stamped = stampTwaVersions(base, 412, '2026.07.18-37026bc');
    expect(stamped.appVersionCode).toBe(412);
    expect(stamped.appVersion).toBe('2026.07.18-37026bc');
  });

  it('preserves every other field and does not mutate its input', () => {
    const stamped = stampTwaVersions(base, 412, '2026.07.18-37026bc');
    expect(stamped.packageId).toBe('app.arecipe.twa');
    expect(stamped.signingKey).toEqual({ path: './android.keystore', alias: 'arecipe' });
    expect(base.appVersionCode).toBe(1);
    expect(base.appVersion).toBe('0.0.0-unstamped');
  });
});
