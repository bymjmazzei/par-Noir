# NONPROVISIONAL PATENT APPLICATION — DRAFT SPECIFICATION

**ATTORNEY REVIEW REQUIRED — NOT FOR FILING AS-IS**

---

## CROSS-REFERENCE TO RELATED APPLICATIONS

This application claims the benefit of priority under 35 U.S.C. § 119(e) to U.S. Provisional Application No. **[TO BE SUPPLIED]**, filed August 26, 2025, entitled *Distributed Identity Management System with Social Recovery and Unified License Framework*, the entire contents of which are incorporated herein by reference.

Counsel to confirm whether to file as **nonprovisional** or **continuation-in-part (CIP)** and to map priority for new matter described herein.

---

## TITLE OF THE INVENTION

**Computer-Implemented Protocol for User-Held Post-Quantum Identity, User-Owned Cloud Recovery Vault, and Reconciled Public Content Indexing**

---

## FIELD OF THE INVENTION

The present invention relates to computer-implemented identity management, cryptographic recovery, user-controlled cloud storage, and content aggregation. More particularly, embodiments relate to a portable post-quantum identity artifact, a recovery vault on user-owned cloud storage with threshold custodian policy including protected custodians, dual-path identity continuity (same-key recovery and re-key succession), and a public content aggregator whose membership truth is a user-authored index reconciled against a performance cache.

---

## BACKGROUND

### Problems in conventional identity and content systems

Traditional identity systems rely on centralized issuers. Users cannot self-issue cryptographic identity without a registration authority. Recovery typically depends on email reset, help desks, or seed phrases held by a single person. Loss of the seed or device often implies permanent loss of identity-bound resources.

Social and wallet systems have introduced guardian-based recovery and Shamir secret sharing for cryptocurrency keys. Such systems generally target wallet seeds, on-chain smart contract guardians, or hardware security module custodians—not a portable identity file integrated with a structured user-owned cloud layout spanning identity metadata, recovery state, permissions, and public indexes.

Self-sovereign identity (SSI) frameworks promote decentralized identifiers (DIDs) and verifiable credentials. Many implementations anchor DIDs on distributed ledgers and treat wallet backup as a separate concern. Few specify a three-factor portable file, a cloud-resident recovery vault with explicit custodian lifecycle and protected custodian rules, and a dual-path model distinguishing same-key recovery from full cryptographic re-key with network succession.

Content aggregation platforms typically store public content membership in operator-controlled databases. When a user deletes content or revokes public visibility in their own storage, operator caches may remain stale. Personal-data vault patents describe aggregating private user data to user-controlled storage but do not treat a user-authored **public index** as authoritative membership truth for a reconciled public feed.

Under surveillance-capitalism models, platforms also become the system of record for user profiles, behavioral data, and third-party sharing consent. Users cannot revoke access at the authoritative store; operators monetize harvested data. Selective disclosure via cryptographic proofs, with grants recorded on user-controlled storage and revocable by the user, is not widely specified as a unified protocol alongside portable identity and user-owned cloud layout.

Third-party applications traditionally store user data in application-specific databases. A model in which each integrator receives a confined folder on the user's own cloud, with standard identity data points accessed only through proof APIs, is not widely specified. A further embodiment in which broker entities (e.g. data unions or exchanges) obtain user consent and relay zero-knowledge proofs or aggregated attestations to verifiers—without storing the underlying identity vault—is not specified in prior personal-cloud or SSI systems.

### Need for the invention

There is a need for a unified protocol in which:

1. A user holds a self-issued post-quantum identity artifact unlocked only by three factors.
2. Recovery state and public visibility state live on user-controlled cloud storage under a defined layout.
3. Social recovery requires both threshold custodian approval and approval from a protected custodian, with cryptographic proof of authorization.
4. Identity continuity supports both same-key recovery and full re-key with pinned cloud folder migration and network succession.
5. Public feeds are served from a cache reconciled against the user's public index, without the operator owning membership truth.
6. Third-party access to sensitive attributes is mediated through user-held permission records and zero-knowledge proofs, enabling users—or broker entities acting with user consent—to grant and revoke selective disclosure without surrendering raw data to a platform database.

---

## SUMMARY OF THE INVENTION

In one aspect, a computer-implemented method comprises: receiving, at a client device, a portable identity file, a pn name, and a passcode; deriving a decryption key from the pn name and passcode; decrypting a post-quantum identity payload bound to ML-DSA and ML-KEM key material; and accessing a recovery vault on user-controlled cloud storage that tracks custodian entities, share indices, and approval records.

In another aspect, a recovery method comprises: receiving a threshold number of custodian approvals each accompanied by a custodianship zero-knowledge proof and an approval zero-knowledge proof; verifying that at least one approval corresponds to a protected custodian in accepted status; combining Shamir shares to obtain a recovery master; decrypting a recovery envelope; and re-encrypting the identity payload with a new passcode while preserving an identity public key.

In another aspect, a re-key migration method comprises: generating new post-quantum keys; pinning a user cloud folder identifier; migrating encrypted objects and index sheets within the pinned folder; generating a lineage proof binding predecessor and successor identifiers; and registering network succession such that a predecessor identifier is rejected for online network-backed operations while offline decryption of a predecessor file remains possible.

In another aspect, an aggregation method comprises: maintaining a server-side cache of public content metadata; periodically reading a user-authored public file index from user-controlled cloud storage; removing cache entries not listed in the index; and serving feed queries from the cache.

In another aspect, a selective disclosure method comprises: storing, on user-controlled cloud storage, a permissions record listing integrator grants and a data-points store of zero-knowledge proof envelopes; receiving a proof request from an integrator or broker entity; verifying that the permissions record authorizes the request; and returning a proof envelope satisfying a predicate without transmitting underlying plaintext sensitive attributes.

Representative embodiments are illustrated in FIG. 1 through FIG. 13.

---

## BRIEF DESCRIPTION OF THE DRAWINGS

**FIG. 1** is a block diagram of a par Noir system architecture including a pN client, user cloud, coordinating API, aggregator cache, aggregator browser, and integrator.

**FIG. 2** is a flowchart of identity creation including post-quantum key generation, Shamir splitting, and sealed shares.

**FIG. 3** is a flowchart of three-factor unlock of the portable identity file.

**FIG. 4** is a state diagram of a recovery vault spreadsheet including pending shares, custodian rows, and an unrevokable flag.

**FIG. 5** is a sequence diagram of custodian zero-knowledge approval submission and quorum evaluation.

**FIG. 6** is a flowchart of Shamir recovery completion preserving the identity public key.

**FIG. 7** is a flowchart of a re-key migration pipeline with pinned folder continuity.

**FIG. 8** is a diagram of network succession effects on predecessor and successor identifiers.

**FIG. 9** is a tree diagram of a user cloud folder layout.

**FIG. 10** is a flowchart of a public index reconcile loop.

**FIG. 11** is a block diagram of an integrator silo with API path confinement.

**FIG. 12** is a structural diagram of a zero-knowledge proof envelope version 2.

**FIG. 13** is a sequence diagram of user-sovereign selective disclosure via a broker entity (integrator, data union, or exchange).

---

## DETAILED DESCRIPTION

### Definitions

As used herein:

- **Portable identity file (pN file)** — A user-held digital artifact containing at least an encrypted identity payload, optional recovery envelope, and optional passcode-sealed Shamir shares.
- **pn name** — A user-chosen identifier participating in key derivation with the passcode.
- **Passcode** — A user-chosen secret participating in key derivation with the pn name.
- **Three-factor unlock** — Decryption requiring the portable identity file, pn name, and passcode together.
- **Recovery master** — A random secret from which Shamir shares are derived and which keys the recovery envelope.
- **Custodian entity** — A trusted party (person, service, self, or device) designated to hold a Shamir share and approve recovery.
- **Protected custodian (unrevokable)** — A custodian assigned with a flag preventing owner revocation; required for recovery completion in representative embodiments.
- **Recovery vault** — User-cloud state, e.g. a spreadsheet, tracking pending shares, custodian assignments, and recovery requests.
- **Public index** — A user-authored list of publicly visible file identifiers on user-controlled cloud storage.
- **Reconcile** — A background process aligning a server cache with the public index.
- **Predecessor / successor** — Network identifiers before and after a re-key migration; predecessor retired online after succession registration.
- **Broker entity** — A third party (integrator, data union, data exchange, or verifier-facing intermediary) that obtains user consent and relays zero-knowledge proofs or aggregated attestations without holding pn name, passcode, or private keys.
- **Selective disclosure** — Releasing a cryptographic proof that a predicate holds (e.g. age threshold) without releasing underlying plaintext sensitive attributes.

### System overview (FIG. 1)

System 10 includes user device 100 executing pN client 102. User device 100 stores portable identity file 104 locally. User-controlled cloud storage 110 (e.g. Google Drive or another provider) holds folder tree 111 under a pn-specific root. Coordinating API server 120 mediates storage access using stored OAuth credentials; API 120 maintains OAuth client registry 122 for third-party applications but does not store pn name, passcode, or private keys. Reconcile module 124 periodically aligns aggregator cache database 130 with public index 112 on cloud 110. Aggregator browser 140 requests feeds only from API 120. Integrator 150 accesses user cloud 110 only through scoped API drive proxy paths.

This architecture inverts surveillance-capitalism data ownership: **the user is the source of truth** for identity metadata, recovery state, public membership, third-party permissions, and stored attestations on cloud 110. The operator cache 130 and API 120 are coordinators and performance derivatives—not authoritative stores for membership, consent, or sensitive attributes. Users may grant integrators or broker entities selective access via proofs; revocation updates user-held permission records without requiring operator cooperation.

### Identity creation (FIG. 2)

Upon user request to create an identity, client 102 receives pn name and passcode at step 200. At step 202, client 102 invokes post-quantum key generation producing ML-DSA-65 signing keys and ML-KEM-768 encapsulation keys. Identity wire format version 1 records `sigAlgId=ML-DSA-65`, `kemAlgId=ML-KEM-768`, `hashPolicyId=SHA3-384`.

At step 204, client 102 encrypts a JSON identity payload containing private keys and metadata using AES-GCM with a key derived from pn name and passcode (e.g. PBKDF2 with SHA-512, one million iterations, per-shard salt). Public keys remain available in cleartext in file 104 for binding and verification.

At step 206, client 102 generates recovery master R (e.g. 32 random bytes) and applies Shamir secret sharing with threshold T and total shares N, where in representative embodiments 2 ≤ T ≤ 5 and T ≤ N ≤ 5.

At step 208, client 102 builds recovery payload including identity id, pn name, public key, recovery configuration, and sealed PQC secret references; encrypts payload with AES-GCM keyed by R to form recovery envelope 209.

At step 210, client 102 seals the list of Shamir shares into sealed shares block 211 using AES-GCM with key derived solely from pn name and passcode, distinct from identity payload encryption salt.

At step 212, client 102 assembles file 104. At step 214, owner distributes individual shares to custodian entities; unassigned shares may be stored encrypted in recovery vault pending shares sheet 402 on cloud 110.

### Three-factor unlock (FIG. 3)

Unlock at step 300 requires file 104, pn name, and passcode. Step 302 derives key material. Step 304 decrypts identity payload; failure at step 306 indicates wrong factors or corrupted file. Step 308 optionally unseals shares from block 211. Step 310 exposes signing and encapsulation to client modules. Session objects stored on device 100 exclude pn name and passcode.

### User cloud layout (FIG. 9)

Under root `par Noir - {pnIdentifier}/`, metadata folder `_metadata/` contains:

- `profile.json` — non-secret profile fields
- `public-file-index.xlsx` (112) — authoritative public membership list
- `owner-file-index.xlsx` — private file index
- `recovery.xlsx` (400) — recovery vault
- `zkp-data-points.xlsx` — stored ZK proof envelopes for standard data points
- `third-party-permissions.xlsx` — integrator grants
- `integrators/` root with per-`{oauth_client_id}` silos (FIG. 11)
- Content-class subfolders (`media/`, `thoughts/`, `collections/`) each with public and owner index sheets

Messages folder `par-noir-messages/` is created on demand. Layout is provider-agnostic; sheets may be implemented as cloud spreadsheet files or equivalent structured storage.

### Recovery vault (FIG. 4)

Recovery vault 400 on cloud 110 includes:

**PendingShares 402:** rows with shareIndex, encryptedShare (encrypted to owner identity public key), createdAt.

**Custodians 404:** rows with custodianId, name, type, encryptedShare, shareIndex, custodianshipCredential (ZK envelope string), status ∈ {invited, accepted, revoked}, unrevokable flag 406, timestamps.

**Recovery Ready 408:** accepted custodian count ≥ threshold T AND count of accepted custodians where unrevokable=true ≥ 1.

Revocation of protected custodian 406 is rejected with error `custodian_unrevokable`. Revoking revokable custodian returns share to pending pool.

Representative quorum logic (adapted from implementation):

```
function recoveryMeetsQuorumRule(approvals, custodians, threshold):
  thresholdMet = (approvals.length >= max(2, threshold))
  includesUnrevokableShare = false
  for each approval in approvals:
    row = findCustodian(custodians, approval)
    if row.unrevokable AND row.status == accepted:
      includesUnrevokableShare = true
      break
  ready = thresholdMet AND includesUnrevokableShare
  return ready
```

### Custodian ZK approvals (FIG. 5)

Owner issues custodianship ZK envelope 500 with context `par-noir.zkp.recovery_custodian` and public inputs including identity_public_key, custodian_id, share_index, invitation_id, threshold, optional unrevokable.

Upon recovery request 504, custodian generates approval ZK envelope 506 with context `par-noir.zkp.recovery_approval` and public inputs including request_id, custodian_id, share_index.

Custodian submits payload 508 to API 120: `{ custodianId, shareIndex, approvalZkp, custodianshipZkp, approvedAt }`.

API 120 verifies envelopes per ZK v2 rules (FIG. 12), updates request record on cloud 110, evaluates quorum rule 510. Deprecated share-only submission endpoints return HTTP 410 Gone in favor of ZK approval path.

### Shamir recovery completion (FIG. 6)

When quorum rule satisfied (step 600), system collects shares (step 602) from custodian encrypted shares and/or sealed shares block 211 after unlock. Step 604 combines shares via Shamir reconstruction to recovery master R. Step 606 decrypts envelope 209. Step 608 verifies payload public key equals file 104 public key—recovery does not rotate asymmetric keys. User provides new passcode (step 610). Step 612 re-encrypts identity payload; ML-DSA public key unchanged.

### Re-key migration (FIG. 7)

Distinct from FIG. 6, re-key migration rotates keys. User initiates from dashboard (step 700). New ML-DSA/ML-KEM pairs generated (702). Storage credentials pin driveFolderId 704. Migration wizard executes steps including: zkp_reissue 706 (re-sign data point proofs on cloud), drive_files 708 (re-wrap encrypted blobs, patch sheet identifiers), recovery_vault 710 (new envelope and pending shares), dm_rekey 712 (client-side messaging rekey via browser), lineage_zkp 714 (dual-signed succession proofs), custodian_reinvite, succession_register 718.

Folder renamed to successor pn identifier (716). Report written to `_metadata/migration-{id}-report.json`. Integrators receive `_pn_migration_manifest.json`.

### Network succession (FIG. 8)

After succession_register, predecessor identifier 800 is revoked for: new OAuth authorization codes, token exchange and refresh, storage credential binding, feed creation with predecessor creator DID, API key validation. Successor identifier 802 assumes bindings migrated in one transaction where applicable.

Predecessor file 104 may still decrypt offline (804). Integrators call succession endpoint 806 (`GET /api/v1/identity/successor?pn_identifier=`) to detect retirement.

Estate-planning succession displayed in dashboard is separate from Shamir recovery; documentation distinguishes them for users and integrators.

### API coordinator role

API 120 provides:

- OAuth 2.0 / OpenID Connect-style authorization for third parties (client registry 122)
- Storage credential storage and Drive/proxy APIs using user-granted tokens
- Recovery request and approval endpoints
- Identity migration and succession registration
- Aggregator metadata-index and reconcile endpoints

Identity-direct secrets remain on device 100 inside file 104. API 120 is a coordinator analogous to an OAuth authorization server plus storage broker—not an identity issuer. Aggregator browser 140 does not call cloud provider APIs directly.

### Public index aggregation (FIG. 10)

**Membership truth:** public index 112 on cloud 110 lists fileId values with visibility public. Content-class indexes may supplement root index.

**Cache:** database 130 tables (e.g. aggregator_media, aggregator_thoughts, aggregator_collections) store denormalized metadata for query performance.

**Reconcile job 124** (representative interval 5 minutes):

1. Enumerate pn identifiers with rows in cache 130.
2. Load authorized public fileIds from index 112 via owner storage context (Drive sheets or portable storage API).
3. If index missing or empty public set → remove all cache rows for that user.
4. Else delete cache rows whose fileId ∉ authorized set.
5. On authentication failure (401/403/invalid_grant) → skip user without purge.
6. Optional grace window after publish to avoid race with background index writes.

Upload path: API writes cache and index together. Delete-via-app path removes storage, index entry, and cache row immediately without waiting for reconcile.

### Integrator silo (FIG. 11)

Third-party integrator 150 registers client_id 152. Upon user grant with `cloud:app` scope, API provisions `integrators/{client_id}/` on cloud 110. Drive proxy 154 rejects paths outside silo. Sensitive standard data points remain in `zkp-data-points.xlsx`; integrator accesses proofs via API 156 with user consent recorded in `third-party-permissions.xlsx`. L5 integrators do not read `_metadata` ZKP sheet via Drive proxy.

### User-sovereign selective disclosure and broker entities (FIG. 13)

Representative embodiments extend the integrator model to **broker-mediated selective disclosure** without making the coordinating API 120 or any broker the merchant of record for user data.

**User-held authoritative records on cloud 110:**

- `third-party-permissions.xlsx` (160) — rows per integrator or broker entity: OAuth client id, granted scopes, data point identifiers, expiration, consent timestamp.
- `zkp-data-points.xlsx` (162) — stored ZK v2 envelopes for standard data points (e.g. age attestation, location verification) bound to the user's identity public key.

**Proof request flow (FIG. 13):**

1. User 100 authorizes grant 1300 in dashboard client 102; API 120 writes permission row to sheet 160 on cloud 110.
2. Integrator 150 or broker entity 158 (e.g. data union or data exchange acting for member users) submits proof request 1302 to API 156 with bearer token scoped to granted data points.
3. API 120 reads permissions 160 from cloud 110; if grant absent or expired, request rejected at step 1304.
4. API 120 retrieves envelope from data-points store 162; verifies envelope expiry and ML-DSA/STARK binding at step 1306.
5. API 120 returns proof envelope 1308 to requester; underlying plaintext (date of birth, email, etc.) is not transmitted.
6. Verifier 159 evaluates predicate from public inputs in envelope 1308 without receiving raw sensitive attributes.

**Revocation:** User updates or deletes permission row in sheet 160; subsequent proof requests fail at step 1304 even if envelope 162 remains on cloud 110.

**Broker entities without vault custody:** Broker 158 does not receive pn name, passcode, private keys, or cleartext data points. Broker 158 may aggregate **proof-based attestations** across consented members (e.g. demographic band counts) for buyers 159; economic settlement between user and broker is outside the core protocol and may be implemented in L5 applications.

**Distinction from surveillance capitalism:** In conventional models, platform 120 stores behavioral and profile databases and sells access. In representative embodiments, platform 120 coordinates OAuth and storage proxy; **membership, consent, and attestations remain on user cloud 110**; buyers 159 verify predicates via proofs, not platform-held PII exports.

**Roadmap embodiments (not required for core protocol):** Engagement tallies and user action history in file metadata and pN metadata (per architecture restructure documentation); paid access pricing recorded in permission rows or broker contracts; formal data-union quorum consent for pooled disclosure. These are optional future L5 layers atop the user-held layout described herein.

### ZK proof envelope v2 (FIG. 12)

Envelope 1200 uses `zk_proof_type = stark_genstark_sha256_ml_dsa_binding_v2`. Binding digest computed per SHA3-384 over canonical public inputs, context, nonce. ML-DSA-65 signs signing_bytes excluding signature field. Inner STARK proof demonstrates binding register assertions. Verifiers reject expired envelopes and legacy non-v1/v2 blobs.

Used for age and data-point attestations and recovery custodianship/approval credentials.

### Optional embodiment — license continuity

In some embodiments, upon successful recovery (FIG. 6) or succession (FIG. 8), a license management module rebinding software license records from a predecessor identity hash to a successor hash may execute. Representative implementation hooks exist in dashboard recovery completion handler; cryptographic license proofs may use ML-DSA binding when fully enabled. This embodiment is optional and not required for practicing the core protocol.

### Alternative embodiments

- Cloud provider may be Microsoft OneDrive, Amazon S3, Azure Blob, or portable social cloud via API abstraction.
- Identity wire encoding may use CBOR or canonical JSON instead of mixed JSON/binary transport.
- Threshold T and share count N may vary within configured bounds.
- Reconcile interval and grace period configurable via environment.
- ZK v1 envelopes verified for stored legacy proofs during transition.
- Broker entity may be a data union, data exchange, integrator, or verifier-facing intermediary; protocol does not require a specific economic model.
- Paid access to aggregate proofs may be recorded as metadata in permission rows or off-protocol contracts between user and broker.

### Excluded embodiments

The following are expressly out of scope for representative implementations and omitted from independent claims:

- Blind routing where API does not learn message recipients (documented no-go)
- Machine-learning classifiers for commercial usage licensing enforcement
- Notary-issued physical document credentials
- Blockchain-anchored identity as sole root of trust
- Hardware security module as required element for user identity unlock

---

## EXAMPLES

### Example 1 — Recovery quorum evaluation

Given threshold T=2, custodians C1 (unrevokable, accepted) and C2 (revokable, accepted), and approvals from C1 and C2 for request RQ-101, `recoveryMeetsQuorumRule` returns ready=true. If C1 is only invited and C2 approved, ready=false with reason missing_unrevokable_approval.

### Example 2 — Reconcile purge

User U owns cache rows {fileA, fileB, fileC}. Public index 112 lists {fileA, fileC} only. Reconcile removes fileB from cache 130. User manually deletes index in cloud; next reconcile purges all rows for U unless auth error causes skip.

### Example 3 — Integrator confinement

Integrator client_id `app-xyz` attempts `GET /api/drive/files?path=_metadata/zkp-data-points.xlsx`. Proxy 154 returns forbidden because path outside `integrators/app-xyz/`. ZKP access proceeds via `/api/...` proof endpoints with bearer token.

### Example 4 — Broker-mediated proof without raw PII

User U grants data exchange broker B scope for `age_attestation` via permissions sheet 160. Buyer V requests age verification through B. B calls proof API 156 with U's delegated token. API returns ZK envelope 1308 proving age predicate; V verifies binding; neither B nor API 120 receives U's date of birth in plaintext. U revokes B's row in sheet 160; further requests fail at authorization step 1304.

---

## ABSTRACT

A computer-implemented protocol for user-held identity and user-owned public content indexing. A portable identity file stores a post-quantum encrypted identity payload unlocked by three factors: the file, a pn name, and a passcode. Shamir recovery material includes a recovery envelope and passcode-sealed shares. A recovery vault on user-controlled cloud storage tracks custodians and pending shares; recovery requires threshold custodian approvals verified by zero-knowledge proofs including at least one protected custodian. Same-key recovery re-encrypts the payload with a new passcode while preserving a public key. Re-key migration generates new keys, migrates a pinned cloud folder, and registers network succession retiring a predecessor identifier online. A coordinating API mediates storage and OAuth client registration without holding unlock secrets. Public feed membership is defined by a user-authored public index; a server cache is periodically reconciled to remove entries not in the index. Third-party permissions and zero-knowledge attestations are stored on user-controlled cloud storage; integrators and broker entities access sensitive attributes via proof APIs with revocable user grants, inverting platform-owned data models. Integrators may receive confined folders on user storage. The protocol enables self-issued identity, cryptographic recovery, selective disclosure, and aggregation without operator-owned membership or consent truth.

---

## END OF SPECIFICATION DRAFT

**Merged document:** Full counsel-review package at [PATENT_APPLICATION_DRAFT.md](./PATENT_APPLICATION_DRAFT.md) (specification + claims + abstract + figure appendix).

**Next steps for counsel:** Convert to USPTO format; refine formal claims; prepare black-and-white drawing PDFs from Appendix A; confirm priority and CIP strategy per [SOURCE_MAP.md](./SOURCE_MAP.md).
