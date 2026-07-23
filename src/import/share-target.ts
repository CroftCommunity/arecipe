// Web Share Target interpretation (recipe-import fast-follow). The manifest
// registers arecipe as a GET share target on mine.html, so a share from the
// phone browser arrives as ?title=&text=&url=. This PURE function decides how to
// use them.
//
// Honest split (documented so the UX doesn't overpromise): a shared TEXT
// SELECTION or article body imports with NO network — the text heuristic reads
// it directly, sidestepping CORS. A bare page LINK only gives us the URL (and
// title); the page's content still can't be read cross-origin, so that path
// prefills the URL and falls back to paste like any other link.

export type ShareInput = { title?: string; text?: string; url?: string };

/** What the panel should do with a share: a provenance URL (possibly empty),
 *  when the share carried actual content, the text to run through the ladder,
 *  and the OS-provided page title (a high-accuracy name signal — a share gives us
 *  the real title even when it gives us no readable content). */
export type SharePlan = { url: string; pasteText?: string; title?: string };

/** Absolute http(s) URL → its href, else undefined (rejects javascript:, data:,
 *  relative, and garbage). */
const asHttpUrl = (value: string): string | undefined => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

export const interpretShare = ({ title, text, url }: ShareInput): SharePlan => {
  const t = (text ?? '').trim();
  const u = (url ?? '').trim();

  let effectiveUrl = asHttpUrl(u) ?? '';
  let pasteText: string | undefined;

  if (effectiveUrl === '' && asHttpUrl(t) !== undefined) {
    // The shared text is itself just a URL — use it as provenance, nothing to paste.
    effectiveUrl = asHttpUrl(t) as string;
  } else if (t !== '' && asHttpUrl(t) === undefined) {
    // The shared text is real content (a selection, an article body, a snippet).
    pasteText = t;
    if (effectiveUrl === '') {
      const match = /\bhttps?:\/\/\S+/i.exec(t); // pull a link out of a snippet for provenance
      if (match !== null) effectiveUrl = asHttpUrl(match[0]) ?? '';
    }
  }

  // The OS title is a name signal — but drop a blank one, or one that merely
  // repeats the URL (some browsers put the URL in the title slot).
  const cleanTitle = (title ?? '').trim();
  const usableTitle =
    cleanTitle !== '' && cleanTitle !== effectiveUrl && cleanTitle !== u ? cleanTitle : undefined;

  const plan: SharePlan = { url: effectiveUrl };
  if (pasteText !== undefined) plan.pasteText = pasteText;
  if (usableTitle !== undefined) plan.title = usableTitle;
  return plan;
};
