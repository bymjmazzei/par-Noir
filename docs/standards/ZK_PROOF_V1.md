# ZK proof envelope v1 (par Noir)

**Status:** Implemented by `@par-noir/zk-protocol-v1`.  
**Hash policy:** SHA3-384 (see `IDENTITY_PQC_DECISIONS.md` §4).  
**Binding:** ML-DSA-65 signature over a canonical digest of the envelope body (excluding the signature field).

## Goals

- Remove secp256k1 / classical Schnorr from the **production** ZKP path (legacy JSON blobs are rejected).
- Align asymmetric binding with **ML-DSA-65** (same family as identity / OAuth).
- Use an explicit **Fiat–Shamir** NIZK (Schnorr-type) in a **standard finite-field group** (RFC 5114 §2.1) with **SHA3-384** as the random oracle. This is a **true** proof-of-knowledge of a discrete logarithm in that group (honest-verifier ZK; Fiat–Shamir NIZK in the ROM). It is **not** post-quantum for the **mod‑p** discrete-log assumption; PQ alignment comes from **ML‑DSA binding** and the roadmap to lattice/STARK-native proofs in a later version.

## Envelope (`zk_proof_version` = 1)

Wire form: **UTF-8 JSON**, then **base64** (same transport as existing `zkpProof` strings).

Required top-level fields:

| Field | Type | Meaning |
|-------|------|---------|
| `format_version` | `1` | Outer wrapper version. |
| `zk_proof_version` | `1` | Proof envelope version. |
| `zk_proof_type` | string | Must be `modp_fs_nizk_ml_dsa_binding_v1` for this spec. |
| `hash_policy` | `"SHA3-384"` | Oracle / digest policy. |
| `context` | string | Domain separation (e.g. `par-noir.zkp.age_attestation`). |
| `nonce` | string | Unique per proof (UUID recommended). |
| `expires_at_ms` | number | Unix ms after which verifiers must reject. |
| `public_inputs` | object | Predicate inputs (e.g. `zkp_type`, `age_bucket`, `data_point_id`). |
| `sigma` | object | Fiat–Shamir Schnorr transcript over RFC 5114 §2.1 (hex big-endian integers). |
| `ml_dsa_public_key_b64` | string | Standard base64 of **raw** ML-DSA-65 **public** key (1952 bytes decoded). |
| `ml_dsa_signature_b64` | string | Standard base64 of ML-DSA-65 signature over `SHA3-384(signing_bytes)`. |

`signing_bytes` = UTF-8 JSON of the envelope **without** `ml_dsa_signature_b64`, with **stable key order** (see implementation: sorted keys, recursive).

## Sigma (`sigma`) object

| Field | Meaning |
|-------|---------|
| `group` | `"rfc5114_modp_1024_160"` |
| `y_hex` | Public key \(Y = g^x \bmod p\) |
| `t_hex` | Commitment \(T = g^k \bmod p\) |
| `s_hex` | Response \(s = k + c\cdot x \pmod q\) |
| `challenge_hex` | Fiat–Shamir challenge \(c\) (mod \(q\)) |

Group constants **p**, **q**, **g** are RFC 5114 §2.1 (1024-bit MODP with 160-bit prime-order subgroup).

## Verification steps

1. Parse JSON; reject if `format_version !== 1` or `zk_proof_version !== 1` or unknown `zk_proof_type`.
2. Reject if `Date.now() > expires_at_ms`.
3. Recompute `signing_bytes`, digest with SHA3-384, verify **ML-DSA-65** signature using `ml_dsa_public_key_b64`.
4. Verify Schnorr equation \(g^s \equiv T \cdot Y^c \pmod p\) with \(c\) from SHA3-384 transcript over encoded points and context.

## Legacy rejection

Any proof that does **not** parse as this envelope (e.g. old JSON with only `type` / `ageRange` / `verificationLevel`) **must** fail verification.
