// @vitest-environment happy-dom
// Phase 8b: the update toast (blockdoku pattern — updates ask, they don't
// ambush). Behaviors:
// - the toast renders in normal flow with an Update-now action and a
//   dismiss action
// - Update now invokes the apply callback exactly once
// - dismiss removes the toast without applying
import { describe, expect, it } from 'vitest';
import { showUpdateToast } from '../../src/update-toast.js';

describe('showUpdateToast', () => {
  it('renders with update + dismiss actions and applies on demand', () => {
    document.body.innerHTML = '';
    let applied = 0;
    showUpdateToast(() => {
      applied += 1;
    });
    const toast = document.querySelector('[data-testid=update-toast]');
    expect(toast?.textContent).toMatch(/update available/i);
    toast?.querySelector<HTMLButtonElement>('[data-testid=apply-update]')?.click();
    expect(applied).toBe(1);
  });

  it('dismiss removes the toast without applying', () => {
    document.body.innerHTML = '';
    let applied = 0;
    showUpdateToast(() => {
      applied += 1;
    });
    document.querySelector<HTMLButtonElement>('[data-testid=dismiss-update]')?.click();
    expect(document.querySelector('[data-testid=update-toast]')).toBeNull();
    expect(applied).toBe(0);
  });

  it('never stacks two toasts', () => {
    document.body.innerHTML = '';
    showUpdateToast(() => {});
    showUpdateToast(() => {});
    expect(document.querySelectorAll('[data-testid=update-toast]')).toHaveLength(1);
  });
});
