// Build-only entry point. scripts/build-guide-index.mjs bundles this with
// esbuild and runs it under happy-dom to render the guide, generate the section
// index (dist/guide-index.json), and enforce the D2 anchor-validity gate. It
// only re-exports — the logic lives in the browser-shared modules, so build-time
// and runtime derive the index from exactly the same code.
export { renderUserGuide } from '../pages/user-guide-view.js';
export {
  assertValidAnchors,
  buildGuideIndex,
  collectAnchorIds,
  serializeGuideIndex,
} from './model.js';
