// User guide page entry (user-guide.html). Static, no auth, no network — the
// content is built by src/pages/user-guide-view.ts and wrapped in the shared nav
// shell here (mirrors reference.ts). After render it mounts the question-box
// helper (built from the rendered sections) and wires highlight-on-arrival so a
// deep link — clicked here or opened cold — lands on the exact section, visibly.

import { mountBuildStamp } from '../build-stamp.js';
import { buildGuideIndex } from '../guide/model.js';
import { mountGuideHelper, wireGuideHighlight } from '../guide/question-box.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';
import { renderUserGuide } from './user-guide-view.js';

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) return;
  const content = renderUserGuide();
  mountShell(app, content);
  void mountBuildStamp(app);

  // Build the section index from the just-rendered guide (drift-proof: the index
  // IS the guide, read back) and mount the question box into its reserved slot.
  const slot = content.querySelector<HTMLElement>('[data-testid="guide-helper-slot"]');
  if (slot !== null) mountGuideHelper(slot, buildGuideIndex(content));
  wireGuideHighlight();

  log.debug('shell', 'mounted', { page: 'user-guide' });
  void registerServiceWorker();
};

main();
