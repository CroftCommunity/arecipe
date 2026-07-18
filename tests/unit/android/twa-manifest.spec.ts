// The committed Bubblewrap project config (plan 2026-07-18-1 D1/D3): the
// Android project is GENERATED from this file in CI (pinned CLI, tree not
// committed), so this shape test is what pins the app's identity — package
// id, host, launcher name, display — against accidental drift. Colors are
// pinned to the web manifest so the shell and the PWA never disagree.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type TwaManifest = {
  packageId: string;
  host: string;
  name: string;
  launcherName: string;
  display: string;
  orientation: string;
  startUrl: string;
  iconUrl: string;
  maskableIconUrl: string;
  themeColor: string;
  backgroundColor: string;
  navigationColor: string;
  fallbackType: string;
  enableNotifications: boolean;
  appVersionCode: number;
  appVersion: string;
  signingKey: { path: string; alias: string };
  webManifestUrl: string;
};

const twa = JSON.parse(readFileSync('twa-manifest.json', 'utf8')) as TwaManifest;
const web = JSON.parse(readFileSync('manifest.webmanifest', 'utf8')) as {
  theme_color: string;
  background_color: string;
  display: string;
};

describe('twa-manifest.json', () => {
  it('locks identity: package id, host, launcher name (D1)', () => {
    expect(twa.packageId).toBe('app.arecipe.twa');
    expect(twa.host).toBe('arecipe.app');
    expect(twa.name).toBe('arecipe');
    expect(twa.launcherName).toBe('arecipe');
  });

  it('matches the web manifest: display, colors', () => {
    expect(twa.display).toBe(web.display); // standalone
    expect(twa.orientation).toBe('default');
    expect(twa.themeColor).toBe(web.theme_color);
    expect(twa.backgroundColor).toBe(web.background_color);
  });

  it('points icons + web manifest at the live origin (Bubblewrap fetches at generate time)', () => {
    expect(twa.iconUrl).toBe('https://arecipe.app/assets/icons/icon-512.png');
    expect(twa.maskableIconUrl).toBe('https://arecipe.app/assets/icons/maskable-512.png');
    expect(twa.webManifestUrl).toBe('https://arecipe.app/manifest.webmanifest');
    expect(twa.startUrl).toBe('/');
  });

  it('falls back to Custom Tabs where TWA is unavailable, no push plumbing', () => {
    expect(twa.fallbackType).toBe('customtabs');
    expect(twa.enableNotifications).toBe(false);
  });

  it('carries stamp-at-build version placeholders and the CI signing-key slot (D4/D5)', () => {
    // Real values are injected by scripts/android-build.sh at build time from
    // scripts/version.mjs — the committed placeholders just keep the shape
    // valid. (Bubblewrap's on-disk field for versionName is `appVersion` —
    // verified against @bubblewrap/core@1.24.1 TwaManifestJson.)
    expect(typeof twa.appVersionCode).toBe('number');
    expect(typeof twa.appVersion).toBe('string');
    // The workflow decodes the keystore secret to this path; never committed.
    expect(twa.signingKey.path).toBe('./android.keystore');
    expect(twa.signingKey.alias).toBe('arecipe');
  });
});
