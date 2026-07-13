// Calendar-publish config store: device-local, non-secret, defensive.
import { describe, expect, it } from 'vitest';
import { createGithubPublishConfig } from '../../../src/publish/github-publish-config.js';

const memStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('createGithubPublishConfig', () => {
  it('defaults to disabled with a meals.ics path and no storage', () => {
    const storage = memStorage();
    expect(createGithubPublishConfig({ storage }).load()).toEqual({
      enabled: false,
      repo: '',
      path: 'meals.ics',
    });
    expect(storage.map.size).toBe(0);
  });

  it('persists a saved patch and merges on next save', () => {
    const storage = memStorage();
    const store = createGithubPublishConfig({ storage });
    store.save({ enabled: true, repo: 'me/cal' });
    expect(createGithubPublishConfig({ storage }).load()).toMatchObject({
      enabled: true,
      repo: 'me/cal',
      path: 'meals.ics',
    });
    store.save({ path: 'calendars/meals.ics' });
    expect(store.load()).toMatchObject({ enabled: true, repo: 'me/cal', path: 'calendars/meals.ics' });
  });

  it('degrades a corrupt value to the default (off)', () => {
    const storage = memStorage();
    storage.setItem('arecipe.calendar-publish.v1', '{not json');
    expect(createGithubPublishConfig({ storage }).load().enabled).toBe(false);
  });
});
