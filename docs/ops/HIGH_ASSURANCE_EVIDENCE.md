# High-Assurance Evidence Index

Track evidence for each launch-gate control in
`docs/ops/HIGH_ASSURANCE_LAUNCH_GATE.md`.

## 1) Crypto and protocol evidence

| Control | Evidence | Status |
|---|---|---|
| ZK v1 protocol round-trip + downgrade/legacy rejection | `packages/zk-protocol-v1/test/zk.test.cjs` (`npm test`) | complete |
| API ZK verification negative tests | `api/src/server/utils/zkpDataPointsService.verify.test.ts` | complete |
| SDK verifier downgrade/tamper rejection | `sdk/identity-sdk/__tests__/modules/zkpManager.test.ts` | complete |
| Legacy ZK import guardrails | `scripts/check-quantum-imports.sh` (CI and local) | complete |

## 2) OAuth/session hardening evidence

| Control | Evidence | Status |
|---|---|---|
| OAuth error sanitization in authenticate path | `api/src/server.ts` (message-only logging in catches) | complete |
| OAuth/session expected behavior matrix | `docs/ops/OAUTH_SESSION_HARDENING_MATRIX.md` | complete |
| Key-format mismatch 500 fix | `api/src/server/modules/pnOAuthService.ts` (removed unrelated ML-DSA length enforcement in OAuth auth path) | complete |

## 3) App-surface smoke evidence

Command executed:

```bash
VITE_API_ENDPOINT=https://api.parnoir.com scripts/smoke-auth-surfaces.sh
```

Observed:
- API `/health` and `/health/ready` passed.
- Build smoke passed for:
  - `apps/aggregator-browser`
  - `apps/id-dashboard`
  - `apps/prism`
  - `apps/developer-portal`
  - `apps/licensing-portal`

Status: complete

## 4) Ops controls and incident runbooks

| Control | Evidence | Status |
|---|---|---|
| Backup/restore drill process | `docs/ops/BACKUP_AND_RESTORE_RUNBOOK.md` | existing |
| Key compromise response | `docs/ops/KEY_COMPROMISE_RESPONSE.md` | complete |
| Token abuse/replay response | `docs/ops/TOKEN_ABUSE_AND_REPLAY_RESPONSE.md` | complete |
| Emergency rollback/disable | `docs/ops/EMERGENCY_ROLLBACK_AND_DISABLE.md` | complete |
| Production env baseline checklist | `docs/ops/PRODUCTION_ENV_AUDIT.md` | updated |

## 5) CI gate evidence

`/.github/workflows/deploy.yml` now enforces:
- `scripts/check-secrets.sh` (strict)
- `scripts/check-quantum-imports.sh`
- `scripts/check-production-flags.sh` (strict)
- `npm run test:zk`
- API ZK verification test
- SDK ZKP manager test

## Remaining manual evidence (must be attached before Go)

- Staging and production screenshots/logs proving:
  - `PN_OAUTH_ENFORCE_REFRESH_ROTATION` rollout sign-off
  - alerting policies active for 5xx and OAuth refresh anomalies
  - backup restore drill execution record with date/operator
- Final go/no-go sign-off table completion in launch gate doc.

