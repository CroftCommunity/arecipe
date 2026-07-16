// The Account "Release & version" panel (signed releases D7). Pure DOM
// factory with injected deps (config store, origin check, SW meta, update
// registration, network build-info) so every state is unit-testable; the
// account page wires the real ones. Copy is HONEST by ruling: the interim
// key is named interim, states name exactly what was checked (manifest
// signature, version identity, build number — never the Phase-3 offline-key
// guarantees), and both toggles carry a this-install-only note because the
// config is device-local and must not roam.

import type { BuildInfo } from '../build-stamp.js';
import type { ReleaseConfigStore } from './config.js';
import type { SwReleaseMeta } from './sw-meta.js';
import type { VerifyOutcome } from './verify.js';

export type ReleasePanelDeps = {
  config: ReleaseConfigStore;
  /** On-demand page-level origin-manifest check, for display. The
   * authoritative install-time verdict stays the SW's (D3). */
  check: () => Promise<VerifyOutcome>;
  /** The RUNNING build's identity, from the controlling SW. */
  runningMeta: () => Promise<SwReleaseMeta | null>;
  /** Network build-info (what's newest at the origin) for the facts block. */
  buildInfo: () => Promise<BuildInfo | null>;
  updateRegistration: () => Promise<
    | { update: () => Promise<unknown>; waiting: unknown; installing: unknown }
    | undefined
  >;
  /** Tells the SW its memoized config is stale after a toggle flips. */
  notifyConfigChanged: () => void;
};

const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const CHECK_SCOPE = 'checked: manifest signature, version identity, build number';

const stateCopy = (outcome: VerifyOutcome): string => {
  switch (outcome.state) {
    case 'verified':
      return `Verified — this release carries a valid signed manifest (interim CI key; ${CHECK_SCOPE}).`;
    case 'unsigned':
      return 'Unsigned build — no release signature. Normal for local builds and PR previews; on the production site this would be a warning.';
    case 'invalid':
      return `Release check FAILED (${outcome.reason}). While “install only verified updates” is on, this install keeps serving its last verified version.`;
    case 'stale-mismatch':
      return 'A newer deploy raced this check — the origin already serves the next release. Will re-check on the next update.';
    case 'unchecked':
      return outcome.reason === 'no-pinned-key'
        ? 'Release signing is not yet enabled for this build — nothing to verify against.'
        : 'Couldn’t check — the release manifest wasn’t reachable. Will retry on the next visit.';
  }
};

export const renderReleasePanel = (deps: ReleasePanelDeps): HTMLElement => {
  const section = el('section', 'settings-section release-panel');
  section.dataset['testid'] = 'release-panel';
  section.append(el('h3', 'section-title', 'Release & version'));

  // --- Verify state (on-demand display check; SW verdict is authoritative) --
  const state = el('p', 'status release-state', 'checking release…');
  state.dataset['testid'] = 'release-state';
  section.append(state);
  const refreshState = async (): Promise<void> => {
    state.textContent = stateCopy(await deps.check());
  };

  // --- Running version -------------------------------------------------------
  const running = el('p', 'status');
  running.dataset['testid'] = 'release-running';
  section.append(running);
  let runningVersion: string | null = null;
  const loadRunning = async (): Promise<void> => {
    const meta = await deps.runningMeta();
    if (meta !== null) {
      runningVersion = meta.version;
      running.textContent = `Running v${meta.version} (build #${meta.buildNumber})`;
    } else {
      // No controlling SW (first visit / dev) — the network build-info is the
      // best available answer; label it as such.
      const info = await deps.buildInfo();
      running.textContent =
        info === null ? 'Running version unknown' : `Origin serves v${info.version} (this page may predate it)`;
    }
  };

  // --- Toggles: version pin + install-only-verified --------------------------
  const localNote = el(
    'p',
    'status',
    'Both switches apply to this install only — they live in this browser, never in your account.',
  );
  localNote.dataset['testid'] = 'release-local-note';

  const pinRow = el('label', 'starter-row');
  pinRow.dataset['testid'] = 'version-pin';
  const pinBox = document.createElement('input');
  pinBox.type = 'checkbox';
  pinRow.append(pinBox, el('span', undefined, 'Lock this install to the current version'));
  const pinStatus = el('p', 'status');
  pinStatus.dataset['testid'] = 'pin-status';
  const reflectPin = (lockedVersion: string | undefined): void => {
    pinBox.checked = lockedVersion !== undefined;
    pinStatus.textContent = lockedVersion === undefined ? '' : `version locked at v${lockedVersion}`;
  };
  pinBox.addEventListener('change', () => {
    void (async () => {
      if (pinBox.checked) {
        // Pin = the CURRENT running version only (D4). Without a controlling
        // SW there is no cached version to lock to — refuse honestly.
        const version = runningVersion ?? (await deps.runningMeta())?.version;
        if (version === undefined || version === null) {
          pinBox.checked = false;
          pinStatus.textContent = 'can’t lock: no service worker is controlling this page yet';
          return;
        }
        const next = await deps.config.save({ lockedVersion: version });
        reflectPin(next.lockedVersion);
      } else {
        const next = await deps.config.save({ lockedVersion: undefined });
        reflectPin(next.lockedVersion);
      }
      deps.notifyConfigChanged();
    })();
  });

  const requireRow = el('label', 'starter-row');
  requireRow.dataset['testid'] = 'require-verified';
  const requireBox = document.createElement('input');
  requireBox.type = 'checkbox';
  requireRow.append(
    requireBox,
    el('span', undefined, 'Install only verified updates (stay on the last verified version otherwise)'),
  );
  requireBox.addEventListener('change', () => {
    void deps.config.save({ requireVerified: requireBox.checked }).then(deps.notifyConfigChanged);
  });

  section.append(pinRow, pinStatus, requireRow, localNote);

  // --- Check for updates (migrated from Settings; testids preserved) --------
  const checkButton = el('button', 'button', 'Check for updates') as HTMLButtonElement;
  checkButton.type = 'button';
  checkButton.dataset['testid'] = 'check-updates';
  const updateStatus = el('p', 'status');
  updateStatus.dataset['testid'] = 'update-status';
  checkButton.addEventListener('click', () => {
    void (async () => {
      const cfg = await deps.config.load();
      if (cfg.lockedVersion !== undefined) {
        // D4: while pinned, NOTHING offers or mentions an upgrade — the manual
        // check is inert and says why.
        updateStatus.textContent = `version locked at v${cfg.lockedVersion} — unlock to check for updates`;
        return;
      }
      updateStatus.textContent = 'checking…';
      const reg = await deps.updateRegistration();
      if (reg === undefined) {
        updateStatus.textContent = 'no service worker registered';
        return;
      }
      await reg.update();
      updateStatus.textContent =
        reg.waiting !== null || reg.installing !== null
          ? 'update found — the toast will offer it'
          : 'you are on the latest build';
      void refreshState();
    })().catch((err: unknown) => {
      updateStatus.textContent = `update check failed: ${String(err)}`;
    });
  });
  section.append(checkButton, updateStatus);

  // --- Build facts (migrated from Settings; testid preserved) ---------------
  const facts = el('dl', 'facts');
  facts.dataset['testid'] = 'build-facts';
  section.append(facts);
  const loadFacts = async (): Promise<void> => {
    const info = await deps.buildInfo();
    if (info === null) {
      facts.replaceChildren(el('dd', 'status', 'build info unavailable'));
      return;
    }
    const fact = (term: string, value: string): void => {
      facts.append(el('dt', undefined, term), el('dd', undefined, value));
    };
    fact('version', info.version);
    fact('built', info.builtAt);
  };

  void (async () => {
    reflectPin((await deps.config.load()).lockedVersion);
    requireBox.checked = (await deps.config.load()).requireVerified;
    await Promise.all([refreshState(), loadRunning(), loadFacts()]);
  })();

  return section;
};
