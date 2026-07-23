# Source map — claim families to codebase and documentation

Maps patent claim families to implementation artifacts for **§ 112 enablement** traceability. Counsel uses this when drafting claims and responding to office actions.

---

## Family A — pN identity artifact (Pillar 1)

| Concept | Code | Documentation |
|---------|------|---------------|
| Identity create / unlock | [`apps/id-dashboard/src/utils/crypto.ts`](../../apps/id-dashboard/src/utils/crypto.ts) (`IdentityCrypto`) | [`docs/standards/IDENTITY_WIRE_FORMAT.md`](../standards/IDENTITY_WIRE_FORMAT.md) |
| PQC keygen (ML-DSA-65, ML-KEM-768) | [`packages/pqc-crypto/src/mlDsa.ts`](../../packages/pqc-crypto/src/mlDsa.ts), [`mlKem.ts`](../../packages/pqc-crypto/src/mlKem.ts) | [`docs/security/IDENTITY_PQC_DECISIONS.md`](../security/IDENTITY_PQC_DECISIONS.md) |
| Encrypted identity blob | `EncryptedIdentity` in `crypto.ts` | [`SHARED_CODE_RULES.md`](../../SHARED_CODE_RULES.md) § proof-of-work glossary |
| Shamir split at create | [`packages/recovery-crypto/src/shamir.ts`](../../packages/recovery-crypto/src/shamir.ts) | — |
| Passcode-sealed shares in `.pn` | [`packages/recovery-crypto/src/sealedShares.ts`](../../packages/recovery-crypto/src/sealedShares.ts) | PBKDF2 1M iter, SHA-512, AES-GCM |
| Recovery envelope | [`packages/recovery-crypto`](../../packages/recovery-crypto/) (`encryptRecoveryEnvelope`, `buildRecoveryPayload`) | — |
| DID format | `did:key:` prefix in `crypto.ts` | [`docs/standards/DID_SPECIFICATION.md`](../standards/DID_SPECIFICATION.md) |

**Priority note:** PQC-only wire format and explicit algorithm IDs are **CIP-NEW** relative to Aug 2025 provisional (which emphasized ECDSA/secp256k1 and Kyber/Dilithium hybrid).

---

## Family B — Recovery vault + social recovery (Pillar 2, lead family)

| Concept | Code | Documentation |
|---------|------|---------------|
| Quorum + unrevokable rule | [`packages/recovery-crypto/src/vault.ts`](../../packages/recovery-crypto/src/vault.ts) (`recoveryMeetsQuorumRule`) | [`docs/developer/IDENTITY_REKEY_MIGRATION.md`](../developer/IDENTITY_REKEY_MIGRATION.md) § Recovery vault |
| Custodian sheet schema | [`api/src/server/modules/recoverySheetsService.ts`](../../api/src/server/modules/recoverySheetsService.ts) | [`GOOGLE_DRIVE_STRUCTURE.md`](../../GOOGLE_DRIVE_STRUCTURE.md) (`recovery.xlsx`) |
| ZK approval contexts | [`packages/recovery-crypto/src/recoveryZkContexts.ts`](../../packages/recovery-crypto/src/recoveryZkContexts.ts) | [`docs/standards/ZK_PROOF_V2.md`](../standards/ZK_PROOF_V2.md) |
| ZK approval verification | [`api/src/server/modules/recoveryZkService.ts`](../../api/src/server/modules/recoveryZkService.ts) | — |
| Recovery API routes | [`api/src/server.ts`](../../api/src/server.ts) (`/api/recovery/requests`, `.../approvals`) | — |
| Recovery completion (same publicKey) | [`apps/id-dashboard/src/services/recoveryService.ts`](../../apps/id-dashboard/src/services/recoveryService.ts) | — |
| Custodian setup | [`apps/id-dashboard/src/services/recoveryCustodianSetup.ts`](../../apps/id-dashboard/src/services/recoveryCustodianSetup.ts) | — |
| Dashboard recovery UI / vault init | [`api/src/server/modules/recoveryVaultRoutes.ts`](../../api/src/server/modules/recoveryVaultRoutes.ts) | — |

**Priority note:** Shamir + custodians + threshold recovery are **PROV** (Aug 2025 provisional). **Unrevokable custodian policy**, ZK v2 approval payloads, and Drive `recovery.xlsx` state machine are **CIP-NEW** unless counsel finds support in provisional.

---

## Family C — Re-key migration + network succession (Pillar 2)

| Concept | Code | Documentation |
|---------|------|---------------|
| Migration orchestration | [`api/src/server/modules/identityMigrationService.ts`](../../api/src/server/modules/identityMigrationService.ts) | [`docs/developer/IDENTITY_REKEY_MIGRATION.md`](../developer/IDENTITY_REKEY_MIGRATION.md) |
| Succession registry | API succession routes; integrator doc | [`docs/developer/INTEGRATOR_IDENTITY_SUCCESSION.md`](../developer/INTEGRATOR_IDENTITY_SUCCESSION.md) |
| Lineage ZK context | `par-noir.zkp.identity_succession` | IDENTITY_REKEY_MIGRATION.md § Lineage ZK |
| Pinned Drive folder continuity | `storage_credentials`, migration `drive_files` step | GOOGLE_DRIVE_STRUCTURE.md |
| Identity succession panel (UX) | [`apps/id-dashboard/src/components/IdentitySuccessionPanel.tsx`](../../apps/id-dashboard/src/components/IdentitySuccessionPanel.tsx) | — |

**Priority note:** Entire family is **CIP-NEW** (not in Aug 2025 provisional in implemented form).

---

## Family D — Public index + aggregator reconcile (Pillar 3)

| Concept | Code | Documentation |
|---------|------|---------------|
| Architecture | — | [`docs/AGGREGATOR_ARCHITECTURE.md`](../AGGREGATOR_ARCHITECTURE.md) |
| Reconcile service | [`api/src/server/modules/aggregatorReconcileService.ts`](../../api/src/server/modules/aggregatorReconcileService.ts) | 5-minute job + manual `POST .../reconcile` |
| Index sheets | [`api/src/server/modules/indexSheetsService.ts`](../../api/src/server/modules/indexSheetsService.ts) | [`GOOGLE_DRIVE_STRUCTURE.md`](../../GOOGLE_DRIVE_STRUCTURE.md) (`public-file-index.xlsx`) |
| DB cache tables | [`api/src/server/modules/aggregatorMetadataServiceDB.ts`](../../api/src/server/modules/aggregatorMetadataServiceDB.ts) | `aggregator_media`, `aggregator_thoughts`, `aggregator_collections` |
| Browser API-only rule | — | [`SHARED_CODE_RULES.md`](../../SHARED_CODE_RULES.md), [`.cursor/rules/shared-code-and-architecture.mdc`](../../.cursor/rules/shared-code-and-architecture.mdc) |

**Priority note:** **CIP-NEW**.

---

## Family E — Integrator silo (L5)

| Concept | Code | Documentation |
|---------|------|---------------|
| Folder layout | Drive init | [`GOOGLE_DRIVE_STRUCTURE.md`](../../GOOGLE_DRIVE_STRUCTURE.md) (`integrators/{client_id}/`) |
| Permissions + scopes | API drive proxy | [`docs/developer/third-party-sharing-and-L5.md`](../developer/third-party-sharing-and-L5.md) |
| ZKP data points (separate from silo) | `_metadata/zkp-data-points.xlsx` | [`docs/api/DATA_POINTS_AND_ZKP_API.md`](../api/DATA_POINTS_AND_ZKP_API.md) |

**Priority note:** **CIP-NEW**.

---

## Family F — ZK proof envelope v2

| Concept | Code | Documentation |
|---------|------|---------------|
| Wire spec | [`packages/zk-protocol-v2/`](../../packages/zk-protocol-v2/) | [`docs/standards/ZK_PROOF_V2.md`](../standards/ZK_PROOF_V2.md) |
| Recovery ZK contexts | [`packages/recovery-crypto/src/recoveryZkContexts.ts`](../../packages/recovery-crypto/src/recoveryZkContexts.ts) | — |
| v1 legacy verify | [`packages/zk-protocol-v1/`](../../packages/zk-protocol-v1/) | [`docs/standards/ZK_PROOF_V1.md`](../standards/ZK_PROOF_V1.md) |

**Priority note:** **CIP-NEW** (STARK + ML-DSA binding; provisional described Schnorr/secp256k1).

---

## Family I — User-sovereign selective disclosure and broker entities

| Concept | Code | Documentation |
|---------|------|---------------|
| Permissions sheet | Drive layout | [`GOOGLE_DRIVE_STRUCTURE.md`](../../GOOGLE_DRIVE_STRUCTURE.md) (`third-party-permissions.xlsx`) |
| ZKP data points store | Drive layout | [`GOOGLE_DRIVE_STRUCTURE.md`](../../GOOGLE_DRIVE_STRUCTURE.md) (`zkp-data-points.xlsx`) |
| Standard data points + proof API | API modules | [`docs/api/DATA_POINTS_AND_ZKP_API.md`](../api/DATA_POINTS_AND_ZKP_API.md) |
| L5 sharing model | — | [`docs/developer/third-party-sharing-and-L5.md`](../developer/third-party-sharing-and-L5.md) |
| ZK v2 envelope | [`packages/zk-protocol-v2/`](../../packages/zk-protocol-v2/) | [`docs/standards/ZK_PROOF_V2.md`](../standards/ZK_PROOF_V2.md) |
| Engagement / aggregate metadata (roadmap) | — | [`docs/ARCHITECTURE_RESTRUCTURE.md`](../ARCHITECTURE_RESTRUCTURE.md) |
| Guiding principle (invert surveillance capitalism) | — | [`SHARED_CODE_RULES.md`](../../SHARED_CODE_RULES.md) |

**Enablement note:** Permissions + proof APIs + user-held ZKP store are **shipped**. Data unions, exchanges, and paid aggregate access are **roadmap / future L5**—document as optional embodiments (FIG. 13); claims 27–29 in CLAIMS_DRAFT are dependent only.

**Priority note:** **CIP-NEW**.

---

## Family G — API coordinator (supporting, not lead claim)

| Concept | Code | Documentation |
|---------|------|---------------|
| OAuth registry | [`api/src/server/modules/clientRegistration.ts`](../../api/src/server/modules/clientRegistration.ts) | [`docs/architecture/why-oauth-registry-is-centralized.md`](../architecture/why-oauth-registry-is-centralized.md) |
| OAuth integration | — | [`docs/developer/PN_OAUTH_INTEGRATION.md`](../developer/PN_OAUTH_INTEGRATION.md) |
| Storage credentials / Drive proxy | [`api/src/server/modules/storage/`](../../api/src/server/modules/storage/) | — |

**Note for spec:** Identity secrets (pn name, passcode, private keys) remain user-held; API hosts OAuth **client registry**, not user identity issuance.

---

## Family H — License continuity (optional / dependent only)

| Concept | Code | Documentation |
|---------|------|---------------|
| License transfer hook | [`apps/id-dashboard/src/App.tsx`](../../apps/id-dashboard/src/App.tsx) (`handleRecoveryComplete`) | — |
| License utils | [`apps/id-dashboard/src/utils/licenseVerification/`](../../apps/id-dashboard/src/utils/licenseVerification/) | [`LICENSING_UPDATE.md`](../../LICENSING_UPDATE.md) |

**Enablement warning:** `zkpManager.ts` uses ECDSA labeled as ZK; **do not lead claims** on license ZK until hardened. Defer to dependent claims or future filing.

---

## Aug 2025 provisional section tagging

| Provisional section | Action |
|---------------------|--------|
| Abstract (ML enforcement, FIPS, atomic swaps) | **DROP** |
| Claims 1–11 broad system | **REWRITE** → 4 narrow independents in CLAIMS_DRAFT |
| Shamir recovery + custodians | **KEEP** (rewrite to match vault.ts) |
| Automated license transfer | **DEPENDENT ONLY** (enablement gap) |
| Commercial usage ML module | **DROP** |
| Decentralized auth without OAuth | **DROP** (contradicts implementation) |
| Quantum-resistant (Kyber/Dilithium hybrid) | **REWRITE** → ML-DSA/ML-KEM PQC-only |
| Notary / physical-world bridging (Claim 11) | **DROP** |
| Code examples (AuthenticationModule, etc.) | **REPLACE** with real flows from SOURCE_MAP |
