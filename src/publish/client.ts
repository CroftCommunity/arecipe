// Wires the device-local calendar-publish stack (config + sync-state + token
// provider over the real SW channel) and owns the single clock read (DTSTAMP +
// sync timestamps) so the cores stay clock-free. Both the account section and
// the meals page build one of these.

import type { LocalPlan } from '../recipes/meal-plan-local.js';
import { republishCalendar, type RepublishResult } from './calendar-publish.js';
import { createGithubPublishConfig, type PublishConfigStore } from './github-publish-config.js';
import { createSyncStateStore, type SyncStateStore } from './github-sync-state.js';
import { createSwTokenChannel, createTokenProvider, type TokenProvider } from './github-token.js';

export type CalendarClient = {
  config: PublishConfigStore;
  syncState: SyncStateStore;
  token: TokenProvider;
  /** Regenerate + push the calendar from the current published plans, recording
   * the outcome in sync-state for the D9 chip. Never throws. */
  republish: (listPlans: () => Promise<LocalPlan[]>) => Promise<RepublishResult>;
};

export const createCalendarClient = (
  opts: { now?: () => string } = {},
): CalendarClient => {
  const now = opts.now ?? ((): string => new Date().toISOString());
  const config = createGithubPublishConfig();
  const syncState = createSyncStateStore();
  const token = createTokenProvider({ sw: createSwTokenChannel() });

  const republish = async (listPlans: () => Promise<LocalPlan[]>): Promise<RepublishResult> => {
    syncState.set({ status: 'syncing' });
    const res = await republishCalendar({ config: config.load(), listPlans, token, dtstamp: now() });
    switch (res.status) {
      case 'published':
        syncState.set({ status: 'synced', at: now() });
        break;
      case 'needs-token':
        syncState.set({ status: 'needs-token', at: now() });
        break;
      case 'error':
        syncState.set({ status: 'error', at: now(), message: res.error });
        break;
      case 'skipped':
        // Leave prior state untouched (feature just isn't on).
        break;
    }
    return res;
  };

  return { config, syncState, token, republish };
};
