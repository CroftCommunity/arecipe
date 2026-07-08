// Building and publishing exchange.recipe.recipe records (Phase 6). The
// editor collects plain fields; buildRecipeRecord validates against the
// lexicon's required floor (fail loud, naming the field) and produces the
// typed record; publishRecipe writes it through the session-provider Agent.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import { RECIPE_COLLECTION } from './read.js';

export type EditorFields = {
  name: string;
  text: string;
  /** One ingredient per line. */
  ingredients: string;
  /** One step per line. */
  instructions: string;
  prepMinutes?: number;
  totalMinutes?: number;
  recipeYield?: string;
};

export type RecipeRecordOut = {
  $type: 'exchange.recipe.recipe';
  name: string;
  text: string;
  ingredients: string[];
  instructions: string[];
  prepTime?: string;
  totalTime?: string;
  recipeYield?: string;
  /** exchange.recipe.recipe#imagesEmbed (Phase 7). */
  embed?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

/** Minutes → ISO-8601 duration; 0/undefined mean "not set". */
export const minutesToIso = (minutes: number | undefined): string | null => {
  if (minutes === undefined || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${rest > 0 ? `${rest}M` : ''}`;
};

const lines = (raw: string): string[] =>
  raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

export const buildRecipeRecord = (fields: EditorFields): RecipeRecordOut => {
  const name = fields.name.trim();
  const text = fields.text.trim();
  const ingredients = lines(fields.ingredients);
  const instructions = lines(fields.instructions);
  if (name === '') throw new Error('name is required');
  if (text === '') throw new Error('text (description) is required');
  if (ingredients.length === 0) throw new Error('at least one ingredients line is required');
  if (instructions.length === 0) throw new Error('at least one instructions step is required');

  const now = new Date().toISOString();
  const record: RecipeRecordOut = {
    $type: 'exchange.recipe.recipe',
    name,
    text,
    ingredients,
    instructions,
    createdAt: now,
    updatedAt: now,
  };
  const prepTime = minutesToIso(fields.prepMinutes);
  if (prepTime !== null) record.prepTime = prepTime;
  const totalTime = minutesToIso(fields.totalMinutes);
  if (totalTime !== null) record.totalTime = totalTime;
  const recipeYield = fields.recipeYield?.trim() ?? '';
  if (recipeYield !== '') record.recipeYield = recipeYield;
  return record;
};

/** Published record → editor fields (edit mode). ISO durations → minutes. */
export const recordToFields = (value: {
  name?: string;
  text?: string;
  ingredients?: string[];
  instructions?: string[];
  prepTime?: string;
  totalTime?: string;
  recipeYield?: string;
}): EditorFields => {
  const isoToMinutes = (iso: string | undefined): number => {
    if (iso === undefined) return 0;
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?$/.exec(iso);
    if (match === null) return 0;
    return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  };
  return {
    name: value.name ?? '',
    text: value.text ?? '',
    ingredients: (value.ingredients ?? []).join('\n'),
    instructions: (value.instructions ?? []).join('\n'),
    prepMinutes: isoToMinutes(value.prepTime),
    totalMinutes: isoToMinutes(value.totalTime),
    recipeYield: value.recipeYield ?? '',
  };
};

/** Update an existing record in place (same rkey): the CID changes, the
 * AT-URI does not — that's what the staleness indicator detects. */
export const updateRecipe = async (
  agent: Agent,
  args: { rkey: string; record: RecipeRecordOut; createdAt: string },
): Promise<{ uri: string; cid: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to publish from');
  const record = { ...args.record, createdAt: args.createdAt }; // preserve original
  log.info('recipes', 'updating', { rkey: args.rkey, name: record.name });
  const res = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: RECIPE_COLLECTION,
    rkey: args.rkey,
    record,
  });
  log.info('recipes', 'updated', { uri: res.data.uri, cid: res.data.cid });
  return { uri: res.data.uri, cid: res.data.cid };
};

/** Publish to the signed-in account's repo. Rkey is PDS-minted (a TID). */
export const publishRecipe = async (
  agent: Agent,
  record: RecipeRecordOut,
): Promise<{ uri: string; cid: string }> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to publish from');
  log.info('recipes', 'publishing', { name: record.name });
  const res = await agent.com.atproto.repo.createRecord({
    repo: did,
    collection: RECIPE_COLLECTION,
    record,
  });
  log.info('recipes', 'published', { uri: res.data.uri });
  return { uri: res.data.uri, cid: res.data.cid };
};
