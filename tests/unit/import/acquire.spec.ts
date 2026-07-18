// @vitest-environment happy-dom
// Phase 3: layered acquisition. Direct cross-origin fetch first; on CORS /
// network / timeout failure (the common case for a static PWA — recipe sites
// don't send CORS headers) the caller falls back to a paste flow. The parse
// ladder (JSON-LD → text heuristic) runs over whatever HTML/text we obtained.
// The source URL is retained as provenance in EVERY path. Fetch is injected so
// this is hermetic — no network.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  acquireFromPaste,
  acquireFromUrl,
  IMPORT_COPY,
  type FetchLike,
} from '../../../src/import/acquire.js';

const fixture = (name: string): string => readFileSync(`tests/fixtures/import/${name}`, 'utf8');
const URL_IN = 'https://example.com/recipes/pancakes';

const okFetch = (body: string): FetchLike => () =>
  Promise.resolve({ ok: true, text: () => Promise.resolve(body) });

describe('acquireFromUrl', () => {
  it('imports via the ladder on a successful fetch, retaining the source URL', async () => {
    const res = await acquireFromUrl(URL_IN, { fetchFn: okFetch(fixture('plain-recipe.html')) });
    expect(res.kind).toBe('imported');
    if (res.kind !== 'imported') throw new Error('unreachable');
    expect(res.recipe.name).toBe('Classic Pancakes');
    expect(res.recipe.ingredients).toHaveLength(4);
    expect(res.missing).toBe('none');
    expect(res.sourceUrl).toBe(URL_IN);
  });

  it('degrades to could-not-fetch when the fetch rejects (CORS/network)', async () => {
    const res = await acquireFromUrl(URL_IN, {
      fetchFn: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    expect(res.kind).toBe('could-not-fetch');
    expect(res.sourceUrl).toBe(URL_IN);
  });

  it('treats a non-ok response as could-not-fetch', async () => {
    const res = await acquireFromUrl(URL_IN, {
      fetchFn: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
    });
    expect(res.kind).toBe('could-not-fetch');
  });

  it('times out a hung fetch and degrades to could-not-fetch', async () => {
    const hung: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const res = await acquireFromUrl(URL_IN, { fetchFn: hung, timeoutMs: 5 });
    expect(res.kind).toBe('could-not-fetch');
  });

  it('reports no-recipe when the page fetches but has no recipe', async () => {
    const res = await acquireFromUrl(URL_IN, { fetchFn: okFetch(fixture('no-recipe.html')) });
    expect(res.kind).toBe('no-recipe');
    expect(res.sourceUrl).toBe(URL_IN);
  });
});

describe('acquireFromPaste', () => {
  it('imports pasted page source via JSON-LD', () => {
    const res = acquireFromPaste(fixture('graph-recipe.html'), URL_IN);
    expect(res.kind).toBe('imported');
    if (res.kind !== 'imported') throw new Error('unreachable');
    expect(res.recipe.name).toBe('Tomato Soup');
    expect(res.sourceUrl).toBe(URL_IN);
  });

  it('imports pasted plain recipe text via the heuristic', () => {
    const paste = [
      "Grandma's Cornbread",
      '',
      '1 cup cornmeal',
      '1 cup flour',
      '1 tablespoon sugar',
      '',
      '1. Mix the dry ingredients.',
      '2. Bake at 400°F.',
    ].join('\n');
    const res = acquireFromPaste(paste, URL_IN);
    expect(res.kind).toBe('imported');
    if (res.kind !== 'imported') throw new Error('unreachable');
    expect(res.recipe.ingredients).toHaveLength(3);
    expect(res.recipe.instructions).toHaveLength(2);
  });

  it('flags a partial import (ingredients only) rather than fabricating', () => {
    const paste = ['Quick Snack', '', '1 apple', '2 tablespoons peanut butter', '1 teaspoon honey'].join('\n');
    const res = acquireFromPaste(paste, URL_IN);
    expect(res.kind).toBe('imported');
    if (res.kind !== 'imported') throw new Error('unreachable');
    expect(res.missing).toBe('instructions');
    expect(res.recipe.instructions).toEqual([]);
  });

  it('reports no-recipe for prose with neither bucket', () => {
    const res = acquireFromPaste('Just a story about my vacation by the sea, nothing to cook here.', URL_IN);
    expect(res.kind).toBe('no-recipe');
  });
});

describe('IMPORT_COPY', () => {
  it('states the serverless friction honestly for could-not-fetch', () => {
    expect(IMPORT_COPY.couldNotFetch).toMatch(/paste/i);
    expect(IMPORT_COPY.noRecipe).toMatch(/recipe/i);
    expect(IMPORT_COPY.partialInstructions).toMatch(/instructions/i);
    expect(IMPORT_COPY.partialIngredients).toMatch(/ingredients/i);
  });
});
