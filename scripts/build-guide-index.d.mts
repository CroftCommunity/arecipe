// Hand-written declarations for scripts/build-guide-index.mjs — build tooling
// stays plain .mjs (Node 22 runs it directly from build.mjs), while the
// typechecked vitest specs import it through these types.
import type { GuideSection } from '../src/guide/model.js';

export declare const generateGuideIndex: () => Promise<{
  sections: GuideSection[];
  serialized: string;
}>;
