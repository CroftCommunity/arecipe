// @vitest-environment happy-dom
// Signed releases Phase 4 (RED first): the Account "Release & version" panel.
// All states from injected deps; honest copy (the interim key is NAMED
// interim; state strings name exactly what was checked); the pin toggle
// writes/clears the device-local config and renders `version locked at v<X>`;
// the migrated check-updates control keeps its testids and goes INERT while
// pinned (no reg.update(), no upgrade availability anywhere — D4).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createReleaseConfig, type ReleaseConfigStore } from '../../../src/release/config.js';
import { renderReleasePanel, type ReleasePanelDeps } from '../../../src/release/panel.js';
import type { VerifyOutcome } from '../../../src/release/verify.js';

const MANIFEST = {
  buildNumber: 7,
  version: '2026.07.16-run1',
  builtAt: '2026-07-16T12:00:00Z',
  files: {},
  pubkeyFingerprint: 'fp',
  sig: 's',
};
const RUNNING = { version: '2026.07.16-run1', buildNumber: 7 };

const freshConfig = (): ReleaseConfigStore => createReleaseConfig({ dbName: `p-${Math.random()}` });

const deps = (over: Partial<ReleasePanelDeps> = {}): ReleasePanelDeps => ({
  config: freshConfig(),
  check: () => Promise.resolve<VerifyOutcome>({ state: 'verified', manifest: MANIFEST }),
  runningMeta: () => Promise.resolve(RUNNING),
  buildInfo: () =>
    Promise.resolve({
      version: RUNNING.version,
      builtAt: MANIFEST.builtAt,
      mainBytes: 10_240,
      mainGzipBytes: 4_096,
    }),
  updateRegistration: () => Promise.resolve(undefined),
  notifyConfigChanged: () => {},
  ...over,
});

const settle = () => new Promise((r) => setTimeout(r, 0));
const mount = async (d: ReleasePanelDeps) => {
  const panel = renderReleasePanel(d);
  document.body.replaceChildren(panel);
  for (let i = 0; i < 10; i++) await settle();
  return panel;
};
const text = (panel: HTMLElement, testid: string) =>
  panel.querySelector(`[data-testid=${testid}]`)?.textContent ?? '';

describe('renderReleasePanel states (acceptance 2)', () => {
  it('verified: names the interim key and the exact scope checked', async () => {
    const panel = await mount(deps());
    const state = text(panel, 'release-state');
    expect(state).toMatch(/verified/i);
    expect(state).toMatch(/interim/i);
    expect(state).toMatch(/signature/i);
    expect(state).toMatch(/build number|version/i);
  });

  it('unsigned: honest, and normal off-production', async () => {
    const panel = await mount(
      deps({
        check: () =>
          Promise.resolve<VerifyOutcome>({
            state: 'unsigned',
            manifest: { ...MANIFEST, sig: null },
          }),
      }),
    );
    expect(text(panel, 'release-state')).toMatch(/unsigned/i);
  });

  it('invalid: loud, carries the reason', async () => {
    const panel = await mount(
      deps({
        check: () => Promise.resolve<VerifyOutcome>({ state: 'invalid', reason: 'bad-signature' }),
      }),
    );
    const state = text(panel, 'release-state');
    expect(state).toMatch(/failed|invalid/i);
    expect(state).toMatch(/bad-signature/);
  });

  it("couldn't check: fetch failure is neither verified nor scary", async () => {
    const panel = await mount(
      deps({
        check: () =>
          Promise.resolve<VerifyOutcome>({ state: 'unchecked', reason: 'fetch-failed' }),
      }),
    );
    expect(text(panel, 'release-state')).toMatch(/couldn.t check/i);
  });

  it('no pinned key: "signing not yet enabled", not an error', async () => {
    const panel = await mount(
      deps({
        check: () =>
          Promise.resolve<VerifyOutcome>({ state: 'unchecked', reason: 'no-pinned-key' }),
      }),
    );
    expect(text(panel, 'release-state')).toMatch(/not yet enabled/i);
  });

  it('stale-mismatch: a racing deploy reads as quiet, not as an attack', async () => {
    const panel = await mount(
      deps({
        check: () => Promise.resolve<VerifyOutcome>({ state: 'stale-mismatch', manifest: MANIFEST }),
      }),
    );
    expect(text(panel, 'release-state')).toMatch(/newer deploy|raced/i);
  });

  it('shows the running version + build number from the SW meta', async () => {
    const panel = await mount(deps());
    expect(text(panel, 'release-running')).toContain(RUNNING.version);
    expect(text(panel, 'release-running')).toContain('#7');
  });

  it('carries the migrated build facts + a device-local note', async () => {
    const panel = await mount(deps());
    expect(text(panel, 'build-facts')).toMatch(/version/i);
    expect(panel.textContent).toMatch(/this install only|this device only/i);
  });
});

describe('version pin (D4)', () => {
  it('OFF by default; enabling locks the CURRENT running version and notifies the SW', async () => {
    const config = freshConfig();
    let notified = 0;
    const panel = await mount(deps({ config, notifyConfigChanged: () => (notified += 1) }));
    const pin = panel.querySelector<HTMLInputElement>('[data-testid=version-pin] input');
    expect(pin?.checked).toBe(false);
    pin?.click();
    await settle();
    await settle();
    expect((await config.load()).lockedVersion).toBe(RUNNING.version);
    expect(notified).toBeGreaterThan(0);
    expect(text(panel, 'pin-status')).toContain(`version locked at v${RUNNING.version}`);
  });

  it('unpinning clears the lock', async () => {
    const config = freshConfig();
    await config.save({ lockedVersion: RUNNING.version });
    const panel = await mount(deps({ config }));
    const pin = panel.querySelector<HTMLInputElement>('[data-testid=version-pin] input');
    expect(pin?.checked).toBe(true);
    pin?.click();
    await settle();
    await settle();
    expect((await config.load()).lockedVersion).toBeUndefined();
    expect(text(panel, 'pin-status')).toBe('');
  });

  it('while pinned the manual check is INERT: locked text, no reg.update()', async () => {
    const config = freshConfig();
    await config.save({ lockedVersion: RUNNING.version });
    let updated = 0;
    const panel = await mount(
      deps({
        config,
        updateRegistration: () =>
          Promise.resolve({
            update: () => {
              updated += 1;
              return Promise.resolve();
            },
            waiting: null,
            installing: null,
          }),
      }),
    );
    panel.querySelector<HTMLButtonElement>('[data-testid=check-updates]')?.click();
    for (let i = 0; i < 10; i++) await settle();
    expect(text(panel, 'update-status')).toContain(`version locked at v${RUNNING.version}`);
    expect(updated).toBe(0);
  });

  it('unpinned, the manual check keeps the migrated Settings behavior', async () => {
    let updated = 0;
    const panel = await mount(
      deps({
        updateRegistration: () =>
          Promise.resolve({
            update: () => {
              updated += 1;
              return Promise.resolve();
            },
            waiting: null,
            installing: null,
          }),
      }),
    );
    panel.querySelector<HTMLButtonElement>('[data-testid=check-updates]')?.click();
    for (let i = 0; i < 10; i++) await settle();
    expect(updated).toBe(1);
    expect(text(panel, 'update-status')).toMatch(/latest build/i);
  });
});

describe('install-only-verified toggle (D5)', () => {
  it('ON by default; toggling writes the config and notifies the SW', async () => {
    const config = freshConfig();
    let notified = 0;
    const panel = await mount(deps({ config, notifyConfigChanged: () => (notified += 1) }));
    const toggle = panel.querySelector<HTMLInputElement>('[data-testid=require-verified] input');
    expect(toggle?.checked).toBe(true);
    toggle?.click();
    await settle();
    await settle();
    expect((await config.load()).requireVerified).toBe(false);
    expect(notified).toBeGreaterThan(0);
  });
});
