// Deterministic JSON: object keys sorted recursively so the same logical value
// always serializes to byte-identical text. This is what makes ir_sha256 and
// raw_sha256 stable across runs and machines — the transform stage's
// determinism guarantee (D5–D8) rests on it.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const sortValue = (value: unknown): Json => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object') {
    const out: { [k: string]: Json } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue; // omit undefined, never emit `null` for it
      out[key] = sortValue(v);
    }
    return out;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  throw new Error(`canonicalJson: unserializable value of type ${typeof value}`);
};

/** Canonical, sorted-key JSON with no trailing newline. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortValue(value));

/** Canonical JSON pretty-printed (2-space) — for human-readable plan/summary files. */
export const canonicalJsonPretty = (value: unknown): string =>
  JSON.stringify(sortValue(value), null, 2);
