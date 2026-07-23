// EXP-IMPORT-EXTRACTION · Arm 2 safety core (the provenance gate).
//
// A model extraction is only allowed to SELECT spans of the source, never to
// compose prose. This module is how that is enforced: every extracted
// ingredient and instruction string must appear VERBATIM in the source text,
// and an extraction containing any string that does not is rejected WHOLESALE.
//
// Why wholesale and not per-line: a single manufactured line is evidence the
// model was composing rather than selecting on that run, which taints the whole
// extraction's provenance — the agents-page posture (agents.md) is to cite
// sources and make no claims over them, and a model that rewrites instruction
// text has manufactured a derivative work. A parser that extracts has not. So
// the safe default is to discard the entire draft and fall back to the
// deterministic result (or to the empty-draft/paste path), never to keep the
// "good" lines from a run that also produced a bad one.
//
// Matching is whitespace-normalized (runs of any whitespace collapse to a
// single space, ends trimmed) so that a span the model lifts across a line
// break or with incidental padding still counts as verbatim; it is otherwise
// exact (case- and character-preserving). An empty span is never a real
// selection and is always a violation.

/** Collapse all whitespace runs to a single space and trim. The one and only
 *  normalization applied before the containment check. */
const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Does a single extracted span appear verbatim (whitespace-normalized) in the
 *  source? An empty span, or any span against an empty source, is false. */
export const appearsVerbatim = (span: string, source: string): boolean => {
  const needle = normalize(span);
  if (needle === '') return false;
  return normalize(source).includes(needle);
};

export type VerbatimResult = {
  /** True only if EVERY string is verbatim. False ⇒ discard the whole extraction. */
  ok: boolean;
  /** Every offending string, in ingredient-then-instruction order, for the log. */
  violations: string[];
};

/** Validate a whole extraction against its source. Wholesale contract: `ok` is
 *  true only when there are zero violations; the caller must treat any violation
 *  as grounds to discard the entire extraction, not to keep the passing lines. */
export const validateVerbatim = (
  ingredients: readonly string[],
  instructions: readonly string[],
  source: string,
): VerbatimResult => {
  const haystack = normalize(source);
  const violations: string[] = [];
  for (const span of [...ingredients, ...instructions]) {
    const needle = normalize(span);
    if (needle === '' || !haystack.includes(needle)) violations.push(span);
  }
  return { ok: violations.length === 0, violations };
};
