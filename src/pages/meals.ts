// Meals planner page (Phase 1: route skeleton). A real, reachable document that
// mounts the shared shell and shows the planner heading. The week builder,
// tap-to-place, the palette, the calendar view, and PDS sync arrive in later
// phases — this phase just makes the route real, built, and precached. No auth
// needed yet: the planner works signed-out (local-first), so there is no
// bootSession here until the store and sync land.

import { mountBuildStamp } from '../build-stamp.js';
import { mountShell } from '../nav.js';
import { registerServiceWorker } from '../sw-register.js';

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const main = (): void => {
  const app = document.getElementById('app');
  if (app === null) throw new Error('shell mount point #app missing');

  const content = el('section', 'panel');
  content.append(el('h2', 'section-title', 'Meals'));
  content.append(
    el('p', 'status', 'Plan your week — the planner is coming together over the next few builds.'),
  );

  mountShell(app, content);
  void mountBuildStamp(app);
  void registerServiceWorker();
};

main();
