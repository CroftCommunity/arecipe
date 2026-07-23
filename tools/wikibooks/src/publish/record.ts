// D9 + D10 — map the IR onto the consumed exchange.recipe.recipe record, with
// full provenance and licence, and a DETERMINISTIC rkey (wb-<pageid>). The rkey
// is what makes the six-month rerun idempotent and a rename an update, not an
// orphan+create.
//
// We do NOT extend exchange.recipe.* (owned by recipe.exchange). Fields with a
// lexicon home are mapped; fields without one (difficulty, servings, image, the
// provenance block, parseFlags) ride in open-world fields recipe.exchange
// ignores. See tools/wikibooks/MAPPING.md for the gap report.
import type { Config, LicenseConfig } from '../config.ts';
import type { RecipeIR, Step } from '../ir.ts';
import { dietRefs } from '../transform/enrich-diet.ts';
import { categoryToken } from '../transform/enrich-category.ts';
import { cuisineToken } from '../transform/enrich-cuisine.ts';
import { keywordsFor } from '../transform/enrich-keywords.ts';
import { nutritionFor } from '../transform/enrich-nutrition.ts';
import { cookingMethodFor } from '../transform/enrich-cookingmethod.ts';

export type RawMeta = {
  pageid: number;
  title: string; // full wiki title, e.g. "Cookbook:Pancakes"
  revid: number;
  revTimestamp: string; // wiki revision timestamp (deterministic)
  retrievedAt: string; // when we fetched it (from the raw file's fetchedAt)
};

export type AttributionWebsite = {
  $type: 'exchange.recipe.defs#attributionWebsite';
  name: string;
  url: string;
  notes?: string;
};

export type RecipeRecord = {
  $type: 'exchange.recipe.recipe';
  name: string;
  text: string;
  ingredients: string[];
  instructions: string[];
  createdAt: string;
  updatedAt: string;
  attribution?: AttributionWebsite;
  recipeYield?: string;
  recipeCategory?: string;
  recipeCuisine?: string;
  /** Controlled diet tokens as full defs refs (e.g.
   *  "exchange.recipe.defs#dietVegan"). D15 — from dietary categories. */
  suitableForDiet?: string[];
  /** Free-text discovery keywords (≤64 chars each). D15. */
  keywords?: string[];
  /** Nutritional info (D15). Only `calories` is derivable from Wikibooks. */
  nutrition?: { calories?: number; fatContent?: number; proteinContent?: number; carbohydrateContent?: number };
  /** Single cooking-method token, bare lowercase (D15). */
  cookingMethod?: string;
  prepTime?: string;
  totalTime?: string;
  // ---- open-world provenance (D9) ----
  sourceUrl: string; // reuses the existing arecipe provenance field
  sourcePermalink: string;
  sourceRevId: number;
  sourceHistoryUrl: string;
  retrievedAt: string;
  license: { id: string; token: string; attribution: string };
  // ---- arecipe open-world extension: dishKey groups "versions of one dish"
  //      (see arecipe src/recipes/model.ts). Absent = standalone recipe. Set
  //      only from an operator-supplied, human-reviewed map (D14) — wbsync does
  //      not derive it. ----
  dishKey?: string;
  // ---- open-world meta with no lexicon home ----
  wikibooks: {
    pageid: number;
    difficulty?: number;
    servings?: string;
    servingsHint?: { min: number; max?: number };
    image?: string; // filename only — unresolved (images out of scope)
    origin?: string;
    energy?: string;
    note?: string;
    parseFlags: { code: string; detail?: string }[];
  };
};

export class MissingLicenseError extends Error {
  constructor() {
    super('licence config is unset — refusing to build a record without a licence (O2). Publish is blocked.');
    this.name = 'MissingLicenseError';
  }
}

export const deterministicRkey = (pageid: number): string => `wb-${pageid}`;

const WIKI = 'https://en.wikibooks.org';

const minutesToIso = (minutes: number | undefined): string | undefined => {
  if (minutes === undefined || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ''}${m > 0 ? `${m}M` : ''}`;
};

const clamp = (s: string, max: number): string => (s.length <= max ? s : s.slice(0, max - 1) + '…');

/** Flatten steps to instruction strings, keeping substeps as their own lines. */
const flattenSteps = (steps: Step[]): string[] => {
  const out: string[] = [];
  for (const step of steps) {
    out.push(clamp(step.text, 1000));
    for (const sub of step.substeps ?? []) out.push(clamp(`— ${sub.text}`, 1000));
  }
  return out;
};

const wikiPath = (title: string): string => title.replace(/ /g, '_');

export const buildRecord = (
  ir: RecipeIR,
  meta: RawMeta,
  cfg: Pick<Config, 'license'>,
  opts: { dishKey?: string } = {},
): { rkey: string; record: RecipeRecord } => {
  const license: LicenseConfig | undefined = cfg.license;
  if (license === undefined) throw new MissingLicenseError();

  const path = wikiPath(meta.title);
  const sourceUrl = `${WIKI}/wiki/${encodeURI(path)}`;
  const sourcePermalink = `${WIKI}/w/index.php?oldid=${meta.revid}`;
  const sourceHistoryUrl = `${WIKI}/w/index.php?title=${encodeURIComponent(path)}&action=history`;

  const text =
    ir.lead !== undefined && ir.lead.trim() !== ''
      ? clamp(ir.lead, 3000)
      : `${ir.title} — a recipe imported from the Wikibooks Cookbook.`;

  const attribution: AttributionWebsite = {
    $type: 'exchange.recipe.defs#attributionWebsite',
    name: 'Wikibooks Cookbook',
    url: sourceUrl,
    notes: `Text under ${license.id}. ${license.attribution}. Source: ${sourcePermalink}`,
  };

  const record: RecipeRecord = {
    $type: 'exchange.recipe.recipe',
    name: clamp(ir.title, 255),
    text,
    ingredients: ir.ingredients.map((i) => clamp(i.optional ? `${i.display} (optional)` : i.display, 500)),
    instructions: flattenSteps(ir.procedure),
    createdAt: meta.revTimestamp,
    updatedAt: meta.revTimestamp,
    attribution,
    sourceUrl,
    sourcePermalink,
    sourceRevId: meta.revid,
    sourceHistoryUrl,
    retrievedAt: meta.retrievedAt,
    license: { id: license.id, token: license.token, attribution: license.attribution },
    wikibooks: {
      pageid: meta.pageid,
      parseFlags: ir.parseFlags,
    },
  };

  if (ir.summary.yield !== undefined) record.recipeYield = ir.summary.yield;
  else if (ir.summary.servings !== undefined) record.recipeYield = ir.summary.servings;
  const catToken = categoryToken(ir);
  if (catToken !== undefined) record.recipeCategory = catToken;
  const cuiToken = cuisineToken(ir);
  if (cuiToken !== undefined) record.recipeCuisine = cuiToken;

  const keywords = keywordsFor(ir, [catToken, cuiToken].filter((t): t is string => t !== undefined));
  if (keywords.length > 0) record.keywords = keywords;

  const nutrition = nutritionFor(ir.summary.energy);
  if (nutrition !== undefined) record.nutrition = nutrition;

  const method = cookingMethodFor(ir);
  if (method !== undefined) record.cookingMethod = method;
  const total = minutesToIso(ir.summary.timeMinutesHint);
  if (total !== undefined) record.totalTime = total;

  if (ir.summary.difficulty !== undefined) record.wikibooks.difficulty = ir.summary.difficulty;
  if (ir.summary.servings !== undefined) record.wikibooks.servings = ir.summary.servings;
  if (ir.summary.servingsHint !== undefined) record.wikibooks.servingsHint = ir.summary.servingsHint;
  if (ir.summary.image !== undefined) record.wikibooks.image = ir.summary.image;
  if (ir.summary.origin !== undefined) record.wikibooks.origin = ir.summary.origin;
  if (ir.summary.energy !== undefined) record.wikibooks.energy = ir.summary.energy;
  if (ir.summary.note !== undefined) record.wikibooks.note = ir.summary.note;

  const dishKey = opts.dishKey?.trim();
  if (dishKey !== undefined && dishKey !== '') record.dishKey = dishKey;

  const diet = dietRefs(ir.categories);
  if (diet.length > 0) record.suitableForDiet = diet;

  return { rkey: deterministicRkey(meta.pageid), record };
};
