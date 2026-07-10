// Draft ↔ PDS sync (Phase 8): app.arecipe.draft records give in-progress
// work eviction survival. PUBLIC by nature (accepted decision — the editor
// discloses it). The local store (drafts-local) stays the source of truth
// for editing; the PDS copy is the backup. clientId correlates the two.

import type { Agent } from '@atproto/api';
import { log } from '../log.js';
import type { Draft, DraftStatus } from './drafts-local.js';
import type { EditorFields } from './write.js';

export const DRAFT_COLLECTION = 'app.arecipe.draft';

export type DraftRecord = {
  $type: typeof DRAFT_COLLECTION;
  status: DraftStatus;
  clientId: string;
  fields: EditorFields;
  savedAt: string;
};

export const draftToRecord = (draft: Draft): DraftRecord => ({
  $type: DRAFT_COLLECTION,
  status: draft.status,
  clientId: draft.id,
  fields: draft.fields,
  savedAt: draft.savedAt,
});

const STATUSES: readonly DraftStatus[] = ['draft', 'cooking', 'ready'];

export const draftFromRecord = (record: Record<string, unknown>): Draft => {
  const clientId = record['clientId'];
  const fields = record['fields'];
  const savedAt = record['savedAt'];
  if (typeof clientId !== 'string' || typeof savedAt !== 'string' || typeof fields !== 'object' || fields === null) {
    throw new Error('not an app.arecipe.draft: clientId/fields/savedAt missing');
  }
  // Read-tolerate: an unknown/absent status (legacy or a future value) reads as
  // 'draft' rather than erroring — the settable set is draft|cooking|ready.
  const raw = record['status'];
  const status: DraftStatus = STATUSES.includes(raw as DraftStatus) ? (raw as DraftStatus) : 'draft';
  return { id: clientId, savedAt, fields: fields as EditorFields, status };
};

/** rkey = clientId-derived (stable per draft) so re-saves overwrite. rkeys
 * forbid some UUID chars? No — a-z0-9 and '-' are legal; UUIDs qualify. */
const rkeyOf = (draft: Draft): string => draft.id;

export const syncDraftToPds = async (agent: Agent, draft: Draft): Promise<void> => {
  const did = agent.did;
  if (did === undefined) throw new Error('no signed-in account to sync drafts to');
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: DRAFT_COLLECTION,
    rkey: rkeyOf(draft),
    record: draftToRecord(draft),
  });
  log.info('drafts', 'synced to PDS', { id: draft.id });
};

export const removeDraftFromPds = async (agent: Agent, draftId: string): Promise<void> => {
  const did = agent.did;
  if (did === undefined) return;
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: DRAFT_COLLECTION,
      rkey: draftId,
    });
    log.info('drafts', 'removed from PDS', { id: draftId });
  } catch (err) {
    // Absent remote copy is fine (draft may never have synced).
    log.debug('drafts', 'PDS remove skipped', { id: draftId, error: String(err) });
  }
};

/** Pull the account's synced drafts (public read of own repo). */
export const listPdsDrafts = async (pds: string, did: string): Promise<Draft[]> => {
  const res = await fetch(
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${DRAFT_COLLECTION}&limit=100`,
  );
  if (!res.ok) throw new Error(`draft list failed (HTTP ${res.status})`);
  const body = (await res.json()) as { records: { value: Record<string, unknown> }[] };
  const drafts: Draft[] = [];
  for (const record of body.records) {
    try {
      drafts.push(draftFromRecord(record.value));
    } catch (err) {
      log.warn('drafts', 'skipping malformed PDS draft', { error: String(err) });
    }
  }
  return drafts;
};
