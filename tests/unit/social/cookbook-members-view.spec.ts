// @vitest-environment happy-dom
// Phase 6: the cookbook-members view extracted from cookbook.ts so Account can
// render the same list. Pure render logic is unit-tested here (rows, source
// badges, empty state, member→author mapping); the signed-in mount on Account
// is exercised @live.
import type { Agent } from '@atproto/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  membersToAuthors,
  mountMembersList,
  renderMembersList,
} from '../../../src/social/cookbook-members-view.js';
import type { CookbookMember, ReachConfig } from '../../../src/social/cookbook.js';
import { createCookFollowsLocal } from '../../../src/social/cook-follows-local.js';

const member = (over: Partial<CookbookMember>): CookbookMember => ({
  did: 'did:plc:a0000000000000000000000',
  sources: ['follow'],
  ...over,
});

describe('renderMembersList', () => {
  it('renders a row per member with a handle link + source badge', () => {
    const members = [
      member({ did: 'did:plc:a', sources: ['follow'], handle: 'a.example.com' }),
      member({ did: 'did:plc:b', sources: ['starter'] }),
    ];
    const authors = [
      { handle: 'a.example.com', did: 'did:plc:a' },
      { handle: 'b.example.com', did: 'did:plc:b' },
    ];
    const list = renderMembersList(members, authors);
    expect(list.dataset['testid']).toBe('cookbook-members');
    const rows = list.querySelectorAll('[data-testid="cookbook-member"]');
    expect(rows).toHaveLength(2);

    const firstLink = rows[0]!.querySelector('a.friend-link')!;
    expect(firstLink.textContent).toBe('a.example.com');
    expect(firstLink.getAttribute('href')).toContain('a.example.com');
    // Source badge: the strongest source wins its human label.
    expect(rows[0]!.querySelector('.chip')!.textContent).toBe('following');
    expect(rows[1]!.querySelector('.chip')!.textContent).toBe('starter');
  });

  it('shows an empty state when there are no members', () => {
    const list = renderMembersList([], []);
    expect(list.textContent).toContain('no cooks yet');
    expect(list.querySelectorAll('[data-testid="cookbook-member"]')).toHaveLength(0);
  });

  it('badges an added (cook-follow) member and renders a per-row unfollow', () => {
    const unfollowed: string[] = [];
    const members = [
      member({ did: 'did:plc:added', sources: ['added'], handle: 'added.cook' }),
      member({ did: 'did:plc:starter', sources: ['starter'], handle: 'starter.cook' }),
    ];
    const authors = [
      { handle: 'added.cook', did: 'did:plc:added' },
      { handle: 'starter.cook', did: 'did:plc:starter' },
    ];
    const list = renderMembersList(members, authors, { onUnfollow: (did) => unfollowed.push(did) });
    const rows = list.querySelectorAll('[data-testid="cookbook-member"]');

    // The added member wears the 'added' badge and carries an unfollow control.
    expect(rows[0]!.querySelector('.chip')!.textContent).toBe('added');
    const unfollow = rows[0]!.querySelector<HTMLButtonElement>('[data-testid="unfollow-cook"]');
    expect(unfollow).not.toBeNull();
    unfollow!.click();
    expect(unfollowed).toEqual(['did:plc:added']);

    // A non-added member (starter) shows no unfollow control.
    expect(rows[1]!.querySelector('[data-testid="unfollow-cook"]')).toBeNull();
  });

  it('added takes source-badge priority after starter, before follow', () => {
    // A member named by both starter and added shows the higher-priority 'starter';
    // one named by both added and follow shows 'added'.
    const list = renderMembersList(
      [
        member({ did: 'did:plc:x', sources: ['follow', 'added'], handle: 'x.cook' }),
      ],
      [{ handle: 'x.cook', did: 'did:plc:x' }],
    );
    expect(list.querySelector('.chip')!.textContent).toBe('added');
  });
});

describe('membersToAuthors', () => {
  it('maps a member that already carries a handle straight through (no network)', async () => {
    const authors = await membersToAuthors([
      member({ did: 'did:plc:a', handle: 'a.example.com' }),
    ]);
    expect(authors).toEqual([{ handle: 'a.example.com', did: 'did:plc:a' }]);
  });
});

// ADDED-source-only config keeps the wiring test focused on cook follows (no
// starter/bsky-graph fetches). listRecords for the cookFollow collection is the
// only PDS read; follow/unfollow go through the injected agent.
const ADDED_ONLY: ReachConfig = { starters: false, added: true, follows: false, followers: false };

/** A fake PDS + agent whose cookFollow records live in an in-memory set, so
 *  list → follow → unfollow round-trips hermetically. rkey == subject. */
const fakeBackend = () => {
  const published = new Set<string>();
  const createRecord = vi.fn(async (arg: { record: { subject: string } }) => {
    published.add(arg.record.subject);
    return { data: { uri: `at://did:me/app.arecipe.cookFollow/${arg.record.subject}`, cid: 'c' } };
  });
  const deleteRecord = vi.fn(async (arg: { rkey: string }) => {
    published.delete(arg.rkey);
    return {};
  });
  const agent = { did: 'did:me', com: { atproto: { repo: { createRecord, deleteRecord } } } } as unknown as Agent;
  const fetchFn = (async (url: string) => {
    if (url.includes('app.arecipe.cookFollow')) {
      const records = [...published].map((s) => ({
        uri: `at://did:me/app.arecipe.cookFollow/${s}`,
        value: { subject: s, createdAt: 't' },
      }));
      return { ok: true, status: 200, json: async () => ({ records }) };
    }
    return { ok: true, status: 200, json: async () => ({ records: [], followers: [] }) };
  }) as unknown as typeof fetch;
  return { published, createRecord, deleteRecord, agent, fetchFn };
};

const YOU = { did: 'did:me', pds: 'https://pds.test' };

describe('mountMembersList — cook-follow wiring', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('add follows a cook (local + public record) → badged row + per-row unfollow', async () => {
    const back = fakeBackend();
    vi.stubGlobal('fetch', back.fetchFn);
    const container = document.createElement('div');
    await mountMembersList(container, YOU, ADDED_ONLY, {
      agent: back.agent,
      fetchFn: back.fetchFn,
      resolver: async (handle) => ({ did: 'did:plc:new', handle }),
    });
    // Only "you" is a member yet — no added cook, so no unfollow control.
    expect(container.querySelector('[data-testid="unfollow-cook"]')).toBeNull();

    // Follow via the add panel.
    container.querySelector<HTMLInputElement>('[data-testid="add-cook-input"]')!.value = 'new.cook';
    container.querySelector('[data-testid="add-cook-panel"] form')!.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="unfollow-cook"]')).not.toBeNull();
    });
    // The added cook's row wears the 'added' badge + an unfollow control.
    const row = container.querySelector('[data-testid="unfollow-cook"]')!.closest('[data-testid="cookbook-member"]')!;
    expect(row.querySelector('.chip')!.textContent).toBe('added');
    // A public record was written; the follow is durable locally too.
    expect(back.createRecord).toHaveBeenCalledTimes(1);
    expect(createCookFollowsLocal().has('did:plc:new')).toBe(true);
    // Published → no D6 offer.
    expect(container.querySelector('[data-testid="publish-offer"]')).toBeNull();

    // Unfollow → the record is deleted and the added row disappears.
    row.querySelector<HTMLButtonElement>('[data-testid="unfollow-cook"]')!.click();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="unfollow-cook"]')).toBeNull();
    });
    expect(back.deleteRecord).toHaveBeenCalledTimes(1);
    expect(createCookFollowsLocal().has('did:plc:new')).toBe(false);
  });

  it('offers local-only follows for publish (D6), then publishes them', async () => {
    // A follow saved locally with no matching PDS record (e.g. followed signed out).
    createCookFollowsLocal().add({ did: 'did:plc:seed', handle: 'seed.cook' });
    const back = fakeBackend();
    vi.stubGlobal('fetch', back.fetchFn);
    const container = document.createElement('div');
    await mountMembersList(container, YOU, ADDED_ONLY, { agent: back.agent, fetchFn: back.fetchFn });

    // The D6 offer surfaces the local-only follow by handle.
    const offer = container.querySelector('[data-testid="publish-offer"]')!;
    expect(offer).not.toBeNull();
    expect(offer.textContent).toContain('seed.cook');

    // Publish → a record is written and the offer disappears.
    container.querySelector<HTMLButtonElement>('[data-testid="publish-follows"]')!.click();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="publish-offer"]')).toBeNull();
    });
    expect(back.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'app.arecipe.cookFollow' }),
    );
    expect(back.published.has('did:plc:seed')).toBe(true);
  });

  it('dismisses the publish offer without publishing (D6 is not nagging)', async () => {
    createCookFollowsLocal().add({ did: 'did:plc:seed', handle: 'seed.cook' });
    const back = fakeBackend();
    vi.stubGlobal('fetch', back.fetchFn);
    const container = document.createElement('div');
    await mountMembersList(container, YOU, ADDED_ONLY, { agent: back.agent, fetchFn: back.fetchFn });

    expect(container.querySelector('[data-testid="publish-offer"]')).not.toBeNull();
    container.querySelector<HTMLButtonElement>('[data-testid="publish-dismiss"]')!.click();
    expect(container.querySelector('[data-testid="publish-offer"]')).toBeNull();
    expect(back.createRecord).not.toHaveBeenCalled();
  });
});
