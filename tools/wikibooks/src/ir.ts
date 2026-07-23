// The normalized recipe IR. Produced by the transform stage as a PURE function
// of wikitext (+ the transform version) — no timestamps, no provenance, so that
// ir_sha256 changes ONLY when the wikitext or the parser changes (change-axis 2).
// Provenance/retrievedAt are layered on at record-mapping time (D9/D10), never
// hashed here.
import { canonicalJson } from './util/canonical-json.ts';
import { sha256 } from './util/hash.ts';

/** Anything the transform could not fully model is recorded here — never
 *  silently dropped. `code` names the construct; `detail` preserves specifics. */
export type ParseFlag = { code: string; detail?: string };

export type Summary = {
  category?: string;
  servings?: string; // free text, e.g. "1-2"
  servingsHint?: { min: number; max?: number }; // parsed only when unambiguous
  yield?: string;
  time?: string; // free text, e.g. "30 minutes"
  timeMinutesHint?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  cuisine?: string;
  origin?: string;
  energy?: string;
  note?: string;
  /** Infobox image filename ONLY — images are out of scope (D9); unresolved. */
  image?: string;
};

export type IngredientLine = {
  raw: string; // wikitext, untouched
  display: string; // markup stripped, links rendered to display text
  refs: string[]; // resolved Cookbook: link targets, e.g. "Carrot"
  optional: boolean; // detected from a leading "optional" marker only
};

export type Step = {
  text: string;
  refs: string[];
  /** Nested sub-steps, preserved rather than flattened. */
  substeps?: Step[];
};

export type ProseBlock = { heading: string; text: string };

export type RecipeIR = {
  /** Display title, "Cookbook:" prefix stripped. */
  title: string;
  summary: Summary;
  lead?: string;
  ingredients: IngredientLine[];
  procedure: Step[];
  sections: ProseBlock[];
  parseFlags: ParseFlag[];
  publishable: boolean;
  skipReason?: string;
};

/** Canonical, sorted-key serialization — the byte form that gets hashed. */
export const serializeIr = (ir: RecipeIR): string => canonicalJson(ir);

export const irSha256 = (ir: RecipeIR): string => sha256(serializeIr(ir));
