// EXP-IMPORT-EXTRACTION · Arm 2 (constrained model extraction on the residual).
//
// A DESKTOP-ONLY assist, by construction: it targets Chrome's built-in Prompt
// API (Gemini Nano), which Chrome's own docs say is unsupported on Android and
// iOS. It runs ONLY on the rows the deterministic ladder failed, and it never
// overwrites a field the parser already found — deterministic always wins, the
// model fills gaps.
//
// The model SELECTS spans; it never writes prose. That is enforced by the
// verbatim gate (src/import/verbatim.ts): an extraction containing any string
// not present verbatim in the source is rejected WHOLESALE. This is a provenance
// requirement, not a quality knob — the agents-page posture (agents.md) is to
// cite sources and make no claims over them; a model that rewrites instruction
// text has manufactured a derivative work. So this module's output is only ever
// a set of source spans, gated, handed to the editor as a draft like any other
// import — a human confirms before anything is written to a record.
//
// This file is the code + safety wiring. The LIVE metrics (rejection rate,
// availability, latency, hardware satisfaction) require the real API on real
// hardware and are deferred to a field run; see docs/EXP-IMPORT-EXTRACTION.md.

import type { ImportedRecipe } from './recipe-jsonld.js';
import { clamp, decodeText, domHtmlParse, LEXICON_MAX, type HtmlParse } from './sanitize.js';
import { validateVerbatim } from './verbatim.js';

/** The minimal Prompt-API surface we depend on — injectable for tests. Chrome's
 *  real session is created via `LanguageModel.create(...)`; we only need
 *  `prompt(input, { responseConstraint })`. */
export type ModelSession = {
  prompt: (input: string, opts?: { responseConstraint?: unknown }) => Promise<string>;
};

/** Availability states Chrome's `LanguageModel.availability()` can report. */
export type ModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/** Response constraint pinning model output to the recipe field shape. Passed to
 *  `prompt(..., { responseConstraint })` so the model must emit spans in these
 *  fields — it cannot free-form. ingredients/instructions are arrays of source
 *  spans; name/recipeYield are optional single spans. */
export const RECIPE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    recipeYield: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    instructions: { type: 'array', items: { type: 'string' } },
  },
  required: ['ingredients', 'instructions'],
} as const;

/** The extraction instruction. Emphasises SELECT-not-compose so the verbatim gate
 *  passes as often as possible — but the gate, not the prompt, is the guarantee. */
export const buildExtractionPrompt = (sourceText: string): string =>
  [
    'You are extracting a recipe from the text below.',
    'Copy ingredient and instruction lines VERBATIM from the text — do not paraphrase,',
    'summarize, reword, translate, or invent. Every string you output must appear',
    'character-for-character in the source (whitespace aside). If a field is not',
    'present, leave it empty. Do not add steps that are not written in the source.',
    '',
    '--- SOURCE ---',
    sourceText,
    '--- END SOURCE ---',
  ].join('\n');

export type ModelExtractResult =
  | { kind: 'extracted'; recipe: ImportedRecipe }
  | { kind: 'rejected'; violations: string[] }
  | { kind: 'empty' }
  | { kind: 'malformed' };

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Run the model over source text and gate the result. Never throws: a bad model
 *  reply is `malformed`, an all-empty reply is `empty`, a reply with any
 *  non-verbatim span is `rejected` (wholesale), only an all-verbatim, non-empty
 *  reply is `extracted`. */
export const extractWithModel = async (
  sourceText: string,
  session: ModelSession,
  parse: HtmlParse = domHtmlParse,
): Promise<ModelExtractResult> => {
  let raw: string;
  try {
    raw = await session.prompt(buildExtractionPrompt(sourceText), {
      responseConstraint: RECIPE_RESPONSE_SCHEMA,
    });
  } catch {
    return { kind: 'malformed' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'malformed' };
  const obj = parsed as Record<string, unknown>;

  const ingredients = asStringArray(obj['ingredients']);
  const instructions = asStringArray(obj['instructions']);
  if (ingredients.length === 0 && instructions.length === 0) return { kind: 'empty' };

  // THE GATE. Any non-verbatim span ⇒ discard the entire extraction.
  const gate = validateVerbatim(ingredients, instructions, sourceText);
  if (!gate.ok) return { kind: 'rejected', violations: gate.violations };

  // Passed the gate — clamp/decode to the lexicon like every other rung.
  const clean = (s: string, max: number): string => clamp(decodeText(s, parse), max);
  const recipe: ImportedRecipe = {
    ingredients: ingredients.map((s) => clean(s, LEXICON_MAX.ingredient)).filter((s) => s !== ''),
    instructions: instructions.map((s) => clean(s, LEXICON_MAX.instruction)).filter((s) => s !== ''),
  };
  const name = typeof obj['name'] === 'string' ? clean(obj['name'], LEXICON_MAX.name) : '';
  if (name !== '') recipe.name = name;
  const y = typeof obj['recipeYield'] === 'string' ? clean(obj['recipeYield'], LEXICON_MAX.name) : '';
  if (y !== '') recipe.recipeYield = y;

  return { kind: 'extracted', recipe };
};

const isEmpty = (v: string | undefined): boolean => v === undefined || v.trim() === '';

/** Deterministic-first merge: the parser's result is authoritative. The model
 *  fills ONLY fields the parser left empty; it never overwrites a found field. */
export const mergeDeterministicFirst = (
  deterministic: ImportedRecipe,
  model: ImportedRecipe,
): ImportedRecipe => {
  const merged: ImportedRecipe = { ...deterministic };
  if (deterministic.ingredients.length === 0 && model.ingredients.length > 0) {
    merged.ingredients = model.ingredients;
  }
  if (deterministic.instructions.length === 0 && model.instructions.length > 0) {
    merged.instructions = model.instructions;
  }
  if (isEmpty(deterministic.name) && !isEmpty(model.name)) merged.name = model.name;
  if (isEmpty(deterministic.recipeYield) && !isEmpty(model.recipeYield)) {
    merged.recipeYield = model.recipeYield;
  }
  if (isEmpty(deterministic.text) && !isEmpty(model.text)) merged.text = model.text;
  return merged;
};
