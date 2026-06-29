# Go / no-go: beta vs general availability

Use this as a **gate checklist** before calling a release “GA” or widening store distribution. Owners initial when satisfied.

For the full remaining-work breakdown (Stripe, Veriff, mobile, ops, deferred scope), see [LAUNCH_REMAINING_WORK.md](./LAUNCH_REMAINING_WORK.md).

## Engineering

- [ ] **API deployed** with the same commit as tested (Railway / host).
- [ ] **`VITE_API_ENDPOINT`** set for every production front-end build (apps fail fast if missing).
- [ ] **`SENTRY_DSN`** on API (optional but recommended); **`VITE_SENTRY_DSN`** on aggregator-browser if you want client errors (optional).
- [ ] **`REDIS_URL`** set if you run **more than one** API instance (shared API-key rate limits).
- [ ] **`GET /health`** and **`GET /health/ready`** succeed from monitoring or `api/scripts/smoke-api-health.sh`.
- [ ] **No known credential logging** in production paths (see recent production-readiness log hardening in `api/src/server.ts`).

## Data and operations

- [ ] **Backup + restore drill** completed once; [BACKUP_AND_RESTORE_RUNBOOK.md](./BACKUP_AND_RESTORE_RUNBOOK.md) updated with last drill row.
- [ ] **Incident path**: who gets paged / how Sentry (or other) alerts are routed.

## Product / mobile (if applicable)

- [ ] **Privacy policy** and **support** URLs live for each store listing.
- [ ] **OAuth redirect URIs** and **`VITE_PN_CLIENT_ID`** correct per app (no cross-app client ID mix-ups).
- [ ] **Internal testing** (TestFlight / Play internal) passed for the build you intend to ship.

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Product / ops | | |
