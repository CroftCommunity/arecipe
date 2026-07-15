// @vitest-environment happy-dom
// Phase 6: the cookbook-members view extracted from cookbook.ts so Account can
// render the same list. Pure render logic is unit-tested here (rows, source
// badges, empty state, member→author mapping); the signed-in mount on Account
// is exercised @live.
import { describe, expect, it } from 'vitest';
import {
  membersToAuthors,
  renderMembersList,
} from '../../../src/social/cookbook-members-view.js';
import type { CookbookMember } from '../../../src/social/cookbook.js';

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
