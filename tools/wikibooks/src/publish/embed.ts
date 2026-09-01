// D15 Phase 9 — attach images at publish. buildEmbed turns a resolved manifest
// entry + an uploaded blob into the record's imagesEmbed; attachEmbeds uploads
// each cached rendition (only on --publish, via the injected PDS) and sets
// record.embed, skipping items that already carry one (idempotent/resumable).
import { join } from 'node:path';
import type { BlobRef, EmbedImage, ImagesEmbed } from './record.ts';
import type { PlanItem } from './publish.ts';
import { saveManifest, type Manifest, type ManifestEntry } from '../images/stage.ts';

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
  /** Persist the manifest after a blob CID is recorded (so a killed run resumes
   *  without re-uploading). Defaults to writing `imagesDir/manifest.json`. */
  persist?: (manifest: Manifest) => void;
  log?: (msg: string) => void;
};

/**
 * For each create/update plan item with a resolved image and no existing embed,
 * attach `value.embed` — reusing a manifest-recorded blob CID when present, else
 * uploading the cached rendition and recording its CID back into the manifest
 * (persisted). Mutates items in place. Idempotent + resume-cheap: on re-run,
 * already-uploaded blobs are reused (no re-upload) and embedded items are skipped.
 */
export const attachEmbeds = async (
  items: PlanItem[],
  deps: AttachDeps,
): Promise<{ uploaded: number; reused: number; skipped: number; failed: number }> => {
  const persist = deps.persist ?? ((m: Manifest) => saveManifest(deps.imagesDir, m));
  let uploaded = 0;
  let reused = 0;
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
      if (entry.blob !== undefined) {
        item.value.embed = buildEmbed(entry, entry.blob);
        reused++;
        continue;
      }
      const bytes = deps.readFile(join(deps.imagesDir, entry.file));
      const blob = await deps.pds.uploadBlob(bytes, entry.mime);
      entry.blob = blob; // record the CID so a resume skips the re-upload
      persist(deps.manifest);
      item.value.embed = buildEmbed(entry, blob);
      uploaded++;
      deps.log?.(`embed ${item.rkey} ← ${entry.file} (${blob.ref.$link})`);
    } catch (err) {
      failed++;
      deps.log?.(`embed FAILED ${item.rkey}: ${(err as Error).message}`);
    }
  }
  return { uploaded, reused, skipped, failed };
};
