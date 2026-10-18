# Security implementation history

Archived summaries from completed migration and phase logs. **Current guidance:** [SECURITY_OVERVIEW.md](./SECURITY_OVERVIEW.md), [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md), [IDENTITY_PQC_DECISIONS.md](./IDENTITY_PQC_DECISIONS.md).

## Credential and session hardening (migration)

- Removed `pnName` / passcode from `AuthSession`; unlock flows use `SecureCredentialManager` with memory zeroization (`MemorySecurity`, `PNNameHash`).
- Secured dashboard paths: `FileStorageAggregator`, `App.tsx` auth handlers, `UnifiedAuth.tsx`, desktop unlock, upload/download volume ID usage.

## Phased dashboard work (completed)

| Phase | Focus |
|-------|--------|
| 1 | Critical security fixes; biometric API (`isAvailable`, `identityId` on authenticate) |
| 2 | Broader security hardening across dashboard surfaces |
| 3 | Biometric authentication completion |

## Exposure / mitigation work

Early exposure analysis and mitigations are summarized in [MITIGATION_STRATEGIES.md](./MITIGATION_STRATEGIES.md) and [ATTACK_VECTOR_ANALYSIS.md](./ATTACK_VECTOR_ANALYSIS.md). Phase completion checklists were retired in favor of this file (2026-03).
