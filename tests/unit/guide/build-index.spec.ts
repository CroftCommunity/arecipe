// @vitest-environment node
// RUN-GUIDE-HELPER Phase 1/2 — the real build path: scripts/build-guide-index.mjs
// bundles the guide with esbuild, renders it under happy-dom, builds the index,
// and runs the D2 anchor-validity gate. This exercises the exact code
// scripts/build.mjs uses to emit dist/guide-index.json, not just the pure core.
import { describe, expect, it } from 'vitest';
import { generateGuideIndex } from '../../../scripts/build-guide-index.mjs';

describe('generateGuideIndex — build-time generation + D2 gate', () => {
  it('renders the guide and emits a valid, non-empty, well-formed index', async () => {
    const { sections, serialized } = await generateGuideIndex();
    expect(sections.length).toBeGreaterThanOrEqual(14);
    expect(sections.every((s) => String(s.anchor).startsWith('guide-entry-'))).toBe(true);
    expect(sections.every((s) => s.title.length > 0 && s.text.length > 0)).toBe(true);
    expect(JSON.parse(serialized)).toHaveLength(sections.length);
  });

  it('building twice from identical input produces byte-identical output (test 5)', async () => {
    const a = await generateGuideIndex();
    const b = await generateGuideIndex();
    expect(a.serialized).toBe(b.serialized);
  });
});
