// EXP-IMPORT-EXTRACTION · Arm 1 (deterministic hardening). Three structured
// extractors that read an INERT Document directly (never the live DOM), for the
// pages that carry no usable JSON-LD Recipe but DO carry structured markup:
//
//   - schema.org MICRODATA — itemscope/itemtype + itemprop
//   - RDFa            — vocab/typeof + property
//   - h-recipe        — the microformats class vocabulary (v2 p-/e-, and v1)
//
// All three share one shape: find a recipe ROOT by an attribute/class predicate,
// then collect field elements DESCENDING from that root but NOT crossing into a
// nested item (so an embedded Review/Person can't leak its name/text into the
// recipe). Every extracted string runs through the same sanitize path
// (decode → tag-strip → clamp) the JSON-LD rung uses. Returns null when the
// format's root is absent — the ladder falls through to the next rung.

import { clamp, decodeText, domHtmlParse, LEXICON_MAX, type HtmlParse } from './sanitize.js';
import type { ImportedRecipe } from './recipe-jsonld.js';

/** Build an ImportedRecipe from already-collected raw field values, applying the
 *  shared decode/clamp/emptiness rules once. */
const assemble = (
  raw: {
    name?: string;
    description?: string;
    ingredients: string[];
    instructions: string[];
    recipeYield?: string;
    prepTime?: string;
    totalTime?: string;
  },
  parse: HtmlParse,
): ImportedRecipe | null => {
  const decode = (s: string): string => decodeText(s, parse);
  const clean = (s: string, max: number): string => clamp(decode(s), max);

  const ingredients = raw.ingredients
    .map((s) => clean(s, LEXICON_MAX.ingredient))
    .filter((s) => s !== '');
  const instructions = raw.instructions
    .map((s) => clean(s, LEXICON_MAX.instruction))
    .filter((s) => s !== '');

  const result: ImportedRecipe = { ingredients, instructions };
  if (raw.name !== undefined) {
    const n = clean(raw.name, LEXICON_MAX.name);
    if (n !== '') result.name = n;
  }
  if (raw.description !== undefined) {
    const t = clean(raw.description, LEXICON_MAX.text);
    if (t !== '') result.text = t;
  }
  if (raw.recipeYield !== undefined) {
    const y = clean(raw.recipeYield, LEXICON_MAX.name);
    if (y !== '') result.recipeYield = y;
  }
  // ISO-8601 durations are carried verbatim (mapped to minutes at draft handoff),
  // matching the JSON-LD rung; trim only.
  if (raw.prepTime !== undefined && raw.prepTime.trim() !== '') result.prepTime = raw.prepTime.trim();
  if (raw.totalTime !== undefined && raw.totalTime.trim() !== '') result.totalTime = raw.totalTime.trim();

  return result;
};

/** True if `el`'s nearest structured-item ancestor within `root` is `root`
 *  itself — i.e. `el` is a direct field of the recipe, not of a nested item.
 *  `isBoundary` marks an element that opens a new nested scope. */
const belongsToRoot = (
  el: Element,
  root: Element,
  isBoundary: (e: Element) => boolean,
): boolean => {
  let cur: Element | null = el.parentElement;
  while (cur !== null && cur !== root) {
    if (isBoundary(cur)) return false; // crossed into a nested item
    cur = cur.parentElement;
  }
  return cur === root;
};

/** Value of a field element: a duration `content`/`datetime` attr when present
 *  (for `<time>`), else its text. */
const fieldValue = (el: Element): string => {
  const content = el.getAttribute('content');
  if (content !== null && content.trim() !== '') return content;
  return el.textContent ?? '';
};

// ─── Microdata ──────────────────────────────────────────────────────────────

const isRecipeItemtype = (el: Element): boolean => {
  const t = el.getAttribute('itemtype') ?? '';
  return /schema\.org\/recipe\b/i.test(t);
};

export const extractRecipeFromMicrodata = (
  doc: Document,
  parse: HtmlParse = domHtmlParse,
): ImportedRecipe | null => {
  const root = Array.from(doc.querySelectorAll('[itemscope][itemtype]')).find(isRecipeItemtype);
  if (root === undefined) return null;

  const isBoundary = (e: Element): boolean => e.hasAttribute('itemscope');
  const propEls = (name: string): Element[] =>
    Array.from(root.querySelectorAll(`[itemprop~="${name}"]`)).filter((e) =>
      belongsToRoot(e, root, isBoundary),
    );
  const firstText = (name: string): string | undefined => {
    const el = propEls(name)[0];
    return el === undefined ? undefined : fieldValue(el);
  };

  const ingredients = propEls('recipeIngredient')
    .concat(propEls('ingredients')) // legacy itemprop
    .map((e) => e.textContent ?? '');
  const instructions = readMicrodataInstructions(root, isBoundary);

  return assemble(
    {
      name: firstText('name'),
      description: firstText('description'),
      ingredients,
      instructions,
      recipeYield: firstText('recipeYield'),
      prepTime: firstText('prepTime'),
      totalTime: firstText('totalTime'),
    },
    parse,
  );
};

/** recipeInstructions in microdata: multiple elements → one step each; a single
 *  element whose text carries newlines/markers → split it. */
const readMicrodataInstructions = (root: Element, isBoundary: (e: Element) => boolean): string[] => {
  const els = Array.from(root.querySelectorAll('[itemprop~="recipeInstructions"]')).filter((e) =>
    belongsToRoot(e, root, isBoundary),
  );
  if (els.length === 0) return [];
  if (els.length > 1) return els.map((e) => e.textContent ?? '');
  return splitBlockText(els[0] as Element);
};

// ─── RDFa ────────────────────────────────────────────────────────────────────

export const extractRecipeFromRdfa = (
  doc: Document,
  parse: HtmlParse = domHtmlParse,
): ImportedRecipe | null => {
  const root = Array.from(doc.querySelectorAll('[typeof]')).find((e) =>
    /(^|\s|:)recipe(\s|$)/i.test(e.getAttribute('typeof') ?? ''),
  );
  if (root === undefined) return null;

  const isBoundary = (e: Element): boolean => e !== root && e.hasAttribute('typeof');
  // `property` may be prefixed ("schema:recipeIngredient"); match on suffix.
  const propEls = (name: string): Element[] =>
    Array.from(root.querySelectorAll('[property]')).filter((e) => {
      const props = (e.getAttribute('property') ?? '').split(/\s+/);
      return (
        props.some((p) => p.replace(/^.*:/, '').toLowerCase() === name.toLowerCase()) &&
        belongsToRoot(e, root, isBoundary)
      );
    });
  const firstText = (name: string): string | undefined => {
    const el = propEls(name)[0];
    return el === undefined ? undefined : fieldValue(el);
  };

  const instrEls = propEls('recipeInstructions');
  const instructions =
    instrEls.length > 1
      ? instrEls.map((e) => e.textContent ?? '')
      : instrEls.length === 1
        ? splitBlockText(instrEls[0] as Element)
        : [];

  return assemble(
    {
      name: firstText('name'),
      description: firstText('description'),
      ingredients: propEls('recipeIngredient').map((e) => e.textContent ?? ''),
      instructions,
      recipeYield: firstText('recipeYield'),
      prepTime: firstText('prepTime'),
      totalTime: firstText('totalTime'),
    },
    parse,
  );
};

// ─── h-recipe microformat (v2 and legacy v1) ─────────────────────────────────

export const extractRecipeFromMicroformats = (
  doc: Document,
  parse: HtmlParse = domHtmlParse,
): ImportedRecipe | null => {
  const root =
    doc.querySelector('.h-recipe') ?? doc.querySelector('.hrecipe'); // v2 then v1
  if (root === null) return null;

  const isBoundary = (e: Element): boolean =>
    e.classList.contains('h-recipe') || e.classList.contains('hrecipe');
  const byClass = (...classes: string[]): Element[] =>
    classes
      .flatMap((c) => Array.from(root.querySelectorAll(`.${c}`)))
      .filter((e) => belongsToRoot(e, root, isBoundary));
  const firstText = (...classes: string[]): string | undefined => {
    const el = byClass(...classes)[0];
    return el === undefined ? undefined : fieldValue(el);
  };

  const instrEls = byClass('e-instructions', 'instructions');
  const instructions =
    instrEls.length > 1
      ? instrEls.map((e) => e.textContent ?? '')
      : instrEls.length === 1
        ? splitBlockText(instrEls[0] as Element)
        : [];

  return assemble(
    {
      name: firstText('p-name', 'fn'),
      description: firstText('p-summary', 'summary'),
      ingredients: byClass('p-ingredient', 'ingredient').map((e) => e.textContent ?? ''),
      instructions,
      recipeYield: firstText('p-yield', 'yield'),
      prepTime: firstText('dt-prepTime'),
      totalTime: firstText('dt-totalTime', 'dt-duration', 'duration'),
    },
    parse,
  );
};

/** Split a block element into steps: child block elements (<li>/<p>) each become
 *  a step; otherwise split the text on newlines. */
const splitBlockText = (el: Element): string[] => {
  const blocks = Array.from(el.querySelectorAll('li, p'));
  if (blocks.length > 0) return blocks.map((b) => b.textContent ?? '');
  const text = el.textContent ?? '';
  const lines = text.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  return lines.length > 0 ? lines : [text];
};

const useful = (r: ImportedRecipe | null): r is ImportedRecipe =>
  r !== null && (r.ingredients.length > 0 || r.instructions.length > 0);

/** Try the three DOM-structured formats in order (microdata → RDFa →
 *  microformats). The first that yields a useful recipe wins; else null. */
export const extractRecipeFromDom = (
  doc: Document,
  parse: HtmlParse = domHtmlParse,
): ImportedRecipe | null => {
  const micro = extractRecipeFromMicrodata(doc, parse);
  if (useful(micro)) return micro;
  const rdfa = extractRecipeFromRdfa(doc, parse);
  if (useful(rdfa)) return rdfa;
  const mf = extractRecipeFromMicroformats(doc, parse);
  if (useful(mf)) return mf;
  return micro ?? rdfa ?? mf ?? null;
};
