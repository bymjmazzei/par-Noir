# Prior art exclusions and differentiation

**Purpose:** Guide counsel on crowded fields, known references, and what **not** to claim. This is not a formal freedom-to-operate or patentability opinion.

---

## Crowded fields (expect examiner citations)

### 1. Social recovery + secret sharing

**Known references:**

- Block, Inc. — US 12,536,531, US 12,579,542 (social recovery, Shamir-style shares, recovery devices)
- Coinbase — US 12,561,456 (split key backup, verifiable encryption)
- Ledger Recover — patent-pending; Pedersen VSS, 2-of-3 custodians, IDV-gated restore
- Ethereum ecosystem — Argent, Safe, ERC-4337 social recovery patterns (guardian quorum, timelock)
- RWoT / IPTF — social recovery pattern documents
- SLIP-0039 — Shamir backup standard for wallets

**Do not claim broadly:** “Threshold custodian recovery using Shamir secret sharing.”

**Differentiate on:**

- Portable **pN identity file** with passcode-sealed shares in the same artifact as PQC identity blob
- Recovery state on **user-controlled cloud sheets** (`recovery.xlsx`), not HSM custodians or on-chain guardians only
- **Unrevokable custodian** requirement: `recoveryMeetsQuorumRule` requires `includesUnrevokableShare === true`
- **ZK v2** custodianship + approval contexts (`par-noir.zkp.recovery_custodian`, `par-noir.zkp.recovery_approval`)
- **Same public key** Shamir recovery vs **re-key migration** with pinned folder (dual-path)

---

### 2. Self-sovereign identity / DIDs

**Known references:**

- W3C DID Core 1.0, Verifiable Credentials Data Model
- WO2021173265A1 — decentralized authentication anchored by DIDs
- Evernym — US 8,874,770; DKMS (DHS-funded); trustee sharding
- Microsoft ION / Sidetree — scalable DID on Bitcoin
- Academic surveys (e.g. arXiv 2402.02455) on SSI

**Do not claim broadly:** “Self-sovereign identity without central authority” or “DID-based authentication.”

**Differentiate on:**

- **Three-factor unlock** (file + name + passcode) of a single portable artifact
- **PQC-only** identity wire format (`formatVersion: 1`, ML-DSA-65, ML-KEM-768, SHA3-384)
- **Proof-of-work** = credential-driven PQC issuance (not blockchain mining)
- User-owned **cloud folder contract** tied to identity, not ledger-anchored DID document only

---

### 3. Zero-knowledge proofs / selective disclosure

**Known references:**

- W3C BBS+ cryptosuite (vc-di-bbs)
- SD-JWT selective disclosure
- Academic: “On Cryptographic Mechanisms for the Selective Disclosure of Verifiable Credentials” (arXiv 2401.08196)

**Do not claim broadly:** “Zero-knowledge proof verification for identity” or “Schnorr discrete log proofs.”

**Differentiate on:**

- Specific **ZK v2 envelope**: `stark_genstark_sha256_ml_dsa_binding_v2`, SHA3-384 binding digest, ML-DSA-65 outer signature
- Recovery-specific **context strings** and public input shapes in `recoveryZkContexts.ts`

---

### 4. Software license binding and transfer

**Known references:**

- Microsoft — secure transfer of product-activated software between machines (2008/0276321)
- Intel — US 5,568,552 roving license between nodes
- Wibu-Systems — license container bound to device unique identity (D-UID)
- Recent applications on license binding to device (e.g. 20250209139)

**Do not claim broadly:** “Cryptographic license binding to identity” or “automatic license transfer” as **lead** independent claim.

**Differentiate on (if kept as dependent):**

- License continuity triggered by **Shamir recovery** or **network succession** event, not machine hardware fingerprint roving
- **Current enablement gap:** `licenseVerification/zkpManager.ts` is partially stubbed—counsel should underclaim or omit until implemented

---

### 5. Personal data aggregation / user cloud vault

**Known references:**

- Apothesource — US 2016/0034713 (aggregate personal data on user-controlled devices, cloud backup)
- US 2010/0262837 — personal digital data ownership and vaulting
- US 2012/0203733 — personal cloud engine
- Recent personalized data management applications (2025)

**Do not claim broadly:** “Aggregating user data into user-controlled cloud storage.”

**Differentiate on:**

- **Public** file index (`public-file-index.xlsx`) as **membership truth** for a **public feed**
- Operator PostgreSQL as **non-authoritative cache**
- **Reconcile algorithm** that purges stale cache rows when index diverges; skip on auth errors (no mass purge)
- Aggregator client **API-only** storage access rule

---

### 6. Hosted OAuth / “Sign in with X”

**Known references:**

- OAuth 2.0, OpenID Connect standards
- Every major identity provider client registry model

**Do not claim:** “Authentication without central OAuth servers.”

**Accurate description:**

- User-held identity secrets; API hosts **OAuth client registry** and storage mediation (analogous to “Sign in with Google” client registration, not passport issuance).

---

## Claims and concepts to exclude entirely

| Excluded concept | Reason |
|------------------|--------|
| ML Random Forest / SVM commercial detection | Not implemented; crowded if it were |
| Differential privacy (Laplace, ε-δ) for usage monitoring | Not implemented |
| Atomic swaps for license payment | Not implemented |
| Notary public verifiable credentials | Not implemented (Veriff KYC is different) |
| FIPS 140-3 Level 4, HSM integration | Not shipped; contradicted by security docs |
| “Military-grade” / “top-secret” security levels | Marketing; deprecated in SDK/security docs |
| Blind messaging routing | ADR documents no-go |
| IPFS as primary storage | Drive is primary; IPFS ancillary |
| Blockchain immutable audit logs | Not implemented |
| secp256k1 / ECDSA-P384 as primary identity crypto | Contradicts PQC-only production path |

---

## Aug 2025 provisional — prosecution risk if retained verbatim

| Provisional element | Risk |
|---------------------|------|
| Claim 6–7, 10 (ML usage monitoring) | § 102/103 vs analytics patents; § 112 (not enabled) |
| Claim 5, 9 (no OAuth servers) | § 112 inconsistency with product |
| Claim 11 (notary oracle) | § 112 (not enabled) |
| Abstract (FIPS, atomic swaps) | Overbreadth; credibility |
| Code examples (generic AuthenticationModule) | § 112 if cited as only embodiment |

---

## Suggested examiner interview talking points

1. par Noir is **not a cryptocurrency wallet**; the asset is a **portable identity file** with user-owned cloud structure.
2. The **unrevokable custodian rule** is a concrete policy encoded in quorum logic, not generic m-of-n social recovery.
3. **Public index reconcile** inverts the usual social-platform model (platform DB owns membership).
4. **Dual-path continuity** (same-key recovery vs re-key succession) addresses different threat models in one protocol.

---

## Counsel action items

1. Run formal search on: unrevokable custodian + cloud recovery vault; public index reconcile feed; PQC portable identity file three-factor. Exploratory pass completed July 6, 2026 — see [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md) for verified references (Block US 12,536,531 family, Coinbase US 12,561,456, did:plc, Solid, DID-KR, PQC wallet-file NPL) and § 103 combination risks.
2. Map each independent claim element to [SOURCE_MAP.md](./SOURCE_MAP.md) for § 112 support.
3. Tag PROV vs CIP-NEW per claim for priority date strategy.
4. Consider divisional applications later for Prism, messaging, creator fund if product significance warrants separate filings.
