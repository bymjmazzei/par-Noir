# Invention disclosure — par Noir pN protocol

**For:** Patent counsel  
**Inventor:** Mark Jonathan Mazzei  
**Date:** July 5, 2026  
**Status:** Technical disclosure — not legal advice

---

## One-sentence summary

par Noir is a computer-implemented protocol in which a user holds a post-quantum identity file, stores encrypted identity and metadata on user-controlled cloud storage with a cryptographically governed recovery vault, and exposes public content through a reconciled aggregator whose membership truth is the user's own public index—not a platform-owned database.

---

## Problem

1. **Centralized identity** — Users depend on issuers (Google, employers, governments) for identifiers and recovery.
2. **Platform-owned public content** — Social feeds and indexes live on operator databases; users do not own membership truth.
3. **Weak or issuer-dependent recovery** — Wallet seed phrases, account reset emails, or on-chain guardians do not generalize to portable identity + user-owned cloud.
4. **Integrator data sprawl** — Third-party apps store copies of user data instead of operating on user infrastructure.
5. **Surveillance-capitalism data model** — Platforms become the system of record: they harvest user data, store it in operator databases, and monetize it. Users cannot revoke access at the source, broker selective disclosure, or participate in collective bargaining over their aggregate data.

---

## Design philosophy — user as source of truth

par Noir inverts the surveillance-capitalism default: **the user—not the platform—is the authoritative store** for identity metadata, recovery state, public visibility, third-party permissions, and zero-knowledge attestations.

| Layer | User-held truth | Operator role |
|-------|-----------------|---------------|
| Identity | Portable `.pn` file + encrypted payload on user cloud | Coordinator; never holds pn name, passcode, or private keys |
| Public feeds | `public-file-index.xlsx` on user cloud | Derivative Postgres cache reconciled against the index |
| Third-party access | `third-party-permissions.xlsx` + `zkp-data-points.xlsx` on user cloud | Proof and permission APIs; integrator silos confined to `integrators/{client_id}/` |
| Aggregate / engagement (roadmap) | File and pN metadata on user cloud per architecture restructure | Portal and query interfaces only |

**Selective disclosure:** Third parties receive **cryptographic proofs** of predicates (age, location, identity attestation, etc.) rather than raw PII. Grants are revocable by updating user-held permission records.

**Brokers (future L5 embodiments):** Data unions, exchanges, and integrators may act as **brokers**—obtaining user consent and presenting proofs or aggregated attestations to buyers—without the broker or par Noir operator storing the underlying vault or becoming the merchant of record for user data sales. Paid access to aggregate data is an economic layer on top of consent + ZKP machinery, not a platform extraction model.

**Implemented today:** User cloud layout, public index truth, ZKP data points, third-party permissions, integrator silos, API proof endpoints.

**Not yet implemented:** Data unions, data exchanges, pricing/settlement for paid proof access, full decentralization of engagement metrics per `docs/ARCHITECTURE_RESTRUCTURE.md`.

---

## Solution (three pillars)

### Pillar 1 — pN identity protocol

- User creates a **portable identity file** (`.pn`) by supplying a pn name and passcode.
- System performs **credential-driven post-quantum key generation** (ML-DSA-65 + ML-KEM-768); no central issuer, no blockchain mining.
- Unlock requires **three factors**: the file, pn name, and passcode together.
- Identity blob includes optional **Shamir recovery material**: recovery envelope and passcode-sealed shares embedded in the same artifact.

### Pillar 2 — User-owned secure cloud + recovery vault

- User connects **user-controlled cloud storage** (e.g. Google Drive); par Noir defines a **folder layout** under `par Noir - {pnIdentifier}/_metadata/`.
- **Recovery vault** (`recovery.xlsx`) tracks custodians, pending shares, and approvals on the user's cloud.
- **Social recovery** uses Shamir secret sharing (threshold 2–5, total shares 2–5) with custodian entities (person, service, or self).
- **Protected custodian policy:** recovery requires threshold custodian approvals **and** at least one approval from an **unrevokable** (protected) custodian in accepted status.
- Custodian approvals present **zero-knowledge proof envelopes** (custodianship credential + approval proof) verified by a coordinating API.
- **Dual-path continuity:**
  - **Shamir recovery** — same cryptographic public key; user sets new passcode; same network identity binding.
  - **Re-key migration** — new ML-DSA/ML-KEM keys, new `pn-*` identifier; **pinned** cloud folder migrated in place; **network succession** retires predecessor for OAuth, storage, feeds; offline decrypt of old file still possible.

### Pillar 3 — Public index aggregation

- User marks files public in **`public-file-index.xlsx`** on their cloud (membership truth).
- Operator maintains **PostgreSQL cache** (`aggregator_*` tables) for feed performance only.
- **Background reconcile job** (e.g. every 5 minutes) removes cache rows whose `fileId` is not in the owner's current public index.
- **Aggregator browser** accesses storage **only through the coordinating API**, not direct cloud provider OAuth.

### Optional embodiments (not lead claims)

- Per-integrator folder `integrators/{oauth_client_id}/` with API path confinement.
- ZK v2 envelope (STARK inner proof + ML-DSA outer binding) for attestations and recovery authorization.
- **User-sovereign data brokering** — standard data points, revocable grants on user cloud, proof APIs; optional broker entities (union, exchange, integrator) relaying ZK-gated access without holding unlock secrets (FIG. 13).
- License rebinding on recovery/succession (implementation partially stubbed—dependent claims only).
- **Future economic layer** — data unions and exchanges brokering paid access to user-authorized proofs or aggregates (dependent / continuation filing; not lead independent claims).

---

## Key differentiators vs prior art

| Prior art area | Typical approach | par Noir difference |
|----------------|------------------|---------------------|
| Wallet social recovery (Block, Coinbase, Ledger) | Seed phrase shards; HSM or on-chain guardians | Portable **identity file** + **user cloud vault** + **unrevokable custodian** policy; not wallet-only |
| SSI / DKMS (Evernym, W3C DID) | DID documents on ledger; wallet backup | **Three-factor file** + **Drive-structured** recovery state; API coordinator without holding unlock secrets |
| Personal cloud vault patents | Aggregate private data to user vault | **Public index on user cloud** as feed membership truth + **reconcile** against operator cache |
| Smart-wallet social recovery (Argent, ERC-4337) | On-chain guardian quorum + timelock | Off-chain user storage sheets + ZK approvals; **same-key** vs **re-key** paths |
| Software license transfer (Microsoft, Intel) | Machine-bound license roving | Optional license continuity tied to **identity recovery/succession** (dependent, not lead) |

---

## What we dropped from the August 26, 2025 provisional

The following were in the provisional but are **excluded** from this nonprovisional draft because they are unsupported, inaccurate, or weak prior-art targets:

- Machine-learning commercial usage detection (Random Forest, SVM, differential privacy)
- Atomic swap cryptocurrency license payments
- Notary public / physical-world oracle (Claim 11)
- FIPS 140-3 Level 4, HSM, “military-grade” security
- “Self-sovereign authentication without central OAuth servers” (par Noir operates hosted OAuth client registry)
- secp256k1 / ECDSA-P384 as primary identity cryptography (shipped stack is PQC-only: ML-DSA, ML-KEM, SHA3-384)
- Blockchain-style Merkle audit logs for license transfer
- Leading with unified license framework + automated ML enforcement

---

## Recommended claim strategy

1. **Lead independent:** System/method for recovery vault on user cloud with unrevokable custodian policy and ZK-gated approvals.
2. **Second independent:** Method for Shamir recovery preserving identity public key.
3. **Third independent:** Method for re-key migration with pinned storage folder and network succession.
4. **Fourth independent:** System/method for public content aggregation with user index as truth and reconciled server cache.

File as **CIP** claiming Aug 2025 priority for overlapping recovery/identity matter; new matter (PQC wire format, reconcile, unrevokable rules, re-key) at CIP filing date.

---

## Commercial significance

- Infrastructure for user-owned identity and public content without surrendering data to a central content database.
- Enables third parties (L5 integrators) to use user cloud silos via API rather than storing user data.
- Recovery and succession designed for long-lived identity + cloud continuity, not single-device wallets.
- **Inverts surveillance capitalism at the protocol layer:** users hold permissions and attestations; platforms coordinate access. Long-term, users or unions/exchanges they choose can broker aggregate data access instead of operators harvesting and reselling by default.

---

## References in repository

- Full spec draft: [NONPROVISIONAL_DRAFT.md](./NONPROVISIONAL_DRAFT.md)
- Claims: [CLAIMS_DRAFT.md](./CLAIMS_DRAFT.md)
- Enablement map: [SOURCE_MAP.md](./SOURCE_MAP.md)
- Prior art notes: [PRIOR_ART_EXCLUSIONS.md](./PRIOR_ART_EXCLUSIONS.md)
