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
});

describe('membersToAuthors', () => {
  it('maps a member that already carries a handle straight through (no network)', async () => {
    const authors = await membersToAuthors([
      member({ did: 'did:plc:a', handle: 'a.example.com' }),
    ]);
    expect(authors).toEqual([{ handle: 'a.example.com', did: 'did:plc:a' }]);
  });
});
