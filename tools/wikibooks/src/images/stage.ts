// D15 Phase 8B — image manifest stage. Resolves each page's infobox image via
// Commons, caches the rendition bytes under the images dir, and records a
// resumable manifest (resolved w/ credit, or skipped w/ reason). No PDS writes
// here — that's Phase 9 on --publish. Idempotent: pages already in the manifest
// are not re-fetched.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, Resolution } from './commons-client.ts';
import type { BlobRef } from '../publish/record.ts';

export type ImageTarget = { pageid: number; filename: string; alt: string };

export type ManifestEntry =
  | { status: 'resolved'; file: string; mime: string; width: number; height: number; alt: string; credit: ImageCredit; blob?: BlobRef }
  | { status: 'skipped'; reason: string };
export type Manifest = Record<string, ManifestEntry>;

/** Just enough of CommonsClient to inject a fake in tests. */
export type Resolver = { resolve(filename: string): Promise<Resolution> };

export type StageDeps = { commons: Resolver; imagesDir: string; log?: (msg: string) => void };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const manifestPath = (dir: string): string => join(dir, 'manifest.json');

export const loadManifest = (dir: string): Manifest =>
  existsSync(manifestPath(dir)) ? (JSON.parse(readFileSync(manifestPath(dir), 'utf8')) as Manifest) : {};

export const saveManifest = (dir: string, m: Manifest): void => {
  // Deterministic key order without a replacer (a replacer array would drop the
  // entries' own properties — it filters keys recursively).
  const sorted: Manifest = {};
  for (const k of Object.keys(m).sort((a, b) => Number(a) - Number(b))) sorted[k] = m[k]!;
  writeFileSync(manifestPath(dir), JSON.stringify(sorted, null, 2) + '\n');
};

/**
 * Resolve + cache images for `targets`. Returns counts; the manifest + cached
 * renditions live under `imagesDir`. Resumable — re-running skips pages already
 * recorded.
 */
export const stageImages = async (
  deps: StageDeps,
  targets: ImageTarget[],
): Promise<{ resolved: number; skipped: number; alreadyDone: number; manifest: Manifest }> => {
  mkdirSync(deps.imagesDir, { recursive: true });
  const manifest = loadManifest(deps.imagesDir);
  let resolved = 0;
  let skipped = 0;
  let alreadyDone = 0;
  let processed = 0;

  for (const target of targets) {
    const key = String(target.pageid);
    if (manifest[key] !== undefined) {
      alreadyDone++;
      continue;
    }
    const r = await deps.commons.resolve(target.filename);
    if (r.skipped === true) {
      manifest[key] = { status: 'skipped', reason: r.reason };
      skipped++;
      deps.log?.(`skip ${target.filename}: ${r.reason}`);
    } else {
      const file = `${target.pageid}.${EXT[r.mime] ?? 'bin'}`;
      writeFileSync(join(deps.imagesDir, file), r.bytes);
      manifest[key] = { status: 'resolved', file, mime: r.mime, width: r.width, height: r.height, alt: target.alt, credit: r.credit };
      resolved++;
    }
    saveManifest(deps.imagesDir, manifest);
    if (++processed % 25 === 0) deps.log?.(`images: ${resolved} resolved · ${skipped} skipped · ${targets.length - processed - alreadyDone} remaining`);
  }
  return { resolved, skipped, alreadyDone, manifest };
};
