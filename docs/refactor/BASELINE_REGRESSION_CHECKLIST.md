# Baseline Regression Checklist (Refactor Safety Rails)

Use this checklist before and after each refactor PR to ensure behavior remains unchanged.

## Core acceptance criteria

- No intentional behavior changes in refactor-only PRs.
- Existing routes and API response shapes remain compatible.
- Existing user flows complete without new warnings/errors.
- No new plain-text sensitive data appears in client/server logs.

## Smoke flows

### Dashboard

- Unlock/authenticate from `apps/id-dashboard`.
- Open `FileStorageAggregator`, list files, and load metadata.
- Open privacy/verification surfaces and complete a non-destructive verification flow.
- Validate feed discovery surfaces load without runtime errors.

### Aggregator browser

- OAuth unlock/connect flow succeeds.
- Home/discovery feed loads and media thumbnails render.
- Open content modal routes (comments/profile action panels) and verify interactions.
- Upload flow initializes and enqueues content without client exceptions.

### API

- `GET /health` returns healthy response.
- `GET /api/status` returns expected status payload.
- OAuth endpoints (`/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`) resolve normally.
- Aggregator metadata/index endpoints respond with expected schema.

## Build and verification commands

- `npm run smoke:auth-surfaces`
- `cd apps/id-dashboard && npm run build`
- `cd apps/aggregator-browser && npm run build`
- `cd api && npm run build`

## PR gate

- Include short before/after smoke evidence in PR description.
- Keep refactor PRs scoped to one domain boundary.
- If smoke checks fail, revert boundary scope and split PR smaller.
