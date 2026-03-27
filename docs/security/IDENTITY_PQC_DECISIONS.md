# Identity protocol — PQC and cryptography decisions

Living reference for choices that shape the identity layer (post-quantum direction, primitives, format, and implementation). **Update this file as decisions are made** so implementation stays aligned with intent.

| Field | Value |
|-------|--------|
| **Status** | **Complete** — §1–§8 decided (implementation follows this doc) |
| **Last updated** | 2026-03-26 |

---

## How to use this document

1. Work through sections **in order** (strategy → primitives → format → ZK → implementation).
2. Replace `— TBD —` in **Our answers** with your choice, a short rationale, and optional date.
3. When something changes, update the answer and bump **Last updated**.

---

## 1. Overall migration strategy

| Option | What it is | Pros | Cons | Best when |
|--------|------------|------|------|-----------|
| **A. Classical only (document agility)** | Strong ECC/AEAD now; **version byte** + spec reserves a future PQC slot | Fastest to stabilize; fewer moving parts; easy to test | No quantum-era assurance for asymmetric yet | Solid v1; PQC explicitly “next” |
| **B. Hybrid (classical + PQC)** | Critical ops use **both** (e.g. dual sign or combined output per spec) | Survives break of either primitive during transition; common industry pattern | Larger artifacts; more code; more tests | Serious PQC intent without a single-primitive bet |
| **C. PQC-only (asymmetric)** | ML-KEM / ML-DSA only for new identities | Smaller than hybrid; clear story | Single implementation risk; less combined deployment history | Accept higher implementation risk for simplicity |
| **D. Parallel verifiers (many algorithms)** | Verifiers accept v1 ECC, v2 PQC/hybrid, etc. | Flexible future migration | Most verifier complexity; need sunset policy | Large ecosystems; often overkill at zero users |

### Our answer

- **Chosen option (A / B / C / D):** **C — PQC-only (asymmetric)** for new identities.
- **Rationale:** No requirement for backwards compatibility with classical-only identities; building for future users. Avoids maintaining dual verification paths (lighter verifier story than hybrid or parallel algorithms).
- **Notes:** “PQC-only” applies to **asymmetric** identity operations (signatures, KEM if used). Symmetric AEAD (e.g. AES-256-GCM) and **SHA-3–family** hashing per §4. Accept larger keys/signatures and reliance on a single vetted PQC implementation path.

---

## 2. Digital signatures (identity binding, API auth)

| Option | Quantum threat model | Key / sig size | Speed | Maturity / interop | Drawbacks |
|--------|----------------------|----------------|-------|-------------------|-----------|
| **Ed25519 / ECDSA only** | Not PQC (Shor breaks ECC eventually) | Small | Very fast | Ubiquitous | Long-term quantum weakness for asymmetric trust |
| **ML-DSA (Dilithium family)** | PQC (NIST) | Larger | Slower than Ed25519; usually OK on desktop | Standardizing; growing support | Constant-time impl required; larger wire format |
| **SLH-DSA (SPHINCS+)** | PQC; hash-based assumptions | Often very large sigs | Often slower | Standard | Usually not first pick for high-frequency signing |
| **Hybrid: Ed25519 + ML-DSA** | Classical and quantum-era for signing | Largest combined | Two verifications | Transition-friendly | Two codepaths; spec must define exact combine rule |

### Our answer

- **Profile (e.g. hybrid vs ML-DSA-only):** **ML-DSA-only** (aligns with §1 **C** — no parallel classical signature path).
- **ML-DSA parameter set (if applicable):** **ML-DSA-65** (NIST parameter set; balanced size vs strength). Alternatives: **ML-DSA-44** (smaller/faster), **ML-DSA-87** (larger, higher security category). Change this line if you standardize on a different set.
- **Rationale:** NIST-standardized module-lattice signatures; one clear algorithm for identity binding and API auth. Larger keys/signatures than ECC—acceptable for future-first design.

---

## 3. Key encapsulation (shared secrets, wrapping keys)

| Option | Use case | Pros | Cons |
|--------|----------|------|------|
| **ECDH (X25519 / P-256)** | Derive shared keys | Fast, small, everywhere | Not PQC |
| **ML-KEM** | Shared secret from public key | PQC KEM; standard | Larger keys/ciphertexts; vetted implementation required |
| **Hybrid KEM (ECDH + ML-KEM)** | Combine outputs (e.g. via HKDF) | Conservative | More complex; combiner must be specified carefully |

**Clarification (not current production):** The rows above are **options to choose**, not a description of what par Noir ships today. **Hybrid KEM** means *both* ECDH and ML-KEM contribute to the same shared secret (transition/interop pattern). That is **different** from **hybrid signatures** (§2). The repo may contain experimental Kyber-named code or README mentions; the target asymmetric stack for new work is **ML-DSA** (§2) and, if a KEM is required here, **ML-KEM** — not an informal Kyber prototype. With **§1 = C** (PQC-only asymmetric), **ML-KEM-only** is the natural KEM choice if you need KEM; hybrid KEM is optional if you explicitly want classical+PQC for the same secret.

### Our answer

- **Need KEM at identity layer in v1? (yes / no)** **Yes** — key encapsulation (shared secrets / encrypt-to-public-key flows) uses PQC aligned with §1 **C**.
- **If yes: ML-KEM-only vs hybrid vs ECDH-only for now:** **ML-KEM-only** (no ECDH, no hybrid KEM combiner).
- **ML-KEM parameter set (FIPS 203):** **ML-KEM-768** default (balanced). Alternatives: **ML-KEM-512** (smaller), **ML-KEM-1024** (stronger/larger).
- **Rationale:** Matches PQC-only asymmetric stack alongside **ML-DSA** (§2); avoids classical KEM and hybrid complexity.

---

## 4. Symmetric encryption and hashing (bulk data, KDFs)

| Topic | Note |
|-------|------|
| **AES-256-GCM / ChaCha20-Poly1305** | Bulk encryption; prefer **256-bit** keys; rotation policy per implementation. |
| **SHA-3 family (FIPS 202)** | Default for **protocol-level** hashing, HMAC, and fixed-digest needs; use **SHAKE** where an XOF or variable-length output is required. Structural diversity from SHA-2. |

### Our answer

- **Symmetric algorithms in scope:** **AEAD:** AES-256-GCM and/or ChaCha20-Poly1305 (256-bit keys). **Hashing (identity protocol and app-level policy):** **SHA-3 family** — default fixed digest **SHA3-384**; use **SHAKE128** / **SHAKE256** when the spec needs an XOF or arbitrary-length output. HMAC and HKDF constructions **SHOULD** use SHA-3 primitives (e.g. HMAC-SHA3-384, HKDF with SHA3-384 or SHAKE as defined in the wire spec).
- **Rotation / policy notes:** Key rotation and maximum key lifetime are product/implementation details; document in the identity wire spec. **Exception:** vetted **ML-DSA / ML-KEM** libraries follow **FIPS 204 / FIPS 203** internal use of SHAKE or other hashes where the standard mandates — that is **not** a general exception allowing SHA-2 for new protocol-defined hashes.
- **Rationale:** SHA-3 (Keccak) offers a different design from SHA-2; aligned with long-horizon, greenfield protocol choices alongside PQC asymmetric primitives.

---

## 5. Identity artifact format (versioning)

| Option | Pros | Cons |
|--------|------|------|
| **Explicit version + algorithm IDs in the blob** | Future-proof; verifiers know what to run | Slightly larger; encoding must be defined once |
| **Implicit (whatever the code does)** | Less upfront design | Risky for migration and audit |

### Our answer

- **Chosen option:** **Explicit version + algorithm IDs** in the identity artifact (reject implicit / code-defined-only formats).
- **Canonical encoding preference (e.g. CBOR / JSON / raw binary):** **TBD in wire spec** — **CBOR** (deterministic / canonical rules per RFC 8949) is the recommended default for compact binary artifacts; JSON acceptable for human-readable or debug surfaces if a byte-identical canonical form is defined where needed.
- **Required conceptual fields (exact names in spec):** At minimum: **`format_version`** (overall identity blob version); **`sig_alg_id`** (e.g. ML-DSA-65); **`kem_alg_id`** (e.g. ML-KEM-768); **`hash_policy_id`** (SHA-3 family profile per §4); **`params_id`** or equivalent when multiple parameter sets exist for the same algorithm family. Public keys, ciphertexts, and signatures must be unambiguously typed.
- **Rationale:** Verifiers years later must know what to parse and verify without relying on a single implementation’s behavior; required for auditability and for evolving §2–§4 without breaking older artifacts.

---

## 6. ZK / Schnorr / secp256k1-dependent proofs

| Option | Effort | Outcome |
|--------|--------|---------|
| **Defer ZK PQC alignment** | Lower now | Core identity may be PQC for signing while ZK stays ECC-bound—document clearly |
| **Redesign ZK for new assumptions** | High (research-shaped) | Better long-term alignment; long calendar time |
| **Isolate ZK as optional layer** | Medium | Core identity PQC; proofs evolve separately |

### Our answer

- **Chosen approach:** **Redesign ZK for PQC-aligned assumptions** — the long-term target is proofs that do **not** depend on secp256k1 / classical Schnorr as the root of trust, so ZK aligns with **ML-DSA / ML-KEM** and §5 artifact versioning (explicit `zk_proof_type` or equivalent when added).
- **Rationale:** With §1 **C** and §2–§4, identity’s asymmetric story is PQC + SHA-3. Keeping ZK permanently on ECC would split the security narrative and leave a quantum-vulnerable branch. **Redesign** is the correct end state; effort is **high** and may be **research-shaped** (choice of proof system, circuit/model, performance targets).
- **Delivery note:** Implementation can be **phased**: ship **core identity** (ML-DSA, ML-KEM, §5 blobs) first; retire or fence legacy ECC-based ZK paths as **interim** until the new ZK design is specified and implemented. Document any interim behavior so it is not mistaken for the final protocol.

---

## 7. How ML-DSA / ML-KEM run in browser + TypeScript

This section is **not** another algorithm pick (that is §2–§3). It answers: **Web Crypto does not expose ML-DSA or ML-KEM natively today**, so **how** do we execute them in Vite apps, workers, and Node?

| Option | Pros | Cons |
|--------|------|------|
| **WASM + established library (e.g. liboqs-style)** | Implementations aligned with **reference / C** stacks; stronger basis for audit and constant-time discipline | Build pipeline, bundle size, loading WASM in workers |
| **Pure JS / WASM from a maintained PQC stack** | Often simpler `npm` integration | Must vet each dependency for correctness and side channels |
| **Defer PQC until Web Crypto exposes algorithms** | No extra bundle | **Incompatible** with §1–§3 PQC-only identity on any realistic horizon |

### Our answer

- **Accept WASM (or other) dependency now? (yes / no)** **Yes** — required to ship **ML-DSA** and **ML-KEM** in the stack before native browser APIs exist.
- **Chosen stack / library (when known):** **WASM built from an established vetted cryptographic library** (e.g. **liboqs** or a maintained fork/wrapper that ships the same algorithms). **Exact package name and build** are chosen at implementation time (bundle budget, Node vs browser, worker loading). **Not** “wait for Web Crypto.”
- **Rationale:** Matches a **PQC-only** identity root of trust: prefer **audit-friendly** paths close to widely reviewed implementations over hand-rolled JS. Cost is acceptable (build + WASM size) for the identity layer. Pure-JS PQC remains a possible fallback for a **specific** vetted library only if WASM integration blocks a platform—**not** the default plan.

---

## 8. Legacy “quantum” modules in `identity-core`

Older code under paths such as `encryption/quantum/` uses **non-standard** lattice-style helpers and naming (e.g. Kyber-adjacent) — **not** the **ML-DSA / ML-KEM** stack in §2–§3 and **not** the WASM path in §7. This section decides whether to **delete** that code once the real stack exists or **quarantine** it.

| Option | Pros | Cons |
|--------|------|------|
| **Remove / replace when standard path exists** | Clear audit surface; less confusion | Deletes code that might hold historical reference |
| **Quarantine (`experimental` / non-production only)** | Preserves reference for API shapes, docs, or migration notes | Must enforce **no production import** from quarantine |

### Our answer

- **Chosen approach:** **Quarantine** — keep legacy modules **out of the production identity path** but **retained** under a clear **experimental / legacy** boundary (e.g. dedicated folder or package export) for **reference** (API pathways, docs, or migration ideas). **Production code** (dashboard, browser, API identity verification) **MUST NOT** depend on quarantined code.
- **Rationale:** Avoid losing incidental reference material while the **vetted** PQC stack (§7) becomes canonical; reduce risk of confusion by strict separation.
- **Implementation note:** When wiring ML-DSA/ML-KEM, add **lint or dependency rules** so quarantine cannot be imported from shipping bundles without an explicit allowlist (if ever).

---

## Decision summary (quick view)

Fill this table when the above sections are decided.

| Decision area | Choice |
|-----------------|--------|
| Migration strategy (§1) | **C** — PQC-only asymmetric; no classical identity compat required |
| Signatures (§2) | **ML-DSA-only**; parameter set **ML-DSA-65** (44 / 87 optional) |
| KEM (§3) | **Yes**; **ML-KEM-only**; default **ML-KEM-768** (512 / 1024 optional) |
| Symmetric / hashing policy (§4) | AEAD: AES-256-GCM / ChaCha20-Poly1305; hashing: **SHA-3 family** (default **SHA3-384**; **SHAKE** when XOF needed) |
| Identity format (§5) | **Explicit** `format_version` + **algorithm IDs**; encoding finalized in wire spec (CBOR recommended) |
| ZK scope (§6) | **Redesign** for PQC-aligned ZK; phased delivery; interim ECC ZK fenced until replaced |
| Implementation stack (§7) | **Yes WASM**; **liboqs-style / vetted C→WASM**; exact package TBD at build time |
| Legacy modules (§8) | **Quarantine** — keep for reference only; **no production imports** |

---

## Links

- [IDENTITY_PQC_IMPLEMENTATION_PLAN.md](./IDENTITY_PQC_IMPLEMENTATION_PLAN.md) — phased build: PQC identity + OAuth across repo
- [SECURITY_OVERVIEW.md](./SECURITY_OVERVIEW.md) — current documented foundation
- [DID_SPECIFICATION.md](../standards/DID_SPECIFICATION.md) — DID-related standards (if identity ties to DID)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-26 | Initial template from identity/PQC decision framework |
| 2026-03-26 | §1: Chosen **C** (PQC-only asymmetric); rationale recorded |
| 2026-03-26 | §2: **ML-DSA-only**; default parameter set **ML-DSA-65** |
| 2026-03-26 | §3: Clarification — hybrid KEM vs hybrid sigs; options table ≠ current prod |
| 2026-03-26 | §3: KEM **yes**; **ML-KEM-only**; default **ML-KEM-768** |
| 2026-03-26 | §4: AEAD unchanged; protocol hashing **SHA-3 family** (SHA3-384 + SHAKE as needed) |
| 2026-03-26 | §5: **Explicit** versioning + algorithm IDs; CBOR recommended; wire spec TBD |
| 2026-03-26 | §6: **Redesign** ZK for PQC alignment; phased vs core identity |
| 2026-03-26 | §7: **WASM** + vetted lib (e.g. liboqs); §7 title clarified (how PQC runs in TS) |
| 2026-03-26 | §8: **Quarantine** legacy quantum modules; no prod dependency; doc status **complete** |
