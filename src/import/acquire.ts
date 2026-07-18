// Layered acquisition + the parse ladder (import Phase 3, D1/D2). A static PWA
// with no backend cannot read most recipe sites cross-origin — they don't send
// CORS headers, and docs/GITHUB-CORS-PROBE.md rules out a proxy origin (it would
// conflict with docs/SECURITY.md). So acquisition is honest about the tradeoff:
//   1. try a direct fetch(url, { mode: 'cors' }) with a short timeout, then
//   2. on failure (the common, mobile reality) fall back to a paste flow.
// `no-cors` is deliberately never used — it yields an opaque, unreadable body.
//
// Whatever HTML/text we obtain runs the ladder: JSON-LD Recipe first, then the
// pasted-text heuristic. The source URL is retained as provenance in EVERY path.

import { extractRecipeFromJsonLd, type ImportedRecipe } from './recipe-jsonld.js';
import { parseRecipeText } from './recipe-text.js';
import { domHtmlParse, type HtmlParse } from './sanitize.js';

/** The minimal fetch surface we depend on — injectable for hermetic tests. */
export type FetchLike = (
  url: string,
  init: { mode: 'cors'; signal: AbortSignal },
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

export type AcquireDeps = {
  fetchFn?: FetchLike;
  parse?: HtmlParse;
  /** Abort the direct fetch after this many ms (a slow site shouldn't hang the
   *  panel — the paste fallback is one tap away). */
  timeoutMs?: number;
};

/** Which side (if any) came back empty — surfaced honestly in the panel and left
 *  blank in the draft rather than fabricated. */
export type MissingSide = 'none' | 'ingredients' | 'instructions';

export type AcquireResult =
  | { kind: 'imported'; recipe: ImportedRecipe; sourceUrl: string; missing: MissingSide }
  | { kind: 'no-recipe'; sourceUrl: string }
  | { kind: 'could-not-fetch'; sourceUrl: string };

/** Honest, user-facing copy for each outcome. The panel renders these verbatim. */
export const IMPORT_COPY = {
  couldNotFetch:
    "This site doesn’t allow direct reading from the browser — paste the page or the recipe text below instead.",
  noRecipe:
    "Couldn’t find a recipe on that page. Paste the page source or the visible recipe text to try again.",
  partialIngredients:
    'Imported the instructions, but couldn’t find ingredients — add them in the editor.',
  partialInstructions:
    'Imported the ingredients, but couldn’t find instructions — add them in the editor.',
} as const;

const DEFAULT_TIMEOUT_MS = 8000;

const useful = (r: ImportedRecipe | null): r is ImportedRecipe =>
  r !== null && (r.ingredients.length > 0 || r.instructions.length > 0);

/** Run the parse ladder over a blob of HTML or visible text. */
const runLadder = (source: string, parse: HtmlParse): ImportedRecipe | null => {
  const doc = parse(source);
  const viaJsonLd = extractRecipeFromJsonLd(doc, parse);
  if (useful(viaJsonLd)) return viaJsonLd;
  // No usable JSON-LD Recipe — try the visible text (pasted plain text, or the
  // stripped body of a fetched page).
  const visible = doc.body?.textContent ?? source;
  const viaText = parseRecipeText(visible, parse);
  if (useful(viaText)) return viaText;
  return viaJsonLd ?? null; // name-only at best → classified as no-recipe below
};

const classify = (recipe: ImportedRecipe | null, sourceUrl: string): AcquireResult => {
  if (recipe === null) return { kind: 'no-recipe', sourceUrl };
  const hasIngredients = recipe.ingredients.length > 0;
  const hasInstructions = recipe.instructions.length > 0;
  if (!hasIngredients && !hasInstructions) return { kind: 'no-recipe', sourceUrl };
  const missing: MissingSide = !hasIngredients ? 'ingredients' : !hasInstructions ? 'instructions' : 'none';
  return { kind: 'imported', recipe, sourceUrl, missing };
};

/** Attempt the direct fetch, then the ladder. Any fetch failure (CORS, network,
 *  timeout, non-ok status) resolves to `could-not-fetch` so the caller can
 *  expand the paste flow. */
export const acquireFromUrl = async (url: string, deps: AcquireDeps = {}): Promise<AcquireResult> => {
  const fetchFn: FetchLike = deps.fetchFn ?? ((u, init) => fetch(u, init));
  const parse = deps.parse ?? domHtmlParse;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const res = await fetchFn(url, { mode: 'cors', signal: controller.signal });
    if (!res.ok) return { kind: 'could-not-fetch', sourceUrl: url };
    html = await res.text();
  } catch {
    return { kind: 'could-not-fetch', sourceUrl: url };
  } finally {
    clearTimeout(timer);
  }
  return classify(runLadder(html, parse), url);
};

/** Run the ladder over pasted content (page source OR visible recipe text). No
 *  network — the paste flow exists precisely because the fetch couldn't run. */
export const acquireFromPaste = (
  pasted: string,
  sourceUrl: string,
  deps: Pick<AcquireDeps, 'parse'> = {},
): AcquireResult => {
  const parse = deps.parse ?? domHtmlParse;
  return classify(runLadder(pasted, parse), sourceUrl);
};
