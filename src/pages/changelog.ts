// Changelog page entry (changelog.html). Static, no auth; the content is built by
// src/pages/changelog-view.ts (which fetches ./changelog.json) and wrapped in the
// shared nav shell here (mirrors user-guide.ts).

import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';
import { renderChangelog } from './changelog-view.js';

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) return;
  mountShell(app, renderChangelog());
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'changelog' });
  void registerServiceWorker();
};

main();
