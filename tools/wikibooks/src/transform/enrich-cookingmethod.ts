// D15 Phase 5B — cookingMethod. Infers ONE bare-lowercase method token from the
// title (then categories), precision-first. No upstream method field exists, so
// this is deliberately low-recall: stamp only on an unambiguous keyword, and
// omit when two distinct methods appear (ambiguous). "no-bake" is a nocook
// signal, not baking.
import type { RecipeIR } from '../ir.ts';

// Each rule: a keyword regex → bare token (defs cookingMethod* minus prefix,
// lowercased). Order matters only for the no-bake special case below.
const RULES: { re: RegExp; token: string }[] = [
  { re: /\bair[- ]?fr(y|ied|ying)\b/, token: 'airfrying' },
  { re: /\bpressure[- ]?cook|\binstant pot\b/, token: 'pressurecooking' },
  { re: /\bslow[- ]?cook|\bcrock[- ]?pot\b/, token: 'slowcooking' },
  { re: /\bdeep[- ]?fr(y|ied)|\bfr(y|ied|ying)\b/, token: 'frying' },
  { re: /\bgrill(ed|ing)?\b/, token: 'grilling' },
  { re: /\broast(ed|ing)?\b/, token: 'roasting' },
  { re: /\bbroil(ed|ing)?\b/, token: 'broiling' },
  { re: /\bsaut[ée]|\bsaute(ed|ing)?\b/, token: 'sauteing' },
  { re: /\bsteam(ed|ing)?\b/, token: 'steaming' },
  { re: /\bbak(e|ed|ing)\b/, token: 'baking' },
  { re: /\bno[- ]?(bake|cook)\b|\braw\b/, token: 'nocook' },
];

const normalize = (s: string): string => s.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** Distinct method tokens found in one text, honoring the no-bake override. */
const tokensIn = (text: string): Set<string> => {
  const norm = normalize(text);
  const found = new Set<string>();
  const noBake = /\bno[- ]?bake\b/.test(norm);
  for (const { re, token } of RULES) {
    if (token === 'baking' && noBake) continue; // "no-bake" is not baking
    if (re.test(norm)) found.add(token);
  }
  if (noBake) found.add('nocook');
  return found;
};

/** One method token, or undefined when absent/ambiguous/conflicting. */
export const cookingMethodFor = (ir: RecipeIR): string | undefined => {
  for (const text of [ir.title, ...ir.categories]) {
    const found = tokensIn(text);
    if (found.size === 1) return [...found][0];
    if (found.size > 1) return undefined; // conflict → omit (precision-first)
  }
  return undefined;
};
