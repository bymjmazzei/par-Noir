# Documentation cleanup tracker

Completed **2026-03-18** per markdown cleanup plan. Regenerate inventory: `node scripts/docs-inventory.mjs` → `docs-inventory.csv` (gitignored).

## `docs/legal/` — removed

| Action | Notes |
|--------|--------|
| **Deleted entire tree** | Canonical patent materials live outside the repo |

## `docs/archive/` (was 14 → 6)

| Path | Tier | Action |
|------|------|--------|
| `diagnostics-2026-08/DIAGNOSTIC_*.md` (5) | C | **Deleted** — closed Aug 2026 incidents |
| `plans/id-dashboard-refactor/*` (3) | C | **Deleted** — refactor shipped |
| `plans/IMPLEMENTATION_PLAN.md` | B | **Kept** |
| `plans/FEED_SYSTEM_PRODUCTION_PLAN.md` | B | **Kept** |
| `plans/BROWSER_REDESIGN_PLAN.md` | B | **Kept** |
| `plans/FIX_PLAN.md` | B | **Kept** |
| `plans/NSFW_IMPLEMENTATION_PLAN.md` | B | **Kept** |
| `README.md` | A | **Updated** index |

## Repo root (was 40 → 7)

| Path | Tier | Action |
|------|------|--------|
| `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | A | **Kept** |
| `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md` | A | **Kept** |
| `SHARED_CODE_RULES.md` | A | **Kept** |
| `DEPLOYMENT_CHECKLIST.md`, `RAILWAY_*.md`, `POST_DEPLOYMENT_VERIFICATION.md`, `RUN_MIGRATION_LOCALLY.md`, `GEMINI_API_KEY_SETUP.md` | A/B | **Moved** → `docs/ops/` |
| `GOOGLE_DRIVE_*.md`, `GOOGLE_SHEETS_API_SETUP.md`, `INTEGRATION_SETTINGS_GUIDE.md`, `AUTH_MIDDLEWARE_INTEGRATION.md` | A | **Moved** → `docs/developer/` |
| `LOCAL_TESTING.md`, `TESTING_GUIDE.md`, `QUICK_START.md`, `WHERE_TO_DO_WHAT.md`, `SETUP_GUIDE.md`, `TESTING_CONNECTION_REQUESTS.md` | A/B | **Moved** → `docs/guides/` |
| `TECHNICAL_BREAKDOWN.md` | B | **Moved** → `docs/architecture/` |
| `*_IMPLEMENTATION.md`, `IMPLEMENTATION_CHECKLIST.md`, `FEED_SYSTEM_CHECKLIST.md`, `LICENSING_UPDATE.md`, `MIGRATION_SIMPLE_GUIDE.md` | B | **Moved** → `docs/history/` |
| `CONTINUE_FIX_PROMPT.md`, `SETUP_COMPLETE.md`, `UPGRADE_SUMMARY.md`, `NEXT_STEPS.md`, `SECURITY_FIX*.md`, `verify-redis.md` | C | **Deleted** |

## `docs/security/`

| Path | Action |
|------|--------|
| `PHASE*_COMPLETE.md`, `MIGRATION_*.md`, `FINAL_STATUS.md`, `IMPLEMENTATION_SUMMARY.md` | **Merged** into [HISTORY.md](./security/HISTORY.md), deleted |
| `SECURITY_OVERVIEW.md`, `MIGRATION_GUIDE.md`, `IDENTITY_PQC_DECISIONS.md`, etc. | **Kept** (canonical) |

## Apps

| Path | Action |
|------|--------|
| `apps/aggregator-browser/TASK_LIST.md` | **Deleted** |
| `apps/aggregator-browser/docs/OAUTH-DEBUG-STEPS.md` | **Deleted** (see [PN_OAUTH_INTEGRATION.md](./developer/PN_OAUTH_INTEGRATION.md)) |
| `apps/id-dashboard/GOOGLE_DRIVE_SETUP.md` | **Stub** → `apps/id-dashboard/docs/GOOGLE_DRIVE_SETUP.md` |
