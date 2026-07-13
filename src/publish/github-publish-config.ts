// Calendar-publish config: which repo/path the meal-plan .ics is pushed to, and
// whether the feature is on. DEVICE-LOCAL and NON-SECRET (the PAT lives in
// github-token.ts, never here, never in the PDS — see the plan's D8). Mirrors
// the defensive localStorage posture of reach.ts: default is off with zero
// storage, a corrupt value degrades to the default rather than throwing.

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type GithubPublishConfig = {
  enabled: boolean;
  /** `owner/repo`. */
  repo: string;
  /** File path within the repo, Pages-served. */
  path: string;
  branch?: string;
};

const STORAGE_KEY = 'arecipe.calendar-publish.v1';

const DEFAULT: GithubPublishConfig = { enabled: false, repo: '', path: 'meals.ics' };

export type PublishConfigStore = {
  load: () => GithubPublishConfig;
  save: (patch: Partial<GithubPublishConfig>) => GithubPublishConfig;
};

export const createGithubPublishConfig = (
  opts: { storage?: StorageLike } = {},
): PublishConfigStore => {
  const storage = opts.storage ?? window.localStorage;

  const load = (): GithubPublishConfig => {
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return { ...DEFAULT };
    }
    if (raw === null) return { ...DEFAULT };
    try {
      const parsed = JSON.parse(raw) as Partial<GithubPublishConfig>;
      return {
        enabled: parsed.enabled === true,
        repo: typeof parsed.repo === 'string' ? parsed.repo : DEFAULT.repo,
        path: typeof parsed.path === 'string' && parsed.path !== '' ? parsed.path : DEFAULT.path,
        ...(typeof parsed.branch === 'string' && parsed.branch !== '' ? { branch: parsed.branch } : {}),
      };
    } catch {
      return { ...DEFAULT };
    }
  };

  return {
    load,
    save: (patch) => {
      const next = { ...load(), ...patch };
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode: config lives for this page only */
      }
      return next;
    },
  };
};
