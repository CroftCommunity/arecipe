// @vitest-environment happy-dom
// "Get the Android app" (plan 2026-07-18-1 D7): a small Account-page card
// linking the sideloadable APK from the latest GitHub Release via the
// STABLE latest-release download URL — one URL forever, resolved by GitHub
// to whatever release is newest, so the site never needs a deploy when a
// new shell ships. Rendered for everyone (the page can't know the visitor's
// OS reliably), phrased for Android.
import { describe, expect, it } from 'vitest';
import { ANDROID_APK_URL, renderAndroidAppSection } from '../../../src/account/android-app.js';

describe('ANDROID_APK_URL', () => {
  it('is the stable latest-release asset URL (survives every new release unchanged)', () => {
    expect(ANDROID_APK_URL).toBe(
      'https://github.com/CroftCommunity/arecipe/releases/latest/download/arecipe.apk',
    );
  });
});

describe('renderAndroidAppSection', () => {
  it('renders a settings-section card with the android-app-link pointing at the stable URL', () => {
    const section = renderAndroidAppSection();
    expect(section.classList.contains('settings-section')).toBe(true);
    const link = section.querySelector<HTMLAnchorElement>('[data-testid="android-app-link"]');
    expect(link).not.toBeNull();
    expect(link!.tagName.toLowerCase()).toBe('a');
    expect(link!.href).toBe(ANDROID_APK_URL);
  });

  it('says what it is: a heading plus copy phrased for Android', () => {
    const section = renderAndroidAppSection();
    expect(section.querySelector('.section-title')?.textContent).toBe('Apps');
    const link = section.querySelector('[data-testid="android-app-link"]')!;
    expect(link.textContent).toContain('Android');
  });

  it('returns a fresh node each call (no shared singleton to accidentally re-parent)', () => {
    expect(renderAndroidAppSection()).not.toBe(renderAndroidAppSection());
  });
});
