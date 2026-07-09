// Phase 4a: public read path for exchange.recipe.recipe, validated against
// the D4 schema at the boundary. Behaviors (against the RECORDED D2 fixture):
// - listRecords returns typed records with uri/cid/value
// - unknown extra fields are tolerated AND preserved (atproto open-world)
// - a record missing a required field fails loud, naming the field and uri
// - a non-OK PDS response fails loud with the status
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRecipeReader, createRecordReader } from '../../../src/recipes/read.js';

const listFixture = readFileSync(
  new URL('../../fixtures/atproto/listRecords-exchange.recipe.recipe.json', import.meta.url),
  'utf8',
);

// A static mock can't represent "more pages", and the paginating reader follows
// the cursor to the end — so mock bodies must be a TERMINAL page (no cursor).
// terminalList yields one such page (with optional doctoring); the fixture is
// already cursor-less, so the delete is just belt-and-suspenders. Pagination
// across pages is covered by the dedicated cursor tests below.
type ListBody = { records: { uri: string; cid: string; value: Record<string, unknown> }[]; cursor?: string };
const terminalList = (mutate: (b: ListBody) => void = () => {}): string => {
  const body = JSON.parse(listFixture) as ListBody;
  delete body.cursor;
  mutate(body);
  return JSON.stringify(body);
};

const fetchReturning = (status: number, body: string): typeof fetch =>
  (async () =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

const PDS = 'https://morel.us-east.host.bsky.network';
const DID = 'did:plc:26tsx5juuss4yealylyfbj4h';

describe('createRecipeReader', () => {
  it('returns typed records with uri, cid, and validated value', async () => {
    const read = createRecipeReader({ fetchFn: fetchReturning(200, terminalList()) });
    const records = await read({ pds: PDS, did: DID });
    expect(records).toHaveLength(3);
    expect(records[0]?.uri).toMatch(/^at:\/\/did:plc:.+\/exchange\.recipe\.recipe\/.+$/);
    expect(records[0]?.cid).toMatch(/^bafyrei/);
    expect(records[0]?.value.name).toBe('White Chocolate Strawberry Sourdough Sweet Bread');
    expect(Array.isArray(records[0]?.value.ingredients)).toBe(true);
  });

  it('tolerates and preserves unknown extra fields (open-world)', async () => {
    const read = createRecipeReader({
      fetchFn: fetchReturning(200, terminalList((b) => {
        b.records[0]!.value['futureField'] = { anything: true };
      })),
    });
    const records = await read({ pds: PDS, did: DID });
    expect(records[0]?.value['futureField']).toEqual({ anything: true });
  });

  it('fails loud when a required field is missing, naming field and uri', async () => {
    const read = createRecipeReader({
      fetchFn: fetchReturning(200, terminalList((b) => {
        delete b.records[1]!.value['ingredients'];
      })),
    });
    await expect(read({ pds: PDS, did: DID })).rejects.toThrow(/ingredients.*at:\/\/|at:\/\/.*ingredients/);
  });

  it('fails loud on a non-OK PDS response', async () => {
    const read = createRecipeReader({
      fetchFn: fetchReturning(502, '{"error":"UpstreamFailure"}'),
    });
    await expect(read({ pds: PDS, did: DID })).rejects.toThrow(/502/);
  });

  // Phase 4a: version discovery needs EVERY record, but listRecords pages at
  // ~50/100. The reader must follow the cursor and concatenate all pages.
  const rec = (rkey: string, name: string) => ({
    uri: `at://${DID}/exchange.recipe.recipe/${rkey}`,
    cid: 'bafyreiaaa',
    value: { name, text: 't', ingredients: ['i'], instructions: ['s'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  });
  const pagedFetch = (pages: string[]): typeof fetch => {
    let i = 0;
    return (async () => {
      const body = i < pages.length ? pages[i]! : JSON.stringify({ records: [] });
      i += 1;
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  };

  it('follows the cursor and concatenates records across pages', async () => {
    const read = createRecipeReader({
      fetchFn: pagedFetch([
        JSON.stringify({ records: [rec('1', 'A'), rec('2', 'B')], cursor: 'c1' }),
        JSON.stringify({ records: [rec('3', 'C')] }), // no cursor → last page
      ]),
    });
    const records = await read({ pds: PDS, did: DID });
    expect(records.map((r) => r.value.name)).toEqual(['A', 'B', 'C']);
  });

  it('terminates on an empty page even if a cursor is still returned', async () => {
    const read = createRecipeReader({
      fetchFn: pagedFetch([
        JSON.stringify({ records: [rec('1', 'A')], cursor: 'c1' }),
        JSON.stringify({ records: [], cursor: 'c2' }), // empty → stop, don't loop forever
      ]),
    });
    const records = await read({ pds: PDS, did: DID });
    expect(records.map((r) => r.value.name)).toEqual(['A']);
  });
});

describe('createRecordReader (single record, 5d cold links)', () => {
  const getFixture = readFileSync(
    new URL('../../fixtures/atproto/getRecord-exchange.recipe.recipe.json', import.meta.url),
    'utf8',
  );

  it('fetches and validates one record by rkey', async () => {
    const readOne = createRecordReader({ fetchFn: fetchReturning(200, getFixture) });
    const record = await readOne({ pds: PDS, did: DID, rkey: '01JQJ5RW51ZVEW72XN6GSRWC8D' });
    expect(record.uri).toContain('/exchange.recipe.recipe/01JQJ5RW51ZVEW72XN6GSRWC8D');
    expect(record.value.name).toBe('White Chocolate Strawberry Sourdough Sweet Bread');
  });

  it('fails loud when the record is missing', async () => {
    const readOne = createRecordReader({
      fetchFn: fetchReturning(400, '{"error":"RecordNotFound","message":"Could not locate record"}'),
    });
    await expect(readOne({ pds: PDS, did: DID, rkey: 'nope' })).rejects.toThrow(/400/);
  });
});
