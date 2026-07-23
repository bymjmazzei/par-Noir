# Claims — draft for attorney refinement

**WARNING:** Example claim language only. Counsel must refine for § 101, § 102, § 103, § 112, and formal claim style. Do not file without attorney review.

**Priority tags:**

- **PROV** — Arguably supported by August 26, 2025 provisional
- **CIP-NEW** — New matter; priority date likely CIP filing date unless counsel finds earlier support

**Prior-art risk annotations** (⚠ notes below each independent claim) summarize the July 6, 2026 exploratory search in [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md) — reference IDs (P1, N1, …) resolve there.

---

## Independent claim 1 — Recovery vault system

**[PROV + CIP-NEW]** | Type: System

1. A system for identity recovery comprising:
   - a processor; and
   - a non-transitory computer-readable storage medium storing instructions that, when executed by the processor, cause the system to:
     - (a) maintain a portable identity file comprising an encrypted post-quantum identity payload, a recovery envelope, and passcode-sealed Shamir shares;
     - (b) maintain a recovery vault on user-controlled cloud storage, the recovery vault tracking a plurality of custodian entities each associated with a Shamir share index and a custodian status;
     - (c) receive, for a recovery request, a plurality of approval payloads each comprising a custodianship zero-knowledge proof and an approval zero-knowledge proof;
     - (d) verify the zero-knowledge proofs and evaluate a quorum rule requiring (i) a threshold number of approvals and (ii) at least one approval from a protected custodian in an accepted status, wherein the protected custodian is marked unrevokable in the recovery vault; and
     - (e) upon satisfaction of the quorum rule, combine Shamir shares to decrypt the recovery envelope and re-encrypt the identity payload with a new passcode while preserving an identity public key associated with the portable identity file.

> ⚠ **Prior-art note (Jul 2026):** Elements (a)–(c) individually crowded — Block US 12,536,531 (P1) covers Shamir social recovery with server-coordinated contact approvals; DID-KR (N4) covers guardian ZK approvals. **Load-bearing limitation is (d)(ii) unrevokable custodian** — no hit found; P9 teaches owner-deletable shares (arguably teaches away). Keep (d)(ii) in the independent claim; fallbacks are dependents 6, 7, 9.

---

## Independent claim 2 — Shamir recovery method (same public key)

**[PROV + CIP-NEW]** | Type: Method

2. A computer-implemented method for recovering access to a portable identity, comprising:
   - receiving a portable identity file, a pn name, and a passcode from a user, wherein decryption of the portable identity file requires all three;
   - retrieving a plurality of Shamir shares from at least one of: custodian entities associated with a recovery vault on user-controlled cloud storage, or passcode-sealed shares embedded in the portable identity file;
   - receiving a threshold number of custodian approvals, each approval accompanied by verifiable zero-knowledge proofs of custodianship and approval;
   - verifying that at least one approval corresponds to a protected custodian designated unrevokable in the recovery vault;
   - combining the plurality of Shamir shares to obtain a recovery master;
   - decrypting a recovery envelope with the recovery master to obtain a recovery payload;
   - verifying that a public key in the recovery payload matches a public key of the portable identity file; and
   - re-encrypting an identity payload of the portable identity file using a new passcode supplied by the user, without replacing the public key.

> ⚠ **Prior-art note (Jul 2026):** Wallet-recovery art (P1, P4–P6) restores the same secret by definition — do not overweight "same public key" alone. Strength is the combination: three-factor artifact + sealed-shares alternative source + unrevokable verification step. § 103 combo risk: P1 + generic passcode re-encryption.

---

## Independent claim 3 — Re-key migration and network succession

**[CIP-NEW]** | Type: Method

3. A computer-implemented method for cryptographic identity rotation with storage continuity, comprising:
   - unlocking a predecessor portable identity file using a pn name and a passcode;
   - generating a successor post-quantum key pair distinct from a predecessor post-quantum key pair;
   - pinning an identifier of a user-controlled cloud folder in storage credentials;
   - migrating encrypted objects and structured index data within the pinned folder to bind the objects to the successor key pair;
   - generating a lineage zero-knowledge proof binding the predecessor public key, the successor public key, and a migration identifier; and
   - registering, with a coordinating server, an identity succession record that revokes a predecessor network identifier for online network-backed operations while permitting offline decryption of the predecessor portable identity file.

> ⚠ **Prior-art note (Jul 2026):** did:plc (N1) has rotation + tombstone deactivation at a central directory; did:webvh (N2) has predecessor/successor porting with verifiable linkage. Surviving elements: **pinned-folder in-place migration, dual-signed lineage ZKP, online-revoked/offline-decryptable split**. Expect § 103 combining N1 + generic cloud migration; fallbacks are dependents 16–17. Estate art (P10–P13) is death-triggered — succession here is user-initiated rotation.

---

## Independent claim 4 — Public index aggregation with reconcile

**[CIP-NEW]** | Type: System

4. A system for aggregating public content, comprising:
   - a processor; and
   - a non-transitory computer-readable storage medium storing instructions that, when executed by the processor, cause the system to:
     - (a) store, on user-controlled cloud storage controlled by a user, a public index listing file identifiers of content designated public by the user;
     - (b) maintain a server-side cache of metadata for public content, the cache not authoritative for membership;
     - (c) periodically read the public index from the user-controlled cloud storage via credentials associated with the user;
     - (d) remove from the server-side cache metadata entries whose file identifiers are absent from the public index; and
     - (e) serve feed queries to a client browser from the server-side cache without the client browser accessing the user-controlled cloud storage directly.

> ⚠ **Prior-art note (Jul 2026):** Expect § 103 combining Solid pods (N5, user-owned truth) + sitemap-driven crawler cache (N10). Answers already in the claim set: (c) credentialed per-user reads, dependent 21 auth-error skip, dependent 23 immediate delete path. Dependent 20 (5-min interval) is weak alone. "Cache not authoritative" in (b) may need firmer functional language if treated as intended-use.

---

## Dependent claims

### Dependent on claim 1

5. The system of claim 1, wherein the post-quantum identity payload comprises ML-DSA-65 signing keys and ML-KEM-768 encapsulation keys. **[CIP-NEW]**

6. The system of claim 1, wherein the passcode-sealed Shamir shares are encrypted using AES-GCM with a key derived from the pn name and passcode via PBKDF2 with at least one million iterations and SHA-512. **[CIP-NEW]**

7. The system of claim 1, wherein the recovery vault comprises a spreadsheet file stored in a metadata folder of the user-controlled cloud storage. **[CIP-NEW]**

8. The system of claim 1, wherein revoking a custodian marked unrevokable is rejected by the system. **[CIP-NEW]**

9. The system of claim 1, wherein the custodianship zero-knowledge proof and the approval zero-knowledge proof comply with a zero-knowledge envelope version comprising an ML-DSA signature over a SHA3-384 binding digest and an inner STARK proof. **[CIP-NEW]**

10. The system of claim 1, wherein the threshold number is between two and five inclusive. **[PROV]**

11. The system of claim 1, further comprising automatically rebinding a software license record from a predecessor identity hash to a successor identity hash upon satisfaction of the quorum rule. **[PROV — enablement weak; counsel discretion]**

### Dependent on claim 2

12. The method of claim 2, wherein the recovery vault tracks custodian statuses comprising invited, accepted, and revoked. **[CIP-NEW]**

13. The method of claim 2, wherein the custodianship zero-knowledge proof includes a context string identifying recovery custodianship. **[CIP-NEW]**

14. The method of claim 2, wherein the approval zero-knowledge proof includes public inputs comprising a recovery request identifier and a share index. **[CIP-NEW]**

15. The method of claim 2, further comprising storing unassigned Shamir shares in a pending shares section of the recovery vault encrypted to the identity public key. **[CIP-NEW]**

### Dependent on claim 3

16. The method of claim 3, wherein migrating comprises re-wrapping encrypted files, rewriting identifier fields in spreadsheet indexes, and renaming the user-controlled cloud folder to a successor pn identifier. **[CIP-NEW]**

17. The method of claim 3, wherein registering the identity succession record causes rejection of OAuth token issuance for the predecessor network identifier. **[CIP-NEW]**

18. The method of claim 3, further comprising re-inviting recovery custodians with new custodianship zero-knowledge proofs after generating the successor post-quantum key pair. **[CIP-NEW]**

19. The method of claim 3, further comprising re-encrypting messaging history using a browser client that accesses storage only through a coordinating API. **[CIP-NEW]**

### Dependent on claim 4

20. The method of claim 4, wherein periodically read comprises executing a reconcile job at an interval not greater than five minutes. **[CIP-NEW]**

21. The system of claim 4, wherein upon an authentication error reading the public index, the system skips removal of cache entries for the user. **[CIP-NEW]**

22. The system of claim 4, wherein the public index is stored as a spreadsheet file in a metadata folder under a pn-specific root folder on the user-controlled cloud storage. **[CIP-NEW]**

23. The system of claim 4, further comprising, upon user deletion of a file via an application API, removing a corresponding entry from the public index and the server-side cache without waiting for the periodic read. **[CIP-NEW]**

### Integrator silo (dependent chain from claim 4 or new independent — counsel choice)

24. The system of claim 4, further comprising provisioning, upon an integrator OAuth grant, a dedicated integrator folder under the user-controlled cloud storage identified by an OAuth client identifier, and confining integrator storage API requests to paths within the dedicated integrator folder. **[CIP-NEW]**

25. The system of claim 24, wherein standard identity data point proofs are stored in a metadata spreadsheet separate from the dedicated integrator folder and are accessible to the integrator only via proof API endpoints. **[CIP-NEW]**

26. The system of claim 24, wherein a permissions record on the user-controlled cloud storage authorizes proof API access, and revocation of a permission row causes subsequent proof requests to be rejected without deleting stored zero-knowledge proof envelopes. **[CIP-NEW]**

### Selective disclosure and broker entities (dependent chain from claim 1 or 4 — counsel choice; not independent)

27. The system of claim 1, further comprising storing, on user-controlled cloud storage, a permissions record and a data-points store of zero-knowledge proof envelopes bound to an identity public key of the portable identity file. **[CIP-NEW]**

28. The system of claim 27, wherein, upon a proof request from an integrator or broker entity, the system reads the permissions record from the user-controlled cloud storage, verifies an active grant for a requested data point, and returns a zero-knowledge proof envelope without transmitting underlying plaintext sensitive attributes. **[CIP-NEW]**

29. The system of claim 28, wherein the broker entity comprises at least one of: an OAuth-registered integrator, a data union, or a data exchange, and wherein the broker entity does not receive a pn name, a passcode, or private keys of the portable identity file. **[CIP-NEW — future economic layer optional; enablement via permissions + proof APIs]**

### Identity artifact (dependent chain — counsel may elevate to independent)

30. A portable identity file stored on a non-transitory computer-readable medium, the file comprising: a cleartext ML-DSA public key; a cleartext ML-KEM public key; an encrypted identity payload decryptable only with a pn name and a passcode together; a recovery envelope decryptable with a Shamir-derived recovery master; and passcode-sealed Shamir shares decryptable with the pn name and the passcode. **[CIP-NEW]**

> ⚠ **Prior-art note (Jul 2026):** N7 `pqc-agent-wallet` (PyPI **2026-04-20**), N8 PassQuantum beta (**2026-05-20**), and N11 `pqcrypt` (**2026-05-01**) are **distant structural analogies** for generic PQC encrypted file + passphrase KDF language. They are not crypto-wallet or identity-protocol products and are not close art for the lead invention. **Do not elevate claim 30 on generic vault-file structure alone.** Full claim 30 combination (recovery envelope + sealed shares + three-factor pn name/passcode in one identity artifact) not taught — see [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md) § Date-check. Claim 31 (algorithm IDs) weak standalone.

31. The portable identity file of claim 30, wherein the encrypted identity payload encodes a wire format version and algorithm identifiers for ML-DSA-65, ML-KEM-768, and SHA3-384. **[CIP-NEW]**

32. The method of claim 2, wherein creating the portable identity file comprises credential-driven post-quantum key generation without blockchain mining. **[PROV + CIP-NEW]**

---

## Claims intentionally omitted

| Omitted subject | Reason |
|-----------------|--------|
| ML commercial usage detection | Not enabled |
| Notary / physical-world oracle | Not enabled |
| Authentication without OAuth server | Contradicts product |
| FIPS 140-3 / HSM required | Not shipped |
| Atomic swap license payment | Not enabled |
| Prism 2-of-N audit | Separate potential filing |
| Creator fund economics | Business-method risk |
| Paid aggregate data marketplace / union pricing settlement | Economic layer not shipped; defer to continuation after L5 build |
| Data union quorum as required element | Optional future embodiment only |

---

## Counsel notes

1. Consider elevating **claim 30** to an independent apparatus claim on the portable file only if the claim remains tied to the full par Noir identity-artifact combination. N7/N8/N11 in [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md) are distant structural analogies for generic PQC vault/file encryption, not close product art; the surviving combination is the co-residence of identity payload + recovery envelope + sealed shares in one artifact with pn name + passcode unlock.
2. Consider splitting claims 3 and 4 into separate applications if examiner cites combination obviousness.
3. Amend dependent claim 11 or cancel if § 112 enablement challenged on license ZK.
4. Map each element to [SOURCE_MAP.md](./SOURCE_MAP.md) before office action responses.
5. Formal claims should use consistent terminology: “portable identity file” / “pN file” — pick one per counsel style.
6. Keep claims 27–29 **dependent** on recovery or aggregation families; do not lead with data union/exchange business-method language. Search confirms this chain is the most crowded (P14, SD-JWT/BBS+).
7. Full § 103 combination-risk table and per-claim analysis: [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md).
