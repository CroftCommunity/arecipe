// EXP-IMPORT-EXTRACTION · scoring instrument (experiment-internal; NOT shipped
// in any page bundle). Turns an extracted draft vs. a hand-keyed gold recipe
// into per-field verdicts, list precision/recall, and the headline usable-draft
// rate. Kept deterministic and dependency-free so the numbers are reproducible.
//
// Field verdict taxonomy (§8): exact | partial | missing | wrong.
//   exact   — normalized match (or a correct true-negative: absent on both sides)
//   partial — overlapping but not equal (a small correction)
//   missing — expected something, extracted nothing
//   wrong   — extracted something with no overlap (fabricated / mis-identified),
//             including a fabrication where nothing was expected
//
// Normalization (the only fuzz applied): lowercase, collapse whitespace, strip a
// leading list bullet, strip surrounding punctuation. Deliberately conservative
// — it forgives casing/spacing/"." noise, not paraphrase.

export type FieldScore = 'exact' | 'partial' | 'missing' | 'wrong';

export type ScoredRecipe = {
  name?: string;
  ingredients: string[];
  instructions: string[];
  recipeYield?: string;
  prepTime?: string;
  totalTime?: string;
  image?: string;
  sourceUrl?: string;
};

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^[-*•·‣–]\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,:;]+|[\s.,:;]+$/g, '')
    .trim();

/** Two lines "match" if normalized-equal or one contains the other (captures
 *  "flour" vs "all-purpose flour" as partial credit). */
const lineMatches = (a: string, b: string): boolean => {
  const x = norm(a);
  const y = norm(b);
  if (x === '' || y === '') return false;
  return x === y || x.includes(y) || y.includes(x);
};

/** A single scalar field → one verdict. */
export const scoreScalar = (expected: string, got: string): FieldScore => {
  const e = norm(expected);
  const g = norm(got);
  if (e === '' && g === '') return 'exact'; // correct true-negative
  if (e === '' && g !== '') return 'wrong'; // fabricated a value nobody expected
  if (g === '') return 'missing';
  if (e === g) return 'exact';
  if (e.includes(g) || g.includes(e)) return 'partial';
  return 'wrong';
};

export type ListScore = { score: FieldScore; precision: number; recall: number };

/** A list field → precision/recall over matched lines + a rolled-up verdict. */
export const scoreList = (expected: string[], got: string[]): ListScore => {
  if (expected.length === 0 && got.length === 0) {
    return { score: 'exact', precision: 1, recall: 1 };
  }
  const truePositivesGot = got.filter((g) => expected.some((e) => lineMatches(e, g)));
  const recoveredExpected = expected.filter((e) => got.some((g) => lineMatches(e, g)));
  const precision = got.length === 0 ? 0 : truePositivesGot.length / got.length;
  const recall = expected.length === 0 ? 1 : recoveredExpected.length / expected.length;

  let score: FieldScore;
  if (got.length === 0) score = 'missing';
  else if (recall === 0) score = 'wrong';
  else if (recall === 1 && precision === 1) score = 'exact';
  else score = 'partial';
  return { score, precision, recall };
};

const CORE_FIELDS = ['ingredients', 'instructions'] as const;
const MINOR_SCALARS = ['name', 'recipeYield', 'prepTime', 'totalTime', 'image', 'sourceUrl'] as const;
const ALL_FIELDS = [...CORE_FIELDS, ...MINOR_SCALARS] as const;
type FieldName = (typeof ALL_FIELDS)[number];

type ScalarScore = { score: FieldScore };

export type SourceScore = {
  fields: {
    ingredients: ListScore;
    instructions: ListScore;
    name: ScalarScore;
    recipeYield: ScalarScore;
    prepTime: ScalarScore;
    totalTime: ScalarScore;
    image: ScalarScore;
    sourceUrl: ScalarScore;
  };
  /** Trivial-edit cost: partials and minor gaps each cost 1; a core side that is
   *  missing/wrong is not trivially fixable and costs Infinity. */
  trivialEdits: number;
};

/** Cost of turning `state` on a field into an accepted line, in trivial edits. */
const editCost = (state: FieldScore, isCore: boolean): number => {
  if (state === 'exact') return 0;
  if (state === 'partial') return 1; // fix a line / tweak a title
  // missing or wrong:
  return isCore ? Number.POSITIVE_INFINITY : 1; // a whole core side is not "trivial"
};

export const scoreSource = (gold: ScoredRecipe, got: ScoredRecipe): SourceScore => {
  const ingredients = scoreList(gold.ingredients, got.ingredients);
  const instructions = scoreList(gold.instructions, got.instructions);
  const scalar = (f: (typeof MINOR_SCALARS)[number]): ScalarScore => ({
    score: scoreScalar(gold[f] ?? '', got[f] ?? ''),
  });
  const fields: SourceScore['fields'] = {
    ingredients,
    instructions,
    name: scalar('name'),
    recipeYield: scalar('recipeYield'),
    prepTime: scalar('prepTime'),
    totalTime: scalar('totalTime'),
    image: scalar('image'),
    sourceUrl: scalar('sourceUrl'),
  };
  const trivialEdits =
    editCost(ingredients.score, true) +
    editCost(instructions.score, true) +
    MINOR_SCALARS.reduce((sum, f) => sum + editCost(fields[f].score, false), 0);
  return { fields, trivialEdits };
};

/** "Accepts the draft with no edits or only trivial ones." A core side that is
 *  missing/wrong makes trivialEdits Infinite → never usable; otherwise usable
 *  iff the trivial-edit count fits the budget (default 3). */
export const DEFAULT_TRIVIAL_BUDGET = 3;
export const isUsable = (s: SourceScore, budget: number = DEFAULT_TRIVIAL_BUDGET): boolean =>
  s.trivialEdits <= budget;

export type FieldAggregate = {
  exact: number;
  partial: number;
  missing: number;
  wrong: number;
  /** Micro-averaged over sources for list fields; for scalars, precision=recall=accuracy. */
  precision: number;
  recall: number;
};

export type Aggregate = {
  total: number;
  usable: number;
  usableDraftRate: number;
  perField: Record<FieldName, FieldAggregate>;
};

const emptyAgg = (): FieldAggregate => ({
  exact: 0,
  partial: 0,
  missing: 0,
  wrong: 0,
  precision: 0,
  recall: 0,
});

export const aggregate = (
  scores: SourceScore[],
  budget: number = DEFAULT_TRIVIAL_BUDGET,
): Aggregate => {
  const perField = Object.fromEntries(ALL_FIELDS.map((f) => [f, emptyAgg()])) as Record<
    FieldName,
    FieldAggregate
  >;

  for (const s of scores) {
    for (const f of ALL_FIELDS) {
      const fs = s.fields[f];
      const agg = perField[f];
      agg[fs.score] += 1;
      if ('precision' in fs) {
        agg.precision += fs.precision;
        agg.recall += fs.recall;
      } else {
        // scalar: exact/partial contribute proportionally, missing/wrong = 0
        const credit = fs.score === 'exact' ? 1 : fs.score === 'partial' ? 0.5 : 0;
        agg.precision += credit;
        agg.recall += credit;
      }
    }
  }
  const n = scores.length || 1;
  for (const f of ALL_FIELDS) {
    perField[f].precision /= n;
    perField[f].recall /= n;
  }

  const usable = scores.filter((s) => isUsable(s, budget)).length;
  return {
    total: scores.length,
    usable,
    usableDraftRate: scores.length === 0 ? 0 : usable / scores.length,
    perField,
  };
};
