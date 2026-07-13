// Publish orchestrator. Behaviors (all deps faked):
//  - disabled / no repo → skipped, no PUT
//  - enabled, no token → needs-token, no PUT
//  - enabled + token → published; PUTs an .ics for the current plan set
//  - delete case → regenerated .ics omits the removed plan's events
//  - putFile throws → error result (never throws to the caller)
import { describe, expect, it, vi } from 'vitest';
import { republishCalendar, type RepublishDeps } from '../../../src/publish/calendar-publish.js';
import type { PutFileArgs } from '../../../src/publish/github-contents.js';
import type { GithubPublishConfig } from '../../../src/publish/github-publish-config.js';
import type { TokenProvider } from '../../../src/publish/github-token.js';
import type { LocalPlan, LocalSlot } from '../../../src/recipes/meal-plan-local.js';

const DTSTAMP = '2026-07-13T12:00:00.000Z';

const filled = (name: string): LocalSlot => ({ recipe: { uri: 'at://x/y/1', cid: 'bafy', name } });
const planWith = (id: string, name: string, startDate: string): LocalPlan => {
  const days: LocalSlot[] = Array.from({ length: 7 }, () => ({}));
  days[0] = filled(name);
  return { id, name: id, weeks: [{ repeat: 1, days }], startDate, updatedAt: DTSTAMP };
};

const cfg = (over: Partial<GithubPublishConfig> = {}): GithubPublishConfig => ({
  enabled: true,
  repo: 'me/cal',
  path: 'meals.ics',
  ...over,
});

const tokenWith = (has: boolean): TokenProvider => ({
  hasToken: async () => has,
  set: async () => undefined,
  clear: async () => undefined,
  authorizedFetch: async () => new Response('ok'),
});

const deps = (over: Partial<RepublishDeps> = {}): RepublishDeps => ({
  config: cfg(),
  listPlans: async () => [planWith('pa', 'Soup', '2026-07-13')],
  token: tokenWith(true),
  dtstamp: DTSTAMP,
  putFileFn: vi.fn(async () => ({ commitSha: 'c1', contentSha: 'b1' })),
  ...over,
});

describe('republishCalendar', () => {
  it('skips when disabled', async () => {
    const putFileFn = vi.fn(async () => ({ commitSha: 'c', contentSha: 'b' }));
    const res = await republishCalendar(deps({ config: cfg({ enabled: false }), putFileFn }));
    expect(res).toEqual({ status: 'skipped' });
    expect(putFileFn).not.toHaveBeenCalled();
  });

  it('skips when no repo is configured', async () => {
    const res = await republishCalendar(deps({ config: cfg({ repo: '' }) }));
    expect(res.status).toBe('skipped');
  });

  it('reports needs-token when enabled but no token is available', async () => {
    const putFileFn = vi.fn(async () => ({ commitSha: 'c', contentSha: 'b' }));
    const res = await republishCalendar(deps({ token: tokenWith(false), putFileFn }));
    expect(res).toEqual({ status: 'needs-token' });
    expect(putFileFn).not.toHaveBeenCalled();
  });

  it('publishes an .ics for the current plan set', async () => {
    let seen: PutFileArgs | undefined;
    const putFileFn = vi.fn(async (a: PutFileArgs) => {
      seen = a;
      return { commitSha: 'c9', contentSha: 'b9' };
    });
    const res = await republishCalendar(deps({ putFileFn }));
    expect(res).toEqual({ status: 'published', commitSha: 'c9' });
    expect(seen?.repo).toBe('me/cal');
    expect(seen?.path).toBe('meals.ics');
    expect(seen?.contentUtf8).toContain('BEGIN:VCALENDAR');
    expect(seen?.contentUtf8).toContain('SUMMARY:Soup');
  });

  it('regenerates from the current set so a deleted plan drops out', async () => {
    // "Before": two plans. "After delete": listPlans returns only pa.
    let seen: PutFileArgs | undefined;
    const putFileFn = vi.fn(async (a: PutFileArgs) => {
      seen = a;
      return { commitSha: 'c', contentSha: 'b' };
    });
    const res = await republishCalendar(
      deps({
        listPlans: async () => [planWith('pa', 'Keep', '2026-07-13')],
        putFileFn,
      }),
    );
    expect(res.status).toBe('published');
    expect(seen?.contentUtf8).toContain('SUMMARY:Keep');
    expect(seen?.contentUtf8).not.toContain('pb-'); // removed plan's UID prefix absent
  });

  it('returns an error result when putFile throws (never throws)', async () => {
    const res = await republishCalendar(
      deps({
        putFileFn: vi.fn(async () => {
          throw new Error('HTTP 500');
        }),
      }),
    );
    expect(res).toMatchObject({ status: 'error' });
    expect((res as { error: string }).error).toContain('HTTP 500');
  });
});
