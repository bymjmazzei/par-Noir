# Local Internal Dashboard

Local-only ecosystem monitoring and audit dashboard for par Noir.

## Purpose

- Monitor full ecosystem status locally (founder, health, security, financials, investor views)
- Pull raw operational and financial data from local API server
- Export per-view CSV/JSON packets for reporting
- Run V2 analytics intelligence (KPI registry, funnel, cohorts, quality, economics, reliability) from API aggregates

## Location

- App path: `apps/internal-dashboard`
- Start command: `npm run dev:internal-dashboard`
- Build command: `npm run build:internal-dashboard`

## Environment

Create `apps/internal-dashboard/.env` from `.env.example`:

- `VITE_API_ENDPOINT` (default local API: `http://127.0.0.1:3001`)
- `VITE_ENABLE_QUERYABLE_ERROR_INGESTION` (`true|false`)
- `VITE_QUERYABLE_ERROR_ENDPOINT` (optional API path when queryable errors are available)

## Auth inputs

The dashboard is admin-key unlocked:

- Admin API key is required in the UI.
- Without a valid key, dashboard data fetch is blocked.

The key is used in-memory for local calls and is not sent anywhere other than the configured API endpoint.

## V2 analytics endpoints

The dashboard attempts the following admin endpoints:

- `GET /api/admin/social/metrics`
- `GET /api/admin/dashboard/v2`

If an endpoint is not available on the connected API deployment, the UI degrades gracefully and displays a warning banner.

## KPI model and cadence

V2 analytics returns:

- `metricVersion`, `generatedAt`, `dataLagSec`
- `completeness` (missing endpoints/metrics + notes)
- KPI registry definitions (`id`, `formula`, `owner`, `thresholds`, `decisionPlaybook`)
- computed KPI values with tones (`ok`, `warn`, `bad`, `neutral`)

Refresh cadence remains every 60 seconds in the dashboard.

## No deploy integration

This app is local by design:

- It is not included in Firebase hosting deploy workflow
- It is intended for local ops/investor packet generation and internal diagnostics

## Export-first workflow (no local persistence)

- Dashboard does not persist snapshots to localStorage/IndexedDB or create a local database.
- Exports are generated as downloadable files (CSV/JSON).
- Save export files into project root (or any local path you choose) for reporting/versioned archives.
