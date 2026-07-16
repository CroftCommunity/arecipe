// @vitest-environment happy-dom
// Account danger zone render logic (plan 2026-07-16-5): the sign-out bubble
// with the meals-reset-style inline two-step confirm, and the GitHub-style
// "Delete all arecipe data" flow — honored copy, type-the-handle challenge,
// the hard browser confirm with the owner's exact wording, PDS-before-local
// wipe order, loud failure. The signed-in mount on Account is proven @live.
import { describe, expect, it, vi } from 'vitest';
import {
  DELETE_COPY,
  HARD_CONFIRM_MESSAGE,
  renderDangerZone,
  type DangerZoneDeps,
} from '../../../src/account/danger-zone.js';

const HANDLE = 'cook.bsky.social';

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const deps = (over: Partial<DangerZoneDeps> = {}): DangerZoneDeps => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  confirmText: () => HANDLE,
  wipePds: vi.fn().mockResolvedValue(0),
  wipeLocal: vi.fn().mockResolvedValue(undefined),
  hardConfirm: vi.fn().mockReturnValue(true),
  reload: vi.fn(),
  ...over,
});

const byTestId = (root: HTMLElement, id: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('renderDangerZone', () => {
  it('renders a bubble with Sign out above the honored copy and the delete button', () => {
    const section = renderDangerZone(deps());
    expect(section.classList.contains('settings-section')).toBe(true);
    const signOut = byTestId(section, 'sign-out');
    const copy = byTestId(section, 'delete-data-copy');
    const del = byTestId(section, 'delete-data');
    expect(signOut?.textContent).toBe('Sign out');
    // The owner's copy, honored: local cache + settings + app.arecipe entries
    // go; exchange.recipe entries stay.
    expect(copy?.textContent).toBe(DELETE_COPY);
    expect(DELETE_COPY).toContain('all local cache and settings');
    expect(DELETE_COPY).toContain('app.arecipe');
    expect(DELETE_COPY).toContain('does not delete exchange.recipe');
    expect(del?.textContent).toBe('Delete all arecipe data');
    expect(del?.classList.contains('delete-data-btn')).toBe(true);
    // Sign out renders before the delete block (top of the bubble).
    expect(
      signOut !== null && del !== null && signOut.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('sign out takes a two-step confirm: cancel restores, confirm signs out then reloads', async () => {
    const d = deps();
    const section = renderDangerZone(d);
    byTestId(section, 'sign-out')?.click();
    // Button swapped for the note + Confirm/Cancel (the meals reset idiom).
    expect(byTestId(section, 'sign-out')).toBeNull();
    expect(section.querySelector('.reset-confirm-note')?.textContent).toContain('Sign out?');
    byTestId(section, 'sign-out-cancel')?.click();
    expect(byTestId(section, 'sign-out')).not.toBeNull();
    expect(d.signOut).not.toHaveBeenCalled();

    byTestId(section, 'sign-out')?.click();
    byTestId(section, 'sign-out-confirm')?.click();
    await flush();
    expect(d.signOut).toHaveBeenCalledOnce();
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it('delete reveals a type-to-confirm challenge gated on the exact handle (@ tolerated)', () => {
    const section = renderDangerZone(deps());
    byTestId(section, 'delete-data')?.click();
    const input = byTestId(section, 'delete-data-input') as HTMLInputElement;
    const confirm = byTestId(section, 'delete-data-confirm') as HTMLButtonElement;
    expect(input).not.toBeNull();
    expect(confirm.disabled).toBe(true);
    // The challenge names the required text.
    expect(byTestId(section, 'delete-data-challenge')?.textContent).toContain(HANDLE);

    input.value = 'cook.bsky';
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(true);

    input.value = HANDLE;
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);

    input.value = ` @${HANDLE} `;
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);

    // Cancel restores the resting state.
    byTestId(section, 'delete-data-cancel')?.click();
    expect(byTestId(section, 'delete-data-input')).toBeNull();
    expect(byTestId(section, 'delete-data')).not.toBeNull();
  });

  it('declining the hard browser confirm aborts: no wipe, nothing deleted', async () => {
    const d = deps({ hardConfirm: vi.fn().mockReturnValue(false) });
    const section = renderDangerZone(d);
    byTestId(section, 'delete-data')?.click();
    const input = byTestId(section, 'delete-data-input') as HTMLInputElement;
    input.value = HANDLE;
    input.dispatchEvent(new Event('input'));
    byTestId(section, 'delete-data-confirm')?.click();
    await flush();
    expect(d.hardConfirm).toHaveBeenCalledWith(HARD_CONFIRM_MESSAGE);
    expect(HARD_CONFIRM_MESSAGE).toBe(
      'Seriously, this permanently deleted all your data for arecipe',
    );
    expect(d.wipePds).not.toHaveBeenCalled();
    expect(d.wipeLocal).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('accepting wipes the PDS first, then local data, then reloads', async () => {
    const order: string[] = [];
    const d = deps({
      wipePds: vi.fn().mockImplementation(() => {
        order.push('pds');
        return Promise.resolve(7);
      }),
      wipeLocal: vi.fn().mockImplementation(() => {
        order.push('local');
        return Promise.resolve();
      }),
      reload: vi.fn().mockImplementation(() => order.push('reload')),
    });
    const section = renderDangerZone(d);
    byTestId(section, 'delete-data')?.click();
    const input = byTestId(section, 'delete-data-input') as HTMLInputElement;
    input.value = HANDLE;
    input.dispatchEvent(new Event('input'));
    byTestId(section, 'delete-data-confirm')?.click();
    await flush();
    expect(order).toEqual(['pds', 'local', 'reload']);
  });

  it('a failed wipe reports loud, keeps the page, and re-enables the confirm', async () => {
    const d = deps({ wipePds: vi.fn().mockRejectedValue(new Error('HTTP 502')) });
    const section = renderDangerZone(d);
    byTestId(section, 'delete-data')?.click();
    const input = byTestId(section, 'delete-data-input') as HTMLInputElement;
    input.value = HANDLE;
    input.dispatchEvent(new Event('input'));
    const confirm = byTestId(section, 'delete-data-confirm') as HTMLButtonElement;
    confirm.click();
    await flush();
    expect(byTestId(section, 'delete-data-status')?.textContent).toMatch(/failed/i);
    expect(byTestId(section, 'delete-data-status')?.textContent).toContain('HTTP 502');
    expect(d.wipeLocal).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
    expect(confirm.disabled).toBe(false);
  });

  it('falls back to the DID as the challenge text while the handle is unresolved', () => {
    const did = 'did:plc:wipeme000000000000000000';
    const section = renderDangerZone(deps({ confirmText: () => did }));
    byTestId(section, 'delete-data')?.click();
    expect(byTestId(section, 'delete-data-challenge')?.textContent).toContain(did);
    const input = byTestId(section, 'delete-data-input') as HTMLInputElement;
    const confirm = byTestId(section, 'delete-data-confirm') as HTMLButtonElement;
    input.value = did;
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);
  });
});
