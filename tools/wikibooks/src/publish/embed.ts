// D15 Phase 9 — attach images at publish. buildEmbed turns a resolved manifest
// entry + an uploaded blob into the record's imagesEmbed; attachEmbeds uploads
// each cached rendition (only on --publish, via the injected PDS) and sets
// record.embed, skipping items that already carry one (idempotent/resumable).
import { join } from 'node:path';
import type { BlobRef, EmbedImage, ImagesEmbed } from './record.ts';
import type { PlanItem } from './publish.ts';
import type { Manifest, ManifestEntry } from '../images/stage.ts';

type ResolvedEntry = Extract<ManifestEntry, { status: 'resolved' }>;

/** Map a resolved manifest entry + its uploaded blob into the record embed. */
export const buildEmbed = (entry: ResolvedEntry, blob: BlobRef): ImagesEmbed => {
  const image: EmbedImage = {
    image: blob,
    alt: entry.alt,
    aspectRatio: { width: entry.width, height: entry.height },
    ...(entry.credit !== undefined ? { credit: entry.credit } : {}),
  };
  return { $type: 'exchange.recipe.recipe#imagesEmbed', images: [image] };
};

export type AttachDeps = {
  manifest: Manifest;
  imagesDir: string;
  pds: { uploadBlob(bytes: Uint8Array, mime: string): Promise<BlobRef> };
  readFile: (path: string) => Uint8Array;
  log?: (msg: string) => void;
};

/**
 * For each create/update plan item with a resolved image and no existing embed,
 * upload the cached rendition and set `value.embed`. Mutates items in place.
 * Idempotent: an item that already carries an embed is skipped (resumable).
 */
export const attachEmbeds = async (
  items: PlanItem[],
  deps: AttachDeps,
): Promise<{ uploaded: number; skipped: number; failed: number }> => {
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of items) {
    if (item.action !== 'create' && item.action !== 'update') continue;
    const entry = deps.manifest[String(item.pageid)];
    if (entry === undefined || entry.status !== 'resolved') continue;
    if (item.value.embed !== undefined) {
      skipped++;
      continue;
    }
    try {
      const bytes = deps.readFile(join(deps.imagesDir, entry.file));
      const blob = await deps.pds.uploadBlob(bytes, entry.mime);
      item.value.embed = buildEmbed(entry, blob);
      uploaded++;
      deps.log?.(`embed ${item.rkey} ← ${entry.file} (${blob.ref.$link})`);
    } catch (err) {
      failed++;
      deps.log?.(`embed FAILED ${item.rkey}: ${(err as Error).message}`);
    }
  }
  return { uploaded, skipped, failed };
};
