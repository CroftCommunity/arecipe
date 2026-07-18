// Recipe-import string safety (import Phase 1). Every string that comes off a
// fetched or pasted page is UNTRUSTED. It is parsed ONLY via DOMParser into an
// inert document (never assigned into the live DOM), then decoded, tag-stripped,
// and clamped to the recipe lexicon's field maxima before it can reach a draft.
//
// The lexicon maxima mirror exchange.recipe.recipe (see
// tests/fixtures/lexicons/exchange.recipe.recipe.json): a paste can't smuggle a
// value past the record's declared limits.

/** exchange.recipe.recipe field maxima. */
export const LEXICON_MAX = {
  name: 255,
  text: 3000,
  ingredient: 500,
  instruction: 1000,
} as const;

/** Parse an HTML string into an INERT document. Injectable so callers (and
 *  tests) can supply a DOMParser; defaults to the global one in the browser. */
export type HtmlParse = (html: string) => Document;

export const domHtmlParse: HtmlParse = (html) =>
  new DOMParser().parseFromString(html, 'text/html');

/** Entity-decode + strip tags + collapse whitespace, via an inert parse. A
 *  string like "cheddar &amp; gruy&egrave;re" or "<span>2 tbsp</span> butter"
 *  becomes plain text; nothing executes and nothing touches the live DOM. */
export const decodeText = (raw: string, parse: HtmlParse = domHtmlParse): string => {
  if (raw === '') return '';
  const doc = parse(raw);
  const text = doc.body?.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
};

/** Clamp to a maximum length (grapheme-naive by design — the lexicon limits are
 *  code-unit counts). */
export const clamp = (value: string, max: number): string =>
  value.length <= max ? value : value.slice(0, max);

/** Decode + clamp in one step (the common case for a single field). */
export const clean = (raw: string, max: number, parse: HtmlParse = domHtmlParse): string =>
  clamp(decodeText(raw, parse), max);
