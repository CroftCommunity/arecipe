// "Get the Android app" (plan 2026-07-18-1 D7): the sideloadable TWA shell
// from GitHub Releases. The stable /releases/latest/download/ URL always
// resolves to the newest android-v* release, so this link never changes
// when a new shell ships — and the app's CONTENT is the live site, so it
// stays current with no new APK at all.

export const ANDROID_APK_URL =
  'https://github.com/CroftCommunity/arecipe/releases/latest/download/arecipe.apk';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The Apps card for the Account page — rendered for everyone (signed in or
 *  out; the page can't reliably know the visitor's OS), phrased for Android. */
export const renderAndroidAppSection = (): HTMLElement => {
  const section = el('section', 'settings-section android-app');
  section.append(el('h3', 'section-title', 'Apps'));

  const link = el('a', 'friend-link', 'Get the Android app (APK)') as HTMLAnchorElement;
  link.href = ANDROID_APK_URL;
  link.dataset['testid'] = 'android-app-link';

  const line = el('p', 'status');
  line.append(link);
  section.append(
    line,
    el(
      'p',
      'status',
      'arecipe as a full-screen Android app — the live site in Chrome, so it updates itself. Download on your phone and open the file to install (Android will ask you to allow the install).',
    ),
  );
  return section;
};
