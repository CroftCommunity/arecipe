// Phase 6: local-first drafts — "build a recipe and save it without
// publishing it yet." Behaviors:
// - save assigns an id and stamps savedAt; get round-trips; list is
//   newest-first; update preserves the id; remove deletes
// - nothing here touches the network or the PDS (locality is the point)
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDraftStore } from '../../../src/recipes/drafts-local.js';

const fields = {
  name: 'Greek Salad',
  text: 'A bright summer side.',
  ingredients: '1 cucumber',
  instructions: 'Chop.',
  prepMinutes: 0,
  totalMinutes: 0,
  recipeYield: '',
};

describe('createDraftStore', () => {
  it('saves, gets, and lists drafts (newest first)', async () => {
    const store = createDraftStore({ dbName: `d1-${Math.random()}` });
    const a = await store.save({ ...fields, name: 'First' });
    const b = await store.save({ ...fields, name: 'Second' });
    expect(a.id).not.toBe(b.id);
    expect((await store.get(a.id))?.fields.name).toBe('First');
    const list = await store.list();
    expect(list.map((d) => d.fields.name)).toEqual(['Second', 'First']);
  });

  it('updating with an existing id preserves it and bumps savedAt', async () => {
    const store = createDraftStore({ dbName: `d2-${Math.random()}` });
    const first = await store.save(fields);
    await new Promise((r) => setTimeout(r, 5));
    const updated = await store.save({ ...fields, name: 'Renamed' }, first.id);
    expect(updated.id).toBe(first.id);
    expect((await store.list()).length).toBe(1);
    expect(updated.savedAt >= first.savedAt).toBe(true);
  });

  it('remove deletes the draft', async () => {
    const store = createDraftStore({ dbName: `d3-${Math.random()}` });
    const draft = await store.save(fields);
    await store.remove(draft.id);
    expect(await store.get(draft.id)).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  // Phase 11b: a draft carries a status (draft | cooking | ready). Both edges:
  // absent → 'draft' default; a non-default status round-trips through the store.
  it('carries a status: defaults to draft, and a non-default status round-trips', async () => {
    const store = createDraftStore({ dbName: `d4-${Math.random()}` });
    const def = await store.save(fields);
    expect(def.status).toBe('draft');
    expect((await store.get(def.id))?.status).toBe('draft');

    const cooking = await store.save({ ...fields, name: 'Braise' }, undefined, 'cooking');
    expect(cooking.status).toBe('cooking');
    expect((await store.get(cooking.id))?.status).toBe('cooking');
  });
});
