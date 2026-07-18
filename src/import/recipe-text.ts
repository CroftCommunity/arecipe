// Pasted-visible-text heuristic (import Phase 2, D4). The ladder's second rung:
// used when a page carries no JSON-LD Recipe, or when the cook pastes the recipe
// text straight in. PURE. It is deliberately conservative — a confidence gate
// (ingredients need a run of ≥3 quantity/bullet-led lines) keeps it from
// inventing a recipe out of prose, and an empty bucket is left empty (flagged
// downstream) rather than fabricated.

import { clean, LEXICON_MAX, type HtmlParse, domHtmlParse } from './sanitize.js';
import type { ImportedRecipe } from './recipe-jsonld.js';

/** Section headings that introduce the steps. Case-insensitive, trailing ':'
 *  tolerated. `ingredients` is recognized too, only so it is never mistaken for
 *  the recipe name. */
const INSTRUCTION_HEADINGS = ['instructions', 'method', 'directions', 'steps', 'preparation'];
const ALL_HEADINGS = ['ingredients', ...INSTRUCTION_HEADINGS];

const headingKey = (line: string): string => line.trim().replace(/:$/, '').toLowerCase();
const isHeading = (line: string): boolean => ALL_HEADINGS.includes(headingKey(line));
const isInstructionHeading = (line: string): boolean =>
  INSTRUCTION_HEADINGS.includes(headingKey(line));

/** A numbered step line: "1. …" or "2) …". */
const NUMBERED = /^\s*\d{1,3}[.)]\s+(\S.*)$/;
const isNumbered = (line: string): boolean => NUMBERED.test(line);

/** A leading bullet marker to strip from ingredient lines. */
const BULLET = /^[-*•·‣–]\s+/;
/** Looks like an ingredient: a bullet, or a leading quantity (digit or a
 *  unicode fraction). Numbered step lines ("1. …") are explicitly excluded so a
 *  numbered method isn't mistaken for an ingredient run. */
const QUANTITY = /^(?:[-*•·‣–]\s+|\d|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;
const looksLikeIngredient = (line: string): boolean =>
  line.trim() !== '' && !isNumbered(line) && QUANTITY.test(line.trim());

/** The longest run of ≥3 consecutive ingredient-like lines (blank or
 *  non-ingredient lines break a run). Bullets are stripped; [] if no run qualifies. */
const findIngredientRun = (lines: string[]): string[] => {
  let best: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > best.length) best = run;
    run = [];
  };
  for (const line of lines) {
    if (looksLikeIngredient(line)) run.push(line.trim().replace(BULLET, ''));
    else flush();
  }
  flush();
  return best.length >= 3 ? best : [];
};

/** Steps: numbered lines first (their numbers stripped); else the paragraphs
 *  following the first instruction heading, up to the next heading. */
const findInstructions = (lines: string[]): string[] => {
  const numbered = lines
    .map((l) => NUMBERED.exec(l)?.[1])
    .filter((s): s is string => s !== undefined);
  if (numbered.length > 0) return numbered;

  const start = lines.findIndex(isInstructionHeading);
  if (start === -1) return [];
  const steps: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    if (isHeading(line)) break; // next section
    if (looksLikeIngredient(line)) continue; // a stray ingredient — not a step
    steps.push(line.trim());
  }
  return steps;
};

/** The recipe name: the first non-blank line that is not an ingredient, a
 *  numbered step, or a heading — and short enough to be a title (not a
 *  paragraph of prose). */
const findName = (lines: string[]): string | undefined => {
  for (const line of lines) {
    const t = line.trim();
    if (t === '') continue;
    if (looksLikeIngredient(t) || isNumbered(t) || isHeading(t)) return undefined;
    return t.length <= 120 ? t : undefined;
  }
  return undefined;
};

export const parseRecipeText = (text: string, parse: HtmlParse = domHtmlParse): ImportedRecipe => {
  const lines = text.split('\n');
  const clamp1 = (s: string, max: number): string => clean(s, max, parse);

  const ingredients = findIngredientRun(lines)
    .map((s) => clamp1(s, LEXICON_MAX.ingredient))
    .filter((s) => s !== '');
  const instructions = findInstructions(lines)
    .map((s) => clamp1(s, LEXICON_MAX.instruction))
    .filter((s) => s !== '');

  const result: ImportedRecipe = { ingredients, instructions };
  const nameRaw = findName(lines);
  if (nameRaw !== undefined) {
    const name = clamp1(nameRaw, LEXICON_MAX.name);
    if (name !== '') result.name = name;
  }
  return result;
};
