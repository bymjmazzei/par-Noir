# Prior-art search — findings against current claim set

**Date:** July 6, 2026
**Scope:** Exploratory search of public sources (USPTO Official Gazette, Google Patents, EPO publication server, W3C/DIF specifications, IACR ePrint, public product documentation). **Not** a professional patentability or freedom-to-operate search; no paid databases, no file-wrapper review. Counsel must commission a formal search before filing.
**Purpose:** Stress-test the four independent claims and key dependents in [CLAIMS_DRAFT.md](./CLAIMS_DRAFT.md) as drafted — identify closest art, confirm which differentiators survive, and flag § 102/§ 103 risks. No new claims proposed.

---

## Reference table

| Ref | Citation | Assignee / source | Family hit | Risk to current claims |
|-----|----------|-------------------|------------|------------------------|
| P1 | US 12,536,531 B2 — *Methods and systems for managing cryptocurrency* (filed Jul 18 2023; prio. provisional Aug 8 2022) | Block, Inc. | Claims 1–2 | **High** — Shamir split of backup encryption key; shares encrypted to social recovery contacts' public keys; server coordinates contact verification; threshold reconstruction |
| P2 | US 2026/0120092 A1 (continuation in P1 family) | Block, Inc. | Claims 1–2 | High — same disclosure; cloud-stored encrypted shares; 2-of-3 contact example |
| P3 | US 2026/0095306 A1 — *Secure recovery mechanism with interactive time delay interface* | Block, Inc. | Claims 1–2 | Medium-high — PIN + OPRF/D-OPRF, MPC key custody, social recovery combined with time-locks, vault system |
| P4 | US 12,561,456 B2 — *Techniques for storing key backups* (filed Jun 7 2024) | Coinbase, Inc. | Claims 1–2 | Medium — two-portion split key; verifiable encryption; publicly verifiable backup without decryption |
| P5 | US 2024/0354753 A1 — *Provable backup confirmation for digital wallets using key shards* | (pending) | Claims 1–2 | Medium — Shamir/MPC quorum shards; proof of backup possession by shardholders |
| P6 | US 10,659,223 B2 — *Secure multiparty loss resistant storage and transfer of cryptographic keys…* | nChain | Claims 1–2 | Medium — foundational threshold-share storage for wallet keys; broad Shamir teaching |
| P7 | EP 4 404 505 A2 — *Decentralised protocol for the recovery of cryptographic assets* | nChain | Claims 1–2 | Medium — "congress" threshold consensus recovery; recovery password + deposit |
| P8 | US 2019/0280864 A1 — *Seed splitting and firmware extension…* | (Gemini-adjacent) | Claims 1–2 | Low-medium — M-of-N policy on HSM-held seed halves; HSM-bound (we expressly exclude HSM) |
| P9 | US 2026/0074895 A1 — *Decentralized sensitive information sharing* | (pending) | Claims 1–2 | Low — guardian participants hold shares; **owner may request share deletion** (teaches owner-controlled removal — arguably teaches *away* from our unrevokable custodian) |
| P10 | US 2021/0243037 — digital asset certificate inheritance transfer | (CN-origin) | Claim 3 (succession-adjacent) | Low — will-based transfer signed by authoritative entity |
| P11 | US 2023/0401661 A1 — *Digital platform asset management* | (pending) | Claim 3 (succession-adjacent) | Low — posthumous credential+instruction execution after death certificate |
| P12 | *Enabling transfer of digital assets* (US 13/961,725 family) | Amazon | Claim 3 (succession-adjacent) | Low-medium — Shamir shares distributed to designated successors of a cloud account |
| P13 | PCT/IB2025/057151 (Afterchain) | Afterchain | Claim 3 (succession-adjacent) | Low — post-mortem on-chain transfer; ZKP beneficiary eligibility |
| P14 | US 2026/0142820 A1 — *Universal trust token standard and interoperable credential wallet protocol* | (pending) | Claims 25, 27–29 | **Medium-high** — wallet-generated selective disclosure proofs, policy enforcement, revocation checks, auditable receipts |

## Non-patent literature (NPL)

| Ref | Source | Family hit | Notes |
|-----|--------|------------|-------|
| N1 | **did:plc specification** (Bluesky / plc.directory) | Claim 3 | Rotation-key-signed update log at central directory; **tombstone** operation permanently deactivates DID; 72-hour rewrite window. Closest public mechanism to "predecessor retired online by a coordinating server." DID string never changes; no storage migration; no lineage proof binding two distinct identifiers |
| N2 | **did:webvh portability** (DIF) | Claim 3 | Porting = deactivate old DID + create new DID with same SCID linking history — a predecessor/successor pattern with verifiable linkage. No pinned cloud folder, no PQC re-wrap, no OAuth/feed revocation semantics |
| N3 | **did:cid / MDIP proposal** (DIF) | Claim 3 | Registry migration without identity loss; signed operation history |
| N4 | **DID-KR spec** (Sirraya Labs) | Claims 1–2 | "Social ZKP Recovery": guardians produce **Schnorr ZKPs proving knowledge of their share** (Feldman VSS commitments) before reconstruction. Closest NPL to ZK-gated custodian approvals. Differs: proves share possession, not an owner-issued custodianship credential + per-request approval intent; no unrevokable policy; no user-cloud vault state |
| N5 | **Solid / Social Linked Data** (Berners-Lee et al., 2016+) | Claims 4, 24–26 | User-owned pods; ACL-permissioned app access to containers; decentralized social aggregation. Strong background art for "user storage is authoritative" and for per-app containers (≈ integrator silo). No operator-side feed cache reconciled against a user-authored public index; apps read pods directly |
| N6 | **SLIP-0039, Argent/ERC-4337 guardians, Ledger Recover (PVSS, 2-of-3 HSM custodians, IDV-gated)** | Claims 1–2 | Already catalogued in [PRIOR_ART_EXCLUSIONS.md](./PRIOR_ART_EXCLUSIONS.md); Ledger confirms identity-verification-gated restore in production |
| N7 | **pqc-agent-wallet** (PyPI, v0.1.0) | Claims 30–31 | **Distant structural analogy only, not a crypto wallet and not product-adjacent to par Noir.** It is an AI-agent credential vault (`*.wallet`) with PBKDF2 passphrase KDF, AES-256-GCM payloads, ML-KEM-768 unlock option, and ML-DSA-65 signatures. Relevant only if claim 30 is narrowed/elevated to generic "PQC encrypted file + passphrase KDF" language |
| N8 | **PassQuantum** (GitHub) | Claims 30–31 | Password-manager vault: Kyber768 + ML-DSA + AES-GCM, master-password gate. Distant structural analogy for generic vault-file elements only |
| N9 | **UPPR** (IACR ePrint 2025/1919) | Claims 27–29 | Privacy-preserving credential revocation (VRF tokens, Bloom filter cascade); shows revocation + ZKP space is active |
| N10 | **Web sitemap / crawler cache model** | Claim 4 | Analogy an examiner may raise: sitemap = publisher-authored index; crawler reconciles its cache against it. See § 103 risks below |
| N11 | `pqcrypt` v1.0.0 (PyPI) | Claims 30–31 | May 1, 2026 — ML-KEM-768 + X25519 hybrid `.age` files, ML-DSA-65 signatures; passphrase-encrypted keys on microSD |

---

## Analysis per independent claim (as currently drafted)

### Claim 1 — Recovery vault system (and claim 2 — same-key Shamir recovery)

**Closest art:** P1/P2 (Block) + N4 (DID-KR ZKP guardian approvals).

**What the art covers:** Shamir split of a backup key; shares encrypted to contacts; server-coordinated verification of contact approvals; threshold reconstruction; even ZK proofs by guardians (N4). Element (b)'s "custodian entities each associated with a share index and status" and element (c)'s "plurality of approval payloads" are individually well-trodden.

**What survives (no direct hit found):**

1. **Unrevokable / protected custodian quorum rule** — element (d)(ii). No reference found requiring at least one approval from a custodian the *owner cannot revoke*. P9 affirmatively teaches owner-controlled share deletion — useful for a **non-obviousness argument** (the art teaches owner supremacy over custodians; our rule deliberately removes it for one custodian).
2. **Recovery vault as structured state on user-controlled commodity cloud** (spreadsheet with pending shares / custodian lifecycle) — art uses provider HSMs (P8, Ledger), provider cloud (P1), on-chain congress (P7), or peer devices (P9); none put the vault state machine on the *user's own* cloud account.
3. **Same-public-key preservation** — claim 2's "re-encrypt with new passcode without replacing the public key." Wallet art restores the *same secret* by definition, so counsel should not overweight this alone; strength is the **combination** with the identity file (payload re-encryption while cleartext public key binding persists) and the contrast with the claim-3 re-key path.
4. **Dual proof types** — owner-issued custodianship credential + per-request approval proof (N4 proves only share possession).

**Drafting guidance for existing claims (no new claims):**
- Keep (d)(ii) unrevokable rule **in the independent claim** — it is the strongest surviving limitation; do not let it get amended out into a dependent.
- Element (e) should stay tied to "preserving an identity public key **of the portable identity file**" to keep distance from wallet-seed art.
- Dependent 6 (PBKDF2 1M/SHA-512 sealed shares) and 7 (spreadsheet vault) are the fallback positions if (d)(ii) is challenged; they held up against everything found.
- Dependent 9 (ZK v2 envelope: ML-DSA over SHA3-384 binding + inner STARK) has no hit; N4 uses Schnorr — keep 9 intact as a strong fallback.

### Claim 3 — Re-key migration + network succession

**Closest art:** N1 (did:plc tombstone + rotation) and N2 (did:webvh portability).

**What the art covers:** Key rotation via signed operations, permanent deactivation of an identifier at a coordinating directory, verifiable linkage between old and new identifiers (SCID / operation log). The *concept* of predecessor retirement with successor continuity exists in NPL.

**What survives:**

1. **Pinned cloud folder migrated in place** — re-wrapping encrypted blobs and patching index sheets inside the same user cloud folder, folder renamed to the successor identifier. No DID method touches user storage migration.
2. **Lineage zero-knowledge proof dual-signed by predecessor and successor keys** — DID methods use signed log entries, not a dedicated dual-key lineage proof artifact.
3. **Asymmetric retirement semantics** — predecessor rejected for OAuth issuance, token refresh, storage binding, and feed creation while **offline decryption of the predecessor file remains possible**. did:plc tombstones are total; the online/offline split is distinctive.
4. **PQC key rotation** (successor ML-DSA/ML-KEM pair) combined with all of the above.

**Drafting guidance:**
- The claim is currently a five-element combination; its survival rests on the **combination**, since rotation (N1) and predecessor/successor linkage (N2) are individually known. Expect a § 103 rejection combining N1 + generic cloud migration; the response lives in elements "pinning an identifier of a user-controlled cloud folder" and "lineage zero-knowledge proof."
- Dependents 16 (re-wrap + sheet rewrite + folder rename) and 17 (OAuth rejection for predecessor) are the right fallback ladder — they map to `identityMigrationService.ts` steps with clean § 112 support.
- P10–P13 (inheritance/estate art) are succession-adjacent but trigger on death/incapacity with legal-document oracles; our succession is **user-initiated cryptographic rotation** — keep that word ("user-initiated" appears in the spec; consider whether counsel wants it in the claim to distance estate art, at the cost of scope).

### Claim 4 — Public index aggregation with reconcile

**Closest art:** N5 (Solid) as background; N10 (sitemap/crawler cache) as the § 103 analogy.

**What the art covers:** Solid establishes user-owned storage as the authoritative data location with permissioned app access, and decentralized-social aggregation research exists on top of it. Separately, publisher-authored index files that a server periodically re-reads to update its cache (sitemaps) are ubiquitous web infrastructure.

**What survives:**

1. **Per-user credentialed reads** — the operator reads each owner's private index via that owner's stored OAuth grant, not public crawling. Sitemaps are public; Solid apps act as the user's client, not as a feed operator maintaining a derivative cache.
2. **Deletion-biased reconcile semantics** — cache rows are only ever *removed* by reconcile (membership can shrink without user action reaching the operator); index-missing ⇒ full purge; **auth-error ⇒ skip without purge** (dependent 21). Crawler caches re-add and re-rank; they do not treat the publisher index as the sole membership authority.
3. **Client browser never touches user storage** (element (e)) — completes the architecture: user cloud ↔ API ↔ cache ↔ browser.

**Drafting guidance:**
- Anticipate the examiner combining Solid (user-owned truth) + sitemap recrawl (index-driven cache maintenance). The response elements are already in the claim set: (c) "via credentials associated with the user," dependent 21 (auth-error skip), dependent 23 (immediate delete path bypassing the interval). Keep those; they are the § 103 answer.
- Dependent 20 (interval ≤ 5 minutes) is weak alone (design choice) — fine as-is, but counsel should not rely on it.
- Consider whether "the cache not authoritative for membership" in (b) needs firmer functional language from the spec (purge-on-divergence) if the examiner treats it as intended-use; the spec supports it.

### Dependent chains

**Claims 24–26 (integrator silo):** Solid's per-app container ACLs (N5) are conceptually close to `integrators/{client_id}/`. Surviving specifics: silo **provisioned by the coordinating API keyed to an OAuth client identifier** on commodity cloud, proxy **path confinement**, and the ZKP sheet carve-out (25) + revocation-without-envelope-deletion (26). These are adequately narrow as dependents; no change needed.

**Claims 27–29 (selective disclosure / broker):** P14 and the SD-JWT/BBS+ ecosystem make this the most crowded dependent chain. Current positioning (dependent-only, broker never receives unlock secrets, permissions record on *user* cloud) is correct — do **not** elevate to independent. P14's wallet-side policy enforcement differs from our **API-reads-user-held-permissions** model; that distinction is what claims 27–28 already recite.

**Claims 30–31 (portable identity file):** N7/N8/N11 are **not close product art**. N7 is an AI-agent credential vault, N8 is a password manager, and N11 is a command-line file encryption/signing tool. They are kept here only because an examiner could cite them for a narrow apparatus slice: passphrase-KDF + ML-KEM/ML-DSA encrypted file. The surviving combination in claim 30 is the **co-residence of three components in one identity artifact**: encrypted identity payload + recovery envelope (Shamir-master-keyed) + passcode-sealed shares, with pn-name/passcode three-factor unlock and cleartext PQC public keys for binding. Counsel note in CLAIMS_DRAFT suggesting elevation of claim 30 to independent should be **re-weighed against N7/N8/N11 publication dates** before elevating.

---

## § 103 combination risks (summary for counsel)

| Target | Likely combination | Answer in current claims |
|--------|--------------------|--------------------------|
| Claim 1 | P1 (Block Shamir social recovery) + N4 (guardian ZKPs) | Unrevokable rule (d)(ii); user-cloud vault (b); dual proof types (c) |
| Claim 2 | P1 + generic passcode re-encryption | Three-factor artifact; same-public-key verification step; sealed-shares alternative source |
| Claim 3 | N1 (did:plc rotation/tombstone) + generic cloud data migration | Pinned-folder in-place migration; lineage ZKP; online-revoked/offline-decryptable split |
| Claim 4 | N5 (Solid user-owned data) + N10 (sitemap-driven cache) | Credentialed per-user index reads; purge/skip semantics (21); API-only browser (e) |
| Claims 27–29 | P14 + SD-JWT/BBS+ standards | Permissions record on user cloud read at request time; broker never holds vault secrets |
| Claims 30–31 | N7/N8/N11 as distant structural analogies for generic PQC vault/file encryption | par Noir is an identity artifact, not a credential/password/crypto vault; answer is three co-resident components in one `.pn` file, pn-name-participating KDF, recovery envelope + sealed shares |

---

## Date-check: claims 30–31 portable identity file (July 6, 2026)

**CIP filing window:** not yet filed; deadline **August 26, 2026**. Claims 30–31 tagged **CIP-NEW** — effective priority date is CIP filing date, not Aug 2025 provisional (provisional described ECDSA/secp256k1, not ML-DSA/ML-KEM wire format).

**par Noir implementation dates (repo git):**

| Milestone | Date |
|-----------|------|
| `packages/pqc-crypto` (ML-DSA-65, ML-KEM-768) | **2026-03-26** |
| Sealed Shamir shares in `.pn` (`sealedShares.ts`) | **2026-06-24** |

### Verified publication dates

| Ref | Artifact | First public disclosure | Source |
|-----|----------|-------------------------|--------|
| **N7** | `pqc-agent-wallet` v0.1.0 | **2026-04-20** 19:24 UTC | [PyPI JSON](https://pypi.org/pypi/pqc-agent-wallet/json) `upload_time` |
| **N7-dep** | `quantumshield` v0.1.0 (wallet dependency) | **2026-03-26** 02:42 UTC | [PyPI JSON](https://pypi.org/pypi/quantumshield/json) |
| **N8** | PassQuantum repo (public) | **2024-07-26** created; **2024-08-11** first commit | [GitHub API](https://api.github.com/repos/ESH2007/PassQuantum) |
| **N8** | PassQuantum 1.0-beta (ML-KEM-768 + ML-DSA stated) | **2026-05-20** 01:59 UTC | [GitHub release `beta`](https://github.com/ESH2007/PassQuantum/releases/tag/beta) |
| **N11** | `pqcrypt` v1.0.0 | **2026-05-01** | [PyPI JSON](https://pypi.org/pypi/pqcrypt/json) |
| **N12** | `age` ≥ 1.3.0 (ML-KEM-768 hybrid recipients) | **December 2025** (per age release notes cited by pqcrypt) | NPL — enables ML-KEM file encryption ecosystem-wide |

### Element-by-element overlap vs claim 30

| Claim 30 element | pqc-agent-wallet (N7) | PassQuantum (N8) | pqcrypt (N11) | par Noir `.pn` |
|------------------|-------------------------|------------------|---------------|----------------|
| Cleartext ML-DSA + ML-KEM pubkeys | Partial (ML-DSA signs envelope; KEM pubkey for unlock mode) | Kyber768 keypair files (`public.key` / `private.key`) | Keys split across microSD + `~/.config` | Yes — cleartext in file |
| Encrypted payload, passphrase KDF | PBKDF2-SHA256 **600k** + AES-256-GCM | Argon2id master + AES-256-GCM vaults | Passphrase-encrypted `main.key.age` | PBKDF2-SHA512 **1M** + pn name **and** passcode |
| **Three-factor** (file + pn name + passcode) | No — passphrase only | No — master password only | No — passphrase only | **Yes** |
| **Recovery envelope** (Shamir-master-keyed) | No | No | No | **Yes** |
| **Passcode-sealed Shamir shares** in same artifact | No | No | No | **Yes** |
| Single portable identity artifact | `.wallet` credential vault | Multiple `vaults/*.pqdb` + separate key files | `.age` files + SD card keys | **One `.pn` file** |

### Conclusion for counsel

**As of July 6, 2026, N7, N8 (May 2026 release), and N11 are already public publications** that an examiner may cite against **generic PQC encrypted file** language in any CIP filed after those dates. They are **not close product art** for par Noir: N7 is an AI-agent credential vault, N8 is a password manager, and N11 is a file encryption/signing tool. PassQuantum's **Aug 2024** public repo is background art for Kyber/ML-KEM encrypted local vaults generally (immature until the May 2026 beta).

**Do not elevate claim 30 based on "PQC encrypted file + passphrase KDF" alone** — that generic slice is now crowded (N7, N8, N11, age 1.3.0). **Elevating claim 30 to independent remains defensible on the full identity-artifact combination** that none of the references teach:

1. Co-resident **recovery envelope** + **passcode-sealed Shamir shares** + encrypted identity payload in **one** file.
2. **Three-factor** unlock requiring pn name **and** passcode together (not single master password).
3. Identity payload (signing + encapsulation keys for a portable identity protocol), not a credential/password vault.

**Claim 31** (wire format algorithm IDs: ML-DSA-65, ML-KEM-768, SHA3-384) is weak standalone — those are NIST-standard names. Keep as dependent on claim 30 or on claim 1/2 chain; do not rely on 31 alone.

**Prosecution risk if claim 30 is narrowed:** Any amendment dropping recovery envelope or sealed shares moves the claim toward generic PQC encrypted-file territory where N7/N8/N11 become more relevant. **Do not narrow toward generic vault-file language.**

**Filing timing note:** Filing the CIP **before** April 20, 2026 would have avoided N7 as a publication against generic encrypted-file language — that window has closed. Filing now (July–August 2026) means N7, N8-beta, and N11 should be characterized accurately in the differentiation narrative and potentially listed on an IDS as **distant structural analogies**, not close product art.

---

## What this search did NOT cover

- Paid databases (Derwent, PatSnap, LexisNexis) — better recall, citation graphs
- Prosecution histories / file wrappers of P1–P14
- Non-US national filings beyond what EPO/WIPO surface publicly
- Block's US 12,579,542 full claim text (cited in README references; Gazette text not retrieved this pass)
- Systematic CPC class sweeps (e.g. H04L 9/085 secret sharing, G06F 21/62)

## Counsel action items from this search

1. ~~**Date-check N7 (pqc-agent-wallet) and N8 (PassQuantum)**~~ — **Done July 6, 2026.** See § Date-check above. N7 = Apr 20 2026; N8 beta = May 20 2026; also add N11 pqcrypt (May 1 2026). Treat them as **distant structural analogies for generic PQC vault/file encryption**, not close product art. Claim 30 elevation is only defensible on the full par Noir identity-artifact combination.
2. Pull full claims + prosecution history for **P1 family (Block)** — the closest patent art to lead claims 1–2; check for continuations still pending that could be steered toward custodian-policy claims.
3. Verify **P3 (Block time-delay recovery)** claim scope — its "vault" language should be distinguished (provider-side MPC vault vs our user-cloud sheet).
4. Add **N1 (did:plc)** and **N5 (Solid)** to the IDS as known NPL; both are material to claims 3 and 4 respectively.
5. Confirm the **unrevokable custodian** limitation has no hit in a formal search — it is the single most load-bearing limitation in the lead claim.
6. Assess whether P9's owner-deletable shares supports a teaching-away argument worth preserving in the spec narrative (it is currently implicit).

---

## Search log (queries run, July 6 2026)

1. Block Shamir social recovery custodian patents (US 12,536,531 verified via USPTO OG)
2. Threshold guardian recovery + protected/unremovable guardian requirement
3. DID key rotation / successor identifier / predecessor deactivation / storage continuity
4. Coinbase US 12,561,456 + Ledger Recover verification
5. User-controlled personal data store feed aggregation (Solid)
6. ZKP selective disclosure + consent revocation + personal data vault
7. Digital inheritance / account succession patents
8. Portable encrypted identity file + PQC (ML-DSA/ML-KEM) + passphrase KDF
