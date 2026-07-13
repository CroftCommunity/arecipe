// The calendar-publish orchestrator: the single routine both triggers (publish a
// plan, delete a published plan) call. The .ics is a PURE FUNCTION of the current
// published-plan set, so this always regenerates the whole file from
// `listPlans()` and PUTs it in place — idempotent, self-healing, and delete-safe
// (a removed plan's events simply vanish from the regenerated file). Pure
// orchestration over injected deps: no DOM, no direct storage, no clock.

import { buildMealPlanIcs } from '../recipes/ics.js';
import type { LocalPlan } from '../recipes/meal-plan-local.js';
import { putFile } from './github-contents.js';
import type { GithubPublishConfig } from './github-publish-config.js';
import type { TokenProvider } from './github-token.js';

export type RepublishResult =
  | { status: 'skipped' } // feature off, or no repo configured
  | { status: 'needs-token' } // enabled but the SW has no token (evicted, not remembered)
  | { status: 'published'; commitSha: string | undefined }
  | { status: 'error'; error: string };

export type RepublishDeps = {
  config: GithubPublishConfig;
  listPlans: () => Promise<LocalPlan[]>;
  token: TokenProvider;
  /** ISO UTC instant for the events' DTSTAMP (the one clock read, at the edge). */
  dtstamp: string;
  /** Injectable for tests; defaults to the real Contents client. */
  putFileFn?: typeof putFile;
};

/** Regenerate the aggregate .ics from the current published plans and PUT it to
 * the configured repo/path. Never throws — a calendar failure must not break the
 * PDS operation that triggered it; the caller reflects the result in the D9
 * status chip. */
export const republishCalendar = async (deps: RepublishDeps): Promise<RepublishResult> => {
  const { config } = deps;
  if (!config.enabled || config.repo === '') return { status: 'skipped' };
  if (!(await deps.token.hasToken())) return { status: 'needs-token' };

  try {
    const plans = await deps.listPlans();
    const ics = buildMealPlanIcs(plans, { dtstamp: deps.dtstamp });
    const put = deps.putFileFn ?? putFile;
    const { commitSha } = await put({
      repo: config.repo,
      path: config.path,
      ...(config.branch !== undefined ? { branch: config.branch } : {}),
      contentUtf8: ics,
      message: 'chore: update meal-plan calendar',
      fetchFn: deps.token.authorizedFetch,
    });
    return { status: 'published', commitSha };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
};
