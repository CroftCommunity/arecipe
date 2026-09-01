# E7 — measurement service destroy/restore drill

**Status: PAPER DRILL (declared stand-in).** This environment has no real Caddy
vhost, systemd unit, SQLite file, Litestream process, or R2 bucket, so the drill
below was **not executed against live infra**. What *was* executed is the
**logical restore invariant** it rests on — see
`tests/unit/e7-infra.test.ts` (`destroy/restore drill`), which models the
receiver store, replicates, destroys, and restores, asserting that
committed-before-replication data survives exactly and the unreplicated tail is
lost in a **bounded, explicit** way (never silently). A live version would
additionally prove the systemd/Caddy/Litestream wiring and real R2 round-trip.

## Service shape (matches the existing kit)

- **Caddy vhost** terminating TLS, reverse-proxying the flush endpoint.
- **systemd unit** `measure-receiver.service` running the receiver.
- **Canonical SQLite** DB (`/var/lib/measure/measure.db`), WAL mode.
- **Litestream** replicating the DB to **R2** on a sync interval (E7 arithmetic
  argues for **≥3s**, or **≥10s** with margin, to keep WAL PUTs under the 1M/mo
  free tier regardless of load).
- **Per-service manifest** declaring canonical vs disposable paths:
  - canonical: the SQLite DB + Litestream generation in R2.
  - disposable: the box itself, the Caddy cache, systemd runtime state.

## Drill steps (to run against live infra later)

1. **Baseline.** Record `SELECT period, name, count` totals for the current
   period. Note the current Litestream generation and last-sync timestamp.
2. **Destroy.** Stop `measure-receiver.service`, stop Litestream, delete the box
   (or at minimum `rm` the canonical DB + WAL/SHM). Confirm the endpoint is down.
3. **Restore.** Provision a fresh box, install the unit + Caddy vhost, run
   `litestream restore` from R2 into the canonical path, start Litestream, start
   the service.
4. **Verify.** Re-run the baseline query. Acceptance:
   - every counter committed **before** the last pre-destroy sync matches exactly;
   - the only permissible loss is writes in the **unreplicated tail** (the last
     `syncIntervalSec` window), which is bounded and must be stated, not silent;
   - the flush endpoint serves 200 again and new flushes accumulate.

## Acceptance mapping

| Acceptance (this drill)                     | Evidence today                                  |
|--------------------------------------------|-------------------------------------------------|
| Committed data survives destroy+restore    | `e7-infra.test.ts` restore invariant (executed) |
| Loss bounded to the sync window, explicit  | `e7-infra.test.ts` asserts the tail write is dropped, not silently merged |
| Real Litestream ↔ R2 round-trip            | **stand-in — not executed here**                |
| systemd/Caddy re-provision                 | **stand-in — not executed here**                |
