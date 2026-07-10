// Phase 8: draft ↔ app.arecipe.draft record mapping (PDS sync for eviction
// survival; drafts on the PDS are PUBLIC — accepted decision, disclosed in
// the editor). Behaviors:
// - a local draft maps to an app.arecipe.draft record carrying the fields,
//   status: 'draft', the local clientId, and savedAt
// - a fetched record maps back to the same draft (round-trip)
// - records missing required shape fail loud
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { draftFromRecord, draftToRecord } from '../../../src/recipes/drafts-sync.js';
import { createDraftStore, type Draft } from '../../../src/recipes/drafts-local.js';

const draft: Draft = {
  id: 'b3c4d5e6-0000-4000-8000-123456789abc',
  savedAt: '2026-07-08T01:00:00.000Z',
  status: 'draft',
  fields: {
    name: 'Midnight Toast',
    text: 'Toast, but at midnight.',
    ingredients: '2 slices bread\nbutter',
    instructions: 'Toast.\nButter.',
    prepMinutes: 5,
    totalMinutes: 10,
    recipeYield: '1',
  },
};

describe('draftToRecord / draftFromRecord', () => {
  it('round-trips a draft through the record shape', () => {
    const record = draftToRecord(draft);
    expect(record.$type).toBe('app.arecipe.draft');
    expect(record.status).toBe('draft');
    expect(record.clientId).toBe(draft.id);
    expect(record.savedAt).toBe(draft.savedAt);
    const back = draftFromRecord(record);
    expect(back).toEqual(draft);
  });

  it('fails loud on a record without the draft shape', () => {
    expect(() => draftFromRecord({ $type: 'app.arecipe.draft', status: 'draft' })).toThrow(
      /clientId|fields/,
    );
  });

  // Phase 11b: the widened status flows through the record both ways, and a
  // legacy status-less record defaults to 'draft'.
  it('carries a non-default status through the record and back', () => {
    const cooking: Draft = { ...draft, status: 'cooking' };
    expect(draftToRecord(cooking).status).toBe('cooking');
    expect(draftFromRecord(draftToRecord(cooking)).status).toBe('cooking');
  });

  it('defaults a status-less legacy record to draft', () => {
    const back = draftFromRecord({
      clientId: draft.id,
      savedAt: draft.savedAt,
      fields: draft.fields,
    });
    expect(back.status).toBe('draft');
  });

  // Wiring (Phase 11b entry point = the drafts store API; no UI yet): a draft
  // saved with a status, reloaded from the store, builds a record carrying it.
  it('wiring: store.save(status) → get → draftToRecord preserves the status', async () => {
    const store = createDraftStore({ dbName: `sync-status-${Math.random()}` });
    const saved = await store.save(draft.fields, undefined, 'ready');
    const reloaded = await store.get(saved.id);
    expect(reloaded?.status).toBe('ready');
    expect(draftToRecord(reloaded!).status).toBe('ready');
  });
});
