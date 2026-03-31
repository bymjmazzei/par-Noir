# Emergency Rollback and Disable Runbook

Use this when a release introduces critical auth/security regressions.

## Rollback triggers

- OAuth unlock/authenticate is failing broadly.
- Token exchange/refresh outage or high 5xx.
- Sensitive data leakage detected in logs/responses.

## Fast rollback steps

1. Roll API to last known good revision.
2. If needed, disable risky feature flags (example: staged refresh-rotation enforcement).
3. Re-run health checks:
   - `GET /health`
   - `GET /health/ready`
4. Verify code → token exchange and at least one protected route.

## Emergency disable options

- Temporarily disable affected app entrypoints at edge/CDN if exploit is active.
- Restrict admin routes to trusted network/principals only.
- Block suspect clients/tokens until containment is complete.

## Required post-rollback checks

- Confirm no broken deploy artifacts are still served.
- Confirm monitoring and alerts have returned to baseline.
- Document rollback reason, affected commit(s), and follow-up fixes.

## Decision log

| Time (UTC) | Action | Operator | Outcome |
|---|---|---|---|
| | | | |

