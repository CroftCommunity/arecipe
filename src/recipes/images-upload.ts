// Recipe photo upload (Phase 7). The canvas re-encode is load-bearing for
// privacy: real-world recipe photos carry GPS EXIF (observed in the wild,
// D2) — drawing to a canvas and re-encoding produces clean JPEG bytes with
// no metadata, full-size path included. One blob per image, embedded with
// its aspect ratio (the lexicon's #imagesEmbed shape; thumbnails are the
// CDN's job).

import type { Agent } from '@atproto/api';
import { log } from '../log.js';

export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/** Cap the longest edge, preserve aspect, never upscale. */
export const fitWithin = (
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/** Fail loud before any work: type and size floor for picked files. */
export const validateImageInput = (file: { type: string; size: number }): void => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`that file isn't an image (${file.type || 'unknown type'})`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(
      `image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB)`,
    );
  }
};

export type PreparedImage = { bytes: Uint8Array; width: number; height: number };

/** Decode → downscale → re-encode via canvas. Strips EXIF by construction. */
export const prepareImage = async (file: File): Promise<PreparedImage> => {
  validateImageInput(file);
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas unavailable — cannot process the image');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b === null ? reject(new Error('image re-encode failed')) : resolve(b)),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  log.debug('images', 'prepared', { width, height, bytes: bytes.length });
  return { bytes, width, height };
};

/** The lexicon's blob-ref shape as returned by uploadBlob. */
export type BlobRef = { $type: string; ref: { $link: string }; mimeType: string; size: number };

export const uploadRecipeImage = async (
  agent: Agent,
  prepared: PreparedImage,
): Promise<BlobRef> => {
  log.info('images', 'uploading', { bytes: prepared.bytes.length });
  const res = await agent.com.atproto.repo.uploadBlob(prepared.bytes, {
    encoding: 'image/jpeg',
  });
  const blob = res.data.blob;
  const cid = blob.ref.toString();
  log.info('images', 'uploaded', { cid, size: blob.size });
  return {
    $type: 'blob',
    ref: { $link: cid },
    mimeType: blob.mimeType,
    size: blob.size,
  };
};

/** exchange.recipe.recipe#imagesEmbed with one image + its aspect ratio. */
export const buildImagesEmbed = (
  blobRef: BlobRef,
  prepared: PreparedImage,
  alt = 'Recipe photo',
): Record<string, unknown> => ({
  $type: 'exchange.recipe.recipe#imagesEmbed',
  images: [
    {
      alt,
      image: blobRef,
      aspectRatio: { width: prepared.width, height: prepared.height },
    },
  ],
});
