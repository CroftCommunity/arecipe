// RUN-RECIPE-META-STRIP D1 — the normalized meta view model.
//
// `display` is authoritative for rendering; `hint` is only ever for sort/filter.
// The source values are free text (the {{Recipe summary}} template shows
// `servings = 1-2`, `yield = 4 burgers`, `time = 30 minutes`), so typing serves
// as a number would silently rewrite "1-2" as 1 — the parser must NOT do that.
// Every field is optional at the source; absent means the field is omitted.
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LABELS,
  parseDifficulty,
  parseServes,
  parseTime,
  recipeMetaOf,
} from '../../../src/recipes/meta.js';

describe('parseServes', () => {
  it('round-trips free text unchanged as the display value', () => {
    expect(parseServes('1-2')?.display).toBe('1-2');
    expect(parseServes('4 burgers')?.display).toBe('4 burgers');
    expect(parseServes('4')?.display).toBe('4');
  });

  it('"1-2" produces a hint of {min:1, max:2} and a display of "1-2"', () => {
    expect(parseServes('1-2')).toEqual({ display: '1-2', hint: { min: 1, max: 2 } });
  });

  it('a bare number produces a single-bound hint', () => {
    expect(parseServes('4')).toEqual({ display: '4', hint: { min: 4 } });
  });

  it('"4 burgers" produces NO numeric hint (yield text, not a serving count)', () => {
    expect(parseServes('4 burgers')).toEqual({ display: '4 burgers' });
    expect(parseServes('4 burgers')?.hint).toBeUndefined();
  });

  it('tolerates an en/em dash range', () => {
    expect(parseServes('2–4')).toEqual({ display: '2–4', hint: { min: 2, max: 4 } });
  });

  it('omits entirely for empty / non-string input', () => {
    expect(parseServes('')).toBeUndefined();
    expect(parseServes('   ')).toBeUndefined();
    expect(parseServes(undefined)).toBeUndefined();
    expect(parseServes(42)).toBeUndefined();
  });
});

describe('parseTime', () => {
  it('"30 minutes" (free text) produces hintMinutes: 30 and a verbatim display', () => {
    expect(parseTime('30 minutes')).toEqual({ display: '30 minutes', hintMinutes: 30 });
  });

  it('"about an hour" produces a display and NO hint (no digits to trust)', () => {
    expect(parseTime('about an hour')).toEqual({ display: 'about an hour' });
    expect(parseTime('about an hour')?.hintMinutes).toBeUndefined();
  });

  it('extracts combined hours + minutes from free text', () => {
    expect(parseTime('1 hour 30 minutes')?.hintMinutes).toBe(90);
    expect(parseTime('2 hrs')?.hintMinutes).toBe(120);
  });

  it('reads an ISO-8601 duration, rendering in the app register', () => {
    expect(parseTime('PT30M')).toEqual({ display: '30 m', hintMinutes: 30 });
    expect(parseTime('PT1H35M')).toEqual({ display: '1 h 35 m', hintMinutes: 95 });
  });

  it('omits for zero / empty / non-string input', () => {
    expect(parseTime('PT0S')).toBeUndefined();
    expect(parseTime('')).toBeUndefined();
    expect(parseTime(undefined)).toBeUndefined();
    expect(parseTime(5)).toBeUndefined();
  });
});

describe('parseDifficulty', () => {
  it('maps each in-range value to the Cookbook five-point label', () => {
    expect(parseDifficulty(1)).toEqual({ value: 1, label: 'Very easy' });
    expect(parseDifficulty(2)).toEqual({ value: 2, label: 'Easy' });
    expect(parseDifficulty(3)).toEqual({ value: 3, label: 'Average' });
    expect(parseDifficulty(4)).toEqual({ value: 4, label: 'Hard' });
    expect(parseDifficulty(5)).toEqual({ value: 5, label: 'Very hard' });
  });

  it('accepts a numeric string', () => {
    expect(parseDifficulty('3')).toEqual({ value: 3, label: 'Average' });
  });

  it('omits the field for out-of-range, non-numeric, and empty — never clamps', () => {
    expect(parseDifficulty(0)).toBeUndefined();
    expect(parseDifficulty(6)).toBeUndefined();
    expect(parseDifficulty('hard')).toBeUndefined();
    expect(parseDifficulty('')).toBeUndefined();
    expect(parseDifficulty(3.5)).toBeUndefined();
    expect(parseDifficulty(undefined)).toBeUndefined();
  });

  it('exposes the label table', () => {
    expect(DIFFICULTY_LABELS[3]).toBe('Average');
  });
});

describe('recipeMetaOf', () => {
  it('reads serves from recipeYield, time from ISO totalTime, difficulty from the open-world field', () => {
    expect(
      recipeMetaOf({ recipeYield: '4', totalTime: 'PT30M', difficulty: 3 }),
    ).toEqual({
      serves: { display: '4', hint: { min: 4 } },
      time: { display: '30 m', hintMinutes: 30 },
      difficulty: { value: 3, label: 'Average' },
    });
  });

  it('falls back to prepTime when totalTime is absent', () => {
    expect(recipeMetaOf({ prepTime: 'PT15M' }).time).toEqual({ display: '15 m', hintMinutes: 15 });
  });

  it('renders yield in the serves row when only recipeYield is present ("4 burgers")', () => {
    expect(recipeMetaOf({ recipeYield: '4 burgers' }).serves).toEqual({ display: '4 burgers' });
  });

  it('serves wins over yield when both are present, dropping yield from the strip', () => {
    const meta = recipeMetaOf({ servings: '4', recipeYield: '4 burgers' });
    expect(meta.serves).toEqual({ display: '4', hint: { min: 4 } });
  });

  it('degrades to an empty model when nothing is present', () => {
    expect(recipeMetaOf({})).toEqual({});
    expect(recipeMetaOf({ difficulty: 9, recipeYield: '' })).toEqual({});
  });

  it('is defensive against mistyped fields (open-world reads)', () => {
    expect(recipeMetaOf({ recipeYield: 5, totalTime: {}, difficulty: 'hard' })).toEqual({});
  });
});
