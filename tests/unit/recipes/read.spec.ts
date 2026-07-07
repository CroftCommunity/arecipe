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

const fetchReturning = (status: number, body: string): typeof fetch =>
  (async () =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;

const PDS = 'https://morel.us-east.host.bsky.network';
const DID = 'did:plc:26tsx5juuss4yealylyfbj4h';

describe('createRecipeReader', () => {
  it('returns typed records with uri, cid, and validated value', async () => {
    const read = createRecipeReader({ fetchFn: fetchReturning(200, listFixture) });
    const records = await read({ pds: PDS, did: DID });
    expect(records).toHaveLength(3);
    expect(records[0]?.uri).toMatch(/^at:\/\/did:plc:.+\/exchange\.recipe\.recipe\/.+$/);
    expect(records[0]?.cid).toMatch(/^bafyrei/);
    expect(records[0]?.value.name).toBe('White Chocolate Strawberry Sourdough Sweet Bread');
    expect(Array.isArray(records[0]?.value.ingredients)).toBe(true);
  });

  it('tolerates and preserves unknown extra fields (open-world)', async () => {
    const doctored = JSON.parse(listFixture) as {
      records: { value: Record<string, unknown> }[];
    };
    doctored.records[0]!.value['futureField'] = { anything: true };
    const read = createRecipeReader({
      fetchFn: fetchReturning(200, JSON.stringify(doctored)),
    });
    const records = await read({ pds: PDS, did: DID });
    expect(records[0]?.value['futureField']).toEqual({ anything: true });
  });

  it('fails loud when a required field is missing, naming field and uri', async () => {
    const doctored = JSON.parse(listFixture) as {
      records: { uri: string; value: Record<string, unknown> }[];
    };
    delete doctored.records[1]!.value['ingredients'];
    const read = createRecipeReader({
      fetchFn: fetchReturning(200, JSON.stringify(doctored)),
    });
    await expect(read({ pds: PDS, did: DID })).rejects.toThrow(/ingredients.*at:\/\/|at:\/\/.*ingredients/);
  });

  it('fails loud on a non-OK PDS response', async () => {
    const read = createRecipeReader({
      fetchFn: fetchReturning(502, '{"error":"UpstreamFailure"}'),
    });
    await expect(read({ pds: PDS, did: DID })).rejects.toThrow(/502/);
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
