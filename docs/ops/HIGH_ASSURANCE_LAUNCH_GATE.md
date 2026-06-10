# High-Assurance Launch Gate

This gate defines the internal bar for calling a build "high-assurance ready."
Every control below requires objective evidence. If any required control is red,
launch is blocked.

## 1) Crypto + protocol controls

| Control | Required state | Evidence |
|---|---|---|
| ZK proof format | Only v1 envelope accepted in production paths; legacy blob proofs rejected | Test outputs from `npm run test:zk`; API negative tests for malformed/tampered/legacy proofs |
| OAuth auth binding | `/oauth/authorize/authenticate` and `/oauth/token` succeed with current identity format and reject invalid requests cleanly | API integration test report + staging HTTP traces |
| Key format contract | OAuth key handling and ZK key verification use explicit, documented contracts (no implicit length assumptions in unrelated paths) | Link to code review + tests covering incompatible key formats |
| Sensitive data handling | No plaintext pn name/passcode/email/age/drive account identifiers in logs | Log redaction test output + grep-based checks in CI |

## 2) OAuth + token controls

| Control | Required state | Evidence |
|---|---|---|
| Issuer/audience consistency | `PN_OAUTH_ISSUER`/`PN_OAUTH_AUDIENCE` match clients/integrators | Environment audit record + one token validation sample |
| Token signing mode | Explicit HS256 or RS256/KMS configured and documented | Env snapshot + rotation runbook link |
| Refresh rotation | `PN_OAUTH_ENFORCE_REFRESH_ROTATION` staged, validated, then production-enabled | Staging sign-off + production smoke report |
| Admin auth hardening | Admin identity headers and principals configured; legacy admin key disabled when ready | Config diff + admin endpoint auth test evidence |
| Platform registry | `PLATFORM_REGISTRY_PN_IDENTIFIER` Drive connected; sync healthy; pending integrator clients cannot OAuth | Operator init + sync timestamps; negative OAuth test for unapproved `client_id` |

## 3) App-surface controls (all apps)

Required apps:
- `apps/aggregator-browser`
- `apps/id-dashboard`
- `apps/prism`
- `apps/developer-portal`
- `apps/licensing-portal`

For each app, all of the following must pass:
- OAuth unlock (popup/full-page where applicable)
- Code exchange and token persistence behavior
- At least one protected API read and one write path
- Failure behavior (invalid token, expired token, revoked session) with safe error messages

Evidence: smoke matrix in `docs/ops/HIGH_ASSURANCE_EVIDENCE.md`.

## 4) Operational controls

| Control | Required state | Evidence |
|---|---|---|
| Backups and restore | Automated backups configured and restore drill completed | `docs/ops/BACKUP_AND_RESTORE_RUNBOOK.md` drill row with timestamp + operator |
| Multi-instance consistency | `REDIS_URL` configured when >1 API replica | Deployment config snapshot |
| Alerting | `SENTRY_DSN` (or equivalent) configured, alerts on 5xx + OAuth refresh failures | Alert policy screenshots/links |
| Incident response | Runbooks exist for key compromise, token abuse/replay, rollback/disable | Links to runbooks in `docs/ops/` |

## 5) CI/release gates

Required CI gates:
- secret leakage checks
- legacy quantum import guardrail checks
- required production env flag checks (when `PN_STRICT_GUARDRAILS=1`)
- core tests for OAuth + ZK protocol paths

Release is blocked if any required CI gate fails.

## Gate decision

| Area | Owner | Status (green/yellow/red) | Notes |
|---|---|---|---|
| Crypto + protocol | | | |
| OAuth + tokens | | | |
| App surfaces | | | |
| Ops + monitoring | | | |
| CI + release controls | | | |

Final decision:
- [ ] Go
- [ ] No-go

