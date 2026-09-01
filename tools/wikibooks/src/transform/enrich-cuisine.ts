// D15 Phase 3B — cuisine crosswalk. Wikibooks infobox `cuisine` + nationality
// [[Category:…]] → one controlled `cuisine*` token stored bare-lowercase (as
// arecipe writes it). Data-only table inside the tool.
//
// Sparse by design: only the 33 cuisines in exchange.recipe.defs map. A
// nationality with no token (Ethiopian, Nigerian, Rwandan — common in this
// corpus) returns undefined and falls through to keyword spillover (Phase 4).
import type { RecipeIR } from '../ir.ts';

// adjective (as it appears, lowercased) → bare cuisine token. Most are identity;
// the exceptions are the multi-word / irregular ones.
const CUISINES: Record<string, string> = {
  african: 'african', american: 'american', australian: 'australian', brazilian: 'brazilian',
  british: 'british', caribbean: 'caribbean', chinese: 'chinese', creole: 'creole',
  european: 'european', french: 'french', german: 'german', greek: 'greek', indian: 'indian',
  indonesian: 'indonesian', italian: 'italian', japanese: 'japanese', korean: 'korean',
  lebanese: 'lebanese', mediterranean: 'mediterranean', mexican: 'mexican',
  moroccan: 'moroccan', peruvian: 'peruvian', polish: 'polish', portuguese: 'portuguese',
  russian: 'russian', southern: 'southern', spanish: 'spanish', thai: 'thai',
  turkish: 'turkish', vietnamese: 'vietnamese', texan: 'texan',
  'middle eastern': 'middle eastern', 'tex-mex': 'texmex', 'tex mex': 'texmex', texmex: 'texmex',
};

const normalize = (s: string): string => s.replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

/** Candidate cuisine strings: infobox cuisine first, then "<Nationality> recipes"
 *  category names (the nationality word extracted before "recipes"). */
const candidates = (ir: RecipeIR): string[] => {
  const out: string[] = [];
  if (ir.summary.cuisine !== undefined) out.push(normalize(ir.summary.cuisine));
  for (const cat of ir.categories) {
    const m = /^(.+?)\s+recipe(s)?$/.exec(normalize(cat));
    if (m?.[1] !== undefined) out.push(m[1]);
  }
  return out;
};

/** One bare cuisine token, or undefined when nothing maps. Multi-word keys
 *  (e.g. "middle eastern") are checked as a whole; single words matched exactly. */
export const cuisineToken = (ir: RecipeIR): string | undefined => {
  for (const cand of candidates(ir)) {
    if (CUISINES[cand] !== undefined) return CUISINES[cand];
    // whole-word scan for a known adjective inside a longer phrase
    for (const word of cand.split(' ')) {
      if (CUISINES[word] !== undefined) return CUISINES[word];
    }
    // multi-word keys (e.g. "middle eastern", "tex-mex")
    for (const key of Object.keys(CUISINES)) {
      if (key.includes(' ') && cand.includes(key)) return CUISINES[key];
    }
  }
  return undefined;
};
