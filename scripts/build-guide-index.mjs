// Build-time guide index generator + D2 anchor-validity gate.
//
// The guide's source is a DOM builder (src/pages/user-guide-view.ts), so there
// is no static HTML to parse: we bundle the build-only entry with esbuild, run
// it under happy-dom to RENDER the guide, and build the section index from that
// render with the very same code the browser uses (src/guide/model.ts). Every
// emitted anchor is checked against the rendered guide's real ids — the build
// FAILS if any is missing (D2). The serialized index is deterministic, so
// dist/guide-index.json is byte-stable across rebuilds from identical input.
import { buildSync } from 'esbuild';
import { Window } from 'happy-dom';

// DOM globals the bundled guide code reads at runtime (esbuild leaves them as
// free globals for platform:'browser'). Swapped in around the render and
// restored after, so this is safe to call from a test harness that already has
// its own DOM globals.
const DOM_GLOBALS = [
  'window',
  'document',
  'Node',
  'NodeFilter',
  'Text',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
];

const bundleBuildEntry = () =>
  buildSync({
    entryPoints: ['src/guide/build-entry.ts'],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
  }).outputFiles[0].text;

/**
 * Render the guide, build + validate its index, and return the serialized JSON.
 * Throws (failing the build) if any emitted anchor is absent from the render.
 * @returns {Promise<{ sections: object[], serialized: string }>}
 */
export const generateGuideIndex = async () => {
  const code = bundleBuildEntry();
  const win = new Window();
  const saved = {};
  for (const key of DOM_GLOBALS) {
    saved[key] = globalThis[key];
    globalThis[key] = win[key];
  }
  try {
    const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    const root = mod.renderUserGuide();
    const sections = mod.buildGuideIndex(root);
    const ids = mod.collectAnchorIds(root);
    mod.assertValidAnchors(sections, ids); // D2: hard gate — throws → build fails
    return { sections, serialized: mod.serializeGuideIndex(sections) };
  } finally {
    for (const key of DOM_GLOBALS) globalThis[key] = saved[key];
  }
};
