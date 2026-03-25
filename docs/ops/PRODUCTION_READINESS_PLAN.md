# Production readiness: close the “disagree” gaps

**Engineering track:** **complete** (passes 1–2 shipped on `main`: `d182f55f`, `17794200`). What is left is **operational execution** (backup drill, external monitors, store listings, sign-off) — see [GO_NO_GO_LAUNCH.md](./GO_NO_GO_LAUNCH.md).

This document is the **in-repo** copy of the plan. Cursor’s **Build Plan** UI reads `~/.cursor/plans/*.md` YAML todos; those must be updated separately or only the first todo will show struck through. **Truth for shipped work:** `git log` and the tables below.

## Shipped — pass 1

**Commit:** `d182f55f` — *Production readiness: API observability, Redis key limits, strict VITE_API_ENDPOINT*

| Theme | What landed | Where |
|-------|-------------|--------|
| VITE API URL | Production fails if `VITE_API_ENDPOINT` unset; dev → `http://127.0.0.1:3001` | `apps/*/src/config/api.ts` (dashboard, aggregator-browser, prism, developer-portal) |
| WebSockets | Optional `SOCKET_REQUIRE_AUTH=true` | `api/src/server.ts` |
| Sentry (API) | Optional `SENTRY_DSN` | `api/src/server/utils/sentry.ts` |
| Access logs | `X-Request-Id`, JSON lines (`ACCESS_LOG_JSON` in prod) | `api/src/server.ts` |
| Readiness | `GET /health/ready` | `api/src/server.ts` |
| API-key limits | Redis when connected | `api/src/server/modules/apiKeyService.ts` |
| Ops pointers | `.env.example`, README, `RATE_LIMITS.md` | `api/`, `docs/api/` |

## Shipped — pass 2 (this continuation)

| Theme | What landed | Where |
|-------|-------------|--------|
| Phase 1 — log hygiene | Removed token-prefix logging; removed full `JSON.stringify(credentials)`; gated StorageAccounts / my-files verbose logs to **development**; `getAllFilesForUser` user logs dev-only | `api/src/server.ts`, `api/src/server/modules/aggregatorMetadataServiceDB.ts` |
| Phase 2 — browser errors | Optional **`VITE_SENTRY_DSN`** (production); ErrorBoundary → Sentry | `apps/aggregator-browser/src/config/sentry.ts`, `main.tsx`, `ErrorBoundary.tsx` |
| Phase 2 — smoke | `npm run smoke:health` (curl `/health` + `/health/ready`) | `api/scripts/smoke-api-health.sh`, `api/package.json` |
| Phase 3 / 6 — templates | Backup/restore runbook + GA checklist (fill in per drill) | [BACKUP_AND_RESTORE_RUNBOOK.md](./BACKUP_AND_RESTORE_RUNBOOK.md), [GO_NO_GO_LAUNCH.md](./GO_NO_GO_LAUNCH.md) |
| Phase 4 — edge | CDN/proxy body size / timeouts note | [CDN_AND_PROXY_LIMITS.md](./CDN_AND_PROXY_LIMITS.md) |
| Env example | Aggregator Sentry vars documented | `apps/aggregator-browser/.env.example` |

**API host:** Redeploy Node API for server changes. **Firebase:** redeploy static apps after aggregator change if you want browser Sentry in the browse build.

## Still open (manual or later passes)

- Broad **grep** across remaining `api/src` modules for `console.log` with identifiers in production (many routes still log in dev-only now; spot-check new code).
- **CORS smoke** from real Capacitor WebView devices.
- **REACT_APP_* → VITE_*** in shell scripts and old markdown (large surface).
- **External uptime** monitors (Better Stack, GCP, etc.) hitting `/health` and `/health/ready`.
- **Dashboards** (5xx, latency, pool, 429) in your host’s metrics.
- **Load tests** (k6, Artillery) on hot routes — not added yet.
- **Store checklist execution** per app (privacy, support, TestFlight/Play internal).

## Phase status (summary)

| Phase | Done / partial | Still to do |
|-------|----------------|-------------|
| 1 | VITE guard, socket opt-in, major credential log fixes, env notes | Remaining modules audit, CORS device smoke, script/doc REACT_APP sweep |
| 2 | API Sentry, request id, access JSON, `/health/ready`, smoke script, aggregator Sentry | Uptime SaaS, dashboards, id-dashboard Sentry (optional) |
| 3 | Runbook template | Perform drill; fill table |
| 4 | Redis API keys, proxy doc | Load test script |
| 5 | — | Execute per app |
| 6 | Checklist template | Sign-offs |

## Principles

- How to build: `.cursor/rules/`, [SHARED_CODE_RULES.md](../../SHARED_CODE_RULES.md).
- What the code does: read the code.

## Suggested order

1. Redeploy API; set `SENTRY_DSN`, `REDIS_URL` as needed.
2. Set `VITE_SENTRY_DSN` on aggregator production build when ready.
3. Run `npm run smoke:health` against production API from CI or laptop.
4. Complete backup drill + [GO_NO_GO_LAUNCH.md](./GO_NO_GO_LAUNCH.md).
5. Load test + external monitors when scaling.

Related: [api/README.md](../../api/README.md) operations section.
