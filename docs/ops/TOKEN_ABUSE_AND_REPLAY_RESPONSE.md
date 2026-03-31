# Token Abuse and Replay Response Runbook

Use this runbook for suspected OAuth token theft, replay, or refresh-token abuse.

## Trigger conditions

- Reused refresh token events spike.
- Multiple geographies/IPs for same token/session in short window.
- Repeated `invalid_grant` and refresh failures for active users.

## Containment actions

1. Enable/verify refresh rotation enforcement in production only after client readiness.
2. Revoke affected refresh-token families and force re-authentication.
3. Raise temporary rate limits/abuse protections on token endpoints if under attack.
4. Ensure admin/auth controls are restricted to trusted principals only.

## API checks

- `/oauth/token` rejects reused/expired authorization codes.
- `/oauth/refresh` rejects invalid or previously used rotated tokens.
- Error responses remain safe (no secret/token leakage).

## Monitoring checks

- Alert on refresh failure rate and token endpoint 4xx/5xx anomalies.
- Track correlation IDs for abuse investigations.
- Confirm Sentry (or equivalent) captures token-path failures with redaction.

## Recovery and closure

- [ ] Abuse source blocked or mitigated.
- [ ] Affected token families revoked.
- [ ] Client sessions recovered through re-auth.
- [ ] Post-incident root cause and action items documented.

