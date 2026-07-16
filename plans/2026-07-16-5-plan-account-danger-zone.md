# Account danger zone — sign-out bubble + "Delete all arecipe data"

**Status:** ✅ **Implemented 2026-07-16.** TDD-first (red → green). Gate green:
lint · typecheck (both tsconfigs) · 600 unit (15 new) · build · 191 hermetic
e2e (1 new); the two new @live specs are written and await a credentialed run.

## Mission (owner request, honored verbatim where quoted)

1. Move **Sign out** to the bottom of the Account page, inside a UI bubble
   (a `.settings-section` card, the page's bubble idiom), with an inline
   two-step confirmation "similar to how the reset does on meals page"
   (note + Confirm/Cancel — `renderResetControl` in `src/pages/meals.ts`).
2. Below it, a **"Delete all arecipe data"** button in "a slightly darker
   version of the sign out color" — sign out wears `--rust`; delete wears
   `--rust-deep` (the same hue one step deeper, already in the palette,
   light + dark variants).
3. Deleting requires **typing the actual bsky username** (the resolved
   handle; DID fallback while unresolved) "like deleting a repo does on
   GitHub", **and** a hard browser confirm (`window.confirm`) that says
   exactly: **"Seriously, this permanently deleted all your data for
   arecipe"** — OK = confirm, Cancel = decline.
4. Copy above the delete button, "needed and should be honored":
   *"This deletes all local cache and settings and all app.arecipe entries
   in your PDS. It does not delete exchange.recipe entries."*

## Locked design

- **D1 — scope of the wipe.** PDS side: enumerate the repo's collections via
  `com.atproto.repo.describeRepo`, keep only the `app.arecipe.` prefix, page
  every rkey via `listRecords`, delete in `applyWrites` batches of ≤200.
  `exchange.recipe.*` (and anything else — `app.bsky.*`) is untouched **by
  construction** (prefix filter), not by a denylist. Local side: clear
  `localStorage` (all settings/prefs/hints), delete our IndexedDB databases
  (`arecipe`, `arecipe-drafts`), delete CacheStorage entries with the
  `arecipe-` prefix (the SW's own naming, `src/sw.ts`).
- **D2 — a wipe is not a sign-out.** The OAuth library's own session store is
  deliberately NOT touched; after the post-wipe reload the boot flow restores
  the session and re-stamps the landing hint. The honored copy promises
  cache + settings + `app.arecipe` records — nothing about signing out.
- **D3 — order: PDS first, local second.** If the PDS wipe fails midway the
  device settings survive for a retry; the status line reports the failure
  loud (no silent partial success).
- **D4 — module split for testability.** `src/account/wipe.ts` (pure data
  wipe, injectable agent/storage/idb/caches) + `src/account/danger-zone.ts`
  (the rendered section, injectable signOut/wipe/hardConfirm/reload), wired
  by `src/pages/account.ts` only when signed in. Mirrors the
  `cookbook-members-view` extraction pattern.
- **D5 — type-to-confirm.** The input must match the resolved handle
  (leading `@` tolerated, whitespace trimmed); until it does, the
  destructive button stays `disabled`. While the handle is still resolving
  the DID is the required text (never a free pass).

## Tests (written first)

- `tests/unit/account/wipe.spec.ts` — prefix filter (exchange.recipe /
  app.bsky survive), listRecords pagination, ≤200 applyWrites batching,
  no-did fail-loud, local wipe clears storage + our two DBs + only
  `arecipe-*` caches.
- `tests/unit/account/danger-zone.spec.ts` (happy-dom) — honored copy
  rendered verbatim; sign-out two-step confirm (cancel restores, confirm →
  signOut then reload); type-to-confirm gating incl. `@` tolerance; declined
  hard confirm → no wipe; accepted → PDS wipe before local wipe before
  reload; wipe failure → loud status, controls re-enabled, no reload.
- `tests/e2e/account.spec.ts` — signed-out page renders neither sign-out nor
  delete controls (they need a session).
- `tests/e2e/account-live.spec.ts` (@live) — signed-in: the danger bubble is
  the last section; sign-out confirm appears and cancels; delete reveals the
  type-to-confirm challenge with the button disabled until the real handle
  is typed (cancelled before any native dialog — the live account's data is
  never actually deleted).

## Outcome

- `src/account/wipe.ts` — `listArecipeCollections` (describeRepo + prefix
  filter), `wipePdsArecipeData` (cursor-following listRecords → ≤200-write
  applyWrites batches, progress callback, fail-loud), `wipeLocalData`
  (localStorage.clear + `arecipe`/`arecipe-drafts` IndexedDB + `arecipe-*`
  CacheStorage; injectable, blocked-deletion safe).
- `src/account/danger-zone.ts` — the bubble: sign-out with the meals-reset
  two-step confirm; honored copy verbatim; delete challenge (handle typed,
  `@` tolerated, DID fallback) → `window.confirm` with the owner's exact
  wording → PDS-then-local wipe → reload. Failure reports loud and re-arms.
- `src/pages/account.ts` — sign-out removed from the top; the danger zone is
  the last section, signed-in only; the resolved handle feeds the challenge.
- `styles.css` — `.account-danger` rules; sign out keeps `--rust`, delete
  wears `--rust-deep` (the darker step of the same hue), disabled state,
  challenge input styling.
- Visual check: harness-rendered screenshots (resting / sign-out confirm /
  challenge) at 480px — bubble, divider, alignment, inline prompt all sound.
