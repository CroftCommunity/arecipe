import { createHash } from 'node:crypto';

/** SHA-256 hex of a UTF-8 string. Used for raw_sha256 and ir_sha256. */
export const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');
