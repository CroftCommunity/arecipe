// JSON-LD (schema.org/Recipe) extraction (import Phase 1). PURE: it takes an
// INERT Document (produced by DOMParser, never assigned into the live DOM) and
// returns an ImportedRecipe or null. The mapping is near-identity because
// arecipe's lexicon already uses schema.org's field names.
//
// The parse ladder's first rung. It tolerates every shape seen in the wild:
// a plain Recipe object, a Recipe inside `@graph`, `@type` as string or array,
// recipeInstructions as one string / HowToStep[] / HowToSection[], and the
// legacy `ingredients` key. Unknown fields are ignored (open-world). Every
// string is decoded, tag-stripped, and clamped before it leaves this module.

import { clamp, decodeText, domHtmlParse, LEXICON_MAX, type HtmlParse } from './sanitize.js';

/** A recipe pulled off a page, close to schema.org's shape. `ingredients` and
 *  `instructions` are always arrays (possibly empty — the ladder's callers gate
 *  on emptiness rather than fabricating content). */
export type ImportedRecipe = {
  name?: string;
  text?: string;
  ingredients: string[];
  instructions: string[];
  recipeYield?: string;
  /** ISO-8601 durations, carried verbatim; mapped to minutes at draft handoff. */
  prepTime?: string;
  totalTime?: string;
};

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `@type` may be a string or an array of strings; match case-insensitively. */
const typeMatches = (node: Json, target: string): boolean => {
  const t = node['@type'];
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x) => typeof x === 'string' && x.toLowerCase() === target);
};

/** Find the first Recipe node across top-level objects, arrays, and `@graph`. */
const findRecipeNode = (parsed: unknown): Json | null => {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = findRecipeNode(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(parsed)) return null;
  if (typeMatches(parsed, 'recipe')) return parsed;
  const graph = parsed['@graph'];
  if (Array.isArray(graph)) return findRecipeNode(graph);
  return null;
};

const readIngredients = (node: Json): string[] => {
  // recipeIngredient is the schema.org name; `ingredients` is the legacy key.
  const raw = node['recipeIngredient'] ?? node['ingredients'];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string') return raw.split('\n').filter((s) => s.trim() !== '');
  return [];
};

/** Split a single instructions string into steps. Block-close tags become
 *  boundaries first (so `<p>…</p><p>…</p>` yields steps); then newlines; then,
 *  for a single blob, numbered markers ("1. " / "2) "). */
const splitInstructionString = (raw: string): string[] => {
  const withBreaks = raw
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const byLine = withBreaks.split('\n').filter((s) => s.trim() !== '');
  if (byLine.length > 1) return byLine;
  const single = byLine[0] ?? '';
  // Drop the number itself: "1. Do X. 2. Do Y." → ["Do X.", "Do Y."].
  const numbered = single
    .replace(/(?:^|\s)\d{1,2}[.)]\s+/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (numbered.length > 1) return numbered;
  return single.trim() === '' ? [] : [single];
};

const flattenInstructionArray = (items: unknown[]): string[] => {
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (!isObject(item)) continue;
    if (typeMatches(item, 'howtosection')) {
      const name = typeof item['name'] === 'string' ? item['name'].trim() : '';
      if (name !== '') out.push(`— ${name}`); // section name as its own line
      const sub = item['itemListElement'];
      if (Array.isArray(sub)) out.push(...flattenInstructionArray(sub));
      continue;
    }
    // HowToStep (or any node with text/name): prefer `text`, fall back to `name`.
    const text = item['text'] ?? item['name'];
    if (typeof text === 'string') out.push(text);
  }
  return out;
};

const readInstructions = (node: Json): string[] => {
  const raw = node['recipeInstructions'];
  if (typeof raw === 'string') return splitInstructionString(raw);
  if (Array.isArray(raw)) return flattenInstructionArray(raw);
  return [];
};

/** recipeYield may be a string, a number, or an array; normalize to a string. */
const readYield = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const first = v[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'number') return String(first);
  }
  return undefined;
};

const toImported = (node: Json, parse: HtmlParse): ImportedRecipe => {
  const decode = (raw: string): string => decodeText(raw, parse);
  const clean = (raw: string, max: number): string => clamp(decode(raw), max);

  const ingredients = readIngredients(node)
    .map((s) => clean(s, LEXICON_MAX.ingredient))
    .filter((s) => s !== '');
  const instructions = readInstructions(node)
    .map((s) => clean(s, LEXICON_MAX.instruction))
    .filter((s) => s !== '');

  const result: ImportedRecipe = { ingredients, instructions };

  if (typeof node['name'] === 'string') {
    const name = clean(node['name'], LEXICON_MAX.name);
    if (name !== '') result.name = name;
  }
  if (typeof node['description'] === 'string') {
    const text = clean(node['description'], LEXICON_MAX.text);
    if (text !== '') result.text = text;
  }
  const yieldRaw = readYield(node['recipeYield']);
  if (yieldRaw !== undefined) {
    const y = clean(yieldRaw, LEXICON_MAX.name);
    if (y !== '') result.recipeYield = y;
  }
  if (typeof node['prepTime'] === 'string') result.prepTime = node['prepTime'];
  if (typeof node['totalTime'] === 'string') result.totalTime = node['totalTime'];

  return result;
};

export const extractRecipeFromJsonLd = (
  doc: Document,
  parse: HtmlParse = domHtmlParse,
): ImportedRecipe | null => {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    const raw = script.textContent;
    if (raw === null || raw.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // malformed ld+json — skip, don't throw
    }
    const node = findRecipeNode(parsed);
    if (node !== null) return toImported(node, parse);
  }
  return null;
};
