# Local Internal Dashboard

Local-only ecosystem monitoring and audit dashboard for par Noir.

## Purpose

- Monitor full ecosystem status locally (founder, health, security, financials, investor views)
- Pull raw operational and financial data from local API server
- Export per-view CSV/JSON packets for reporting

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

## No deploy integration

This app is local by design:

- It is not included in Firebase hosting deploy workflow
- It is intended for local ops/investor packet generation and internal diagnostics
