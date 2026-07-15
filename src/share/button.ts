// The Share affordance (share affordances run): one small, reusable control for
// the recipe detail and the cookbook cold-view. Mirrors the quick-copy idiom in
// src/recipes/view.ts — the payload rides a `data-copy` attribute so the copy
// target is inspectable/testable without the async Clipboard API, and a
// successful copy flashes a transient confirmation by swapping the button's own
// text (the same mechanism the quick-copy control uses).
//
// Behavior: if the platform exposes `navigator.share`, hand off to the native
// share sheet (title + url); otherwise fall back to copying the URL to the
// clipboard. The fallback is feature-detected on `typeof navigator.share` so the
// hermetic e2e (where no share sheet exists) exercises the clipboard path
// deterministically. Clipboard denial is silent — the label just stays put.
//
// Kept dependency-free (DOM + navigator only): this module is imported by
// recipe.html's entry, which must not pull @atproto/api into its bundle.

/** Base URL for a share link: the live origin + the current page's directory,
 * with no trailing slash. The bare origin for the root deploy; origin + subpath
 * for a preview deploy (…/pr-preview/pr-N). recipe.html and cookbook.html sit at
 * the same directory level, so both share this base. Reads `window` — kept out
 * of the pure src/share/urls.ts builders, which take the origin as an argument. */
export const shareOrigin = (): string => {
  const url = new URL(window.location.href);
  const dir = url.pathname.replace(/[^/]*$/, ''); // drop the filename, keep the dir
  return `${url.origin}${dir}`.replace(/\/$/, '');
};

export type ShareButtonOptions = {
  /** The canonical URL to share/copy (also mirrored onto `data-copy`). */
  url: string;
  /** Title handed to the native share sheet (recipe/cookbook name). */
  title: string;
  /** Visible + resting button label, e.g. "Share". */
  label: string;
  /** Accessible name — more specific than the label, e.g. "Share this recipe". */
  ariaLabel: string;
  /** `data-testid` for the button. */
  testid: string;
};

const CONFIRM_TEXT = 'Copied';
const CONFIRM_MS = 1200;

export const renderShareButton = (opts: ShareButtonOptions): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'button share-btn';
  btn.textContent = opts.label;
  btn.dataset['testid'] = opts.testid;
  btn.dataset['copy'] = opts.url;
  btn.setAttribute('aria-label', opts.ariaLabel);
  btn.title = opts.ariaLabel;

  const flashCopied = (): void => {
    btn.textContent = CONFIRM_TEXT;
    window.setTimeout(() => (btn.textContent = opts.label), CONFIRM_MS);
  };

  btn.addEventListener('click', () => {
    const url = btn.dataset['copy'] ?? opts.url;
    // Native share sheet when available (mobile) — feature-detected so the
    // hermetic e2e falls through to the deterministic clipboard path.
    if (typeof navigator.share === 'function') {
      void navigator.share({ title: opts.title, url }).catch(() => {
        /* user dismissed or share unsupported for this payload — no-op */
      });
      return;
    }
    const done = navigator.clipboard?.writeText(url);
    if (done === undefined) return; // no Clipboard API — nothing to flash
    void done.then(flashCopied, () => {
      /* clipboard denied — leave the label as-is */
    });
  });

  return btn;
};
