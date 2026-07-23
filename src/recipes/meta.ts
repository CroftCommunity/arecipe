// RUN-RECIPE-META-STRIP D1 — the normalized recipe-meta view model.
//
// The render layer (renderMetaStrip, view.ts) takes ONE normalized RecipeMeta;
// this module builds it from a raw record value. `display` is authoritative for
// rendering — it preserves the source free text verbatim ("1-2", "4 burgers",
// "about an hour") — while `hint` is only ever for sorting and filtering. Typing
// serves as a number would lose "1-2" and quietly rewrite it as 1, so the parser
// derives a hint ONLY from unambiguously numeric input and never rewrites the
// display.
//
// Sources (see runs/recipe-meta-strip/D0-discovery.md):
//  - serves     ← open-world `servings` (if present) else upstream `recipeYield`
//                 (free-text string; serves wins over yield when both exist).
//  - time       ← upstream ISO-8601 `totalTime` (fallback `prepTime`); the parser
//                 also accepts free text for the Wikibooks corpus.
//  - difficulty ← open-world `difficulty` (number 1..5), owner decision O1 = B3.
//
// Every read is DEFENSIVE (the open-world posture of read.ts / model.ts): a
// missing, empty, or mistyped source yields undefined rather than throwing.

import { formatDuration } from './present.js';
import { isoDurationToMinutes } from './write.js';

export type ServesHint = { min: number; max?: number };
export type Serves = { display: string; hint?: ServesHint };
export type TimeMeta = { display: string; hintMinutes?: number };
export type DifficultyValue = 1 | 2 | 3 | 4 | 5;
export type Difficulty = { value: DifficultyValue; label: string };

export type RecipeMeta = {
  serves?: Serves;
  time?: TimeMeta;
  difficulty?: Difficulty;
};

/** The Cookbook policy's five-point difficulty wording. */
export const DIFFICULTY_LABELS: Record<DifficultyValue, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Average',
  4: 'Hard',
  5: 'Very hard',
};

const trimmedString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/** Free-text servings/yield → display (verbatim) + an optional numeric hint. A
 *  hint is derived ONLY from a bare number ("4") or a numeric range ("1-2",
 *  "2–4"); anything with trailing words ("4 burgers") keeps the display and
 *  drops the hint, because it is a yield description, not a serving count. */
export const parseServes = (raw: unknown): Serves | undefined => {
  const display = trimmedString(raw);
  if (display === undefined) return undefined;
  const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(display);
  if (range !== null) {
    return { display, hint: { min: Number(range[1]), max: Number(range[2]) } };
  }
  const single = /^(\d+)$/.exec(display);
  if (single !== null) return { display, hint: { min: Number(single[1]) } };
  return { display };
};

/** Minutes extracted from free-text time ("1 hour 30 minutes" → 90); undefined
 *  when there is no digit to trust ("about an hour"). */
const freeTextMinutes = (text: string): number | undefined => {
  const hours = /(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(text);
  const minutes = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/i.exec(text);
  const total = (hours !== null ? Number(hours[1]) * 60 : 0) + (minutes !== null ? Number(minutes[1]) : 0);
  return total > 0 ? total : undefined;
};

/** Time → display (authoritative) + hintMinutes (sort only). Accepts an
 *  ISO-8601 duration (rendered in the app register via formatDuration) OR free
 *  text (preserved verbatim). Undefined for zero / empty / non-string input. */
export const parseTime = (raw: unknown): TimeMeta | undefined => {
  const value = trimmedString(raw);
  if (value === undefined) return undefined;
  if (/^PT/i.test(value)) {
    const display = formatDuration(value);
    if (display === null) return undefined; // PT0S / unparseable
    return { display, hintMinutes: isoDurationToMinutes(value) };
  }
  const hintMinutes = freeTextMinutes(value);
  return hintMinutes === undefined ? { display: value } : { display: value, hintMinutes };
};

const isDifficultyValue = (n: number): n is DifficultyValue =>
  Number.isInteger(n) && n >= 1 && n <= 5;

/** Difficulty 1..5 → {value, label}; omitted for out-of-range, non-integer,
 *  non-numeric, or empty input. Never clamps — a clamped garbage 5 is worse than
 *  a missing row. */
export const parseDifficulty = (raw: unknown): Difficulty | undefined => {
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) n = Number(raw.trim());
  else return undefined;
  if (!isDifficultyValue(n)) return undefined;
  return { value: n, label: DIFFICULTY_LABELS[n] };
};

/** Build the normalized meta view model from a raw record value. Fields absent
 *  from the result are simply not rendered (degrade to nothing). */
export const recipeMetaOf = (value: Record<string, unknown>): RecipeMeta => {
  const meta: RecipeMeta = {};
  const serves = parseServes(value['servings']) ?? parseServes(value['recipeYield']);
  if (serves !== undefined) meta.serves = serves;
  const time = parseTime(value['totalTime']) ?? parseTime(value['prepTime']);
  if (time !== undefined) meta.time = time;
  const difficulty = parseDifficulty(value['difficulty']);
  if (difficulty !== undefined) meta.difficulty = difficulty;
  return meta;
};
