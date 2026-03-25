# Production readiness: close the “disagree” gaps

This document is the **in-repo** copy of the production readiness plan. Cursor’s **Build Plan** UI may point at a separate file under `~/.cursor/plans/`; that file does **not** update when code merges unless someone edits it. **Truth for shipped work:** `git log` and the paths below.

## Shipped (first implementation pass)

**Commit:** `d182f55f` — *Production readiness: API observability, Redis key limits, strict VITE_API_ENDPOINT* (`main`; Firebase static apps deployed via `./deploy.sh`).

| Theme | What landed | Where |
|-------|-------------|--------|
| VITE API URL | Production build fails if `VITE_API_ENDPOINT` is unset; dev defaults to `http://127.0.0.1:3001` | `apps/id-dashboard/src/config/api.ts`, `apps/aggregator-browser/src/config/api.ts`, `apps/prism/src/config/api.ts`, `apps/developer-portal/src/config/api.ts` |
| WebSockets | Optional `SOCKET_REQUIRE_AUTH=true`: OAuth access token required on Socket.IO handshake | `api/src/server.ts` (`setupWebSockets`) |
| Sentry (API) | Optional `SENTRY_DSN`; strips auth/cookies in `beforeSend` | `api/src/server/utils/sentry.ts` |
| Access logs | `X-Request-Id`; JSON lines (path only). Dev on; prod: `ACCESS_LOG_JSON=true` | `api/src/server.ts` |
| Readiness | `GET /health/ready` checks DB when `DATABASE_URL` is set | `api/src/server.ts` |
| API-key limits | Redis-backed counters when Redis cache is connected (`REDIS_URL`) | `api/src/server/modules/apiKeyService.ts` |
| Ops docs | Env template, README bullets, rate-limit note | `api/.env.example`, `api/README.md`, `docs/api/RATE_LIMITS.md`, `apps/id-dashboard/env.template` |

**API host:** Redeploy the Node API (e.g. Railway) so server changes apply. Firebase only ships static front ends.

## Open follow-ups (not in that commit)

- Full Phase 1 audit: grep for PII in logs; CORS smoke from devices; broader `REACT_APP_*` → `VITE_*` in shell/docs/templates.
- Observability: external synthetic checks; dashboards (5xx, latency, pool, 429); optional browser Sentry.
- Backups: provider backup story + restore drill + RPO/RTO.
- Load / edge: stress hot paths; document CDN/proxy limits vs API body caps.
- Stores: run per-app iOS/Android checklist (privacy, support, OAuth, permissions, internal testing).
- GA: formal go/no-go checklist (README has starter bullets only).

## Phase status (summary)

| Phase | Done / partial | Still to do |
|-------|----------------|-------------|
| 1 Security / consistency | VITE prod guard, optional socket auth, env.template note | PII grep, CORS smoke, template/script sweep |
| 2 Observability | Sentry hook, request id, access JSON, `/health/ready` | Uptime checks, dashboards, client errors |
| 3 Backups / secrets | README pointers | Drill, RPO/RTO, rotation runbook |
| 4 Rate / load | Redis API-key limits when Redis up | Load test, edge doc |
| 5 Store | — | Execute checklist per app |
| 6 Launch criteria | — | Write explicit gates |

## Principles (unchanged)

- How to build: `.cursor/rules/`, [SHARED_CODE_RULES.md](../../SHARED_CODE_RULES.md).
- What the code does: read the code; do not trust stale “status” markdown without verifying.

## Suggested order

1. Redeploy API; set `SENTRY_DSN` and `REDIS_URL` if needed.
2. Finish remaining Phase 1 checks.
3. Backup restore drill.
4. External monitors + dashboards.
5. Load test when scaling.
6. Store submission + GA checklist.
