// User guide page entry (user-guide.html). Static, no auth, no network — the
// content is built by src/pages/user-guide-view.ts and wrapped in the shared nav
// shell here (mirrors reference.ts).

import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';
import { renderUserGuide } from './user-guide-view.js';

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) return;
  mountShell(app, renderUserGuide());
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'user-guide' });
  void registerServiceWorker();
};

main();
