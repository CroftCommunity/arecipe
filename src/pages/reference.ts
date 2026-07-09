// Reference page entry. Static kitchen charts (no auth, no network) — the
// content is built by src/pages/reference-view.ts and wrapped in the shared
// nav shell here. On load, if the URL carries a fragment (e.g. #roasting-meat)
// the browser scrolls to it natively once the section is in the DOM.

import { mountBuildStamp } from '../build-stamp.js';
import { log } from '../log.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';
import { renderReference } from './reference-view.js';

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) return;
  mountShell(app, renderReference());
  void mountBuildStamp(app);
  log.debug('shell', 'mounted', { page: 'reference' });
  void registerServiceWorker();
};

main();
