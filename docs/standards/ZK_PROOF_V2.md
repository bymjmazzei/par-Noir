# ZK proof envelope v2 (par Noir)

**Status:** Implemented by `@par-noir/zk-protocol-v2`.  
**Outer binding:** ML-DSA-65 signature over canonical JSON (same pattern as v1).  
**Digest policy (envelope):** SHA3-384 for `binding_digest` and signing transcript (see `IDENTITY_PQC_DECISIONS.md` §4).  
**Inner proof:** zk-STARK via **@guildofweavers/genstark**; IOP Merkle/FRI uses **SHA-256** inside the library (documented in [ZK_PHASE5_SPIKE.md](../security/ZK_PHASE5_SPIKE.md)).

## Goals

- Remove v1 **mod‑p Fiat–Shamir Schnorr** (`sigma`) from the production path; inner soundness does not rely on discrete log in RFC 5114.
- Keep **ML-DSA-65** binding of the full envelope.
- Reject legacy pre‑v1 blobs (unchanged rule: must parse as v1 or v2 envelope).

## Envelope (`zk_proof_version` = 2)

Wire form: **UTF-8 JSON**, then **base64** (same transport as `zkpProof` strings).

| Field | Type | Meaning |
|-------|------|---------|
| `format_version` | `2` | Outer wrapper version. |
| `zk_proof_version` | `2` | Proof envelope version. |
| `zk_proof_type` | string | Must be `stark_genstark_sha256_ml_dsa_binding_v2`. |
| `hash_policy` | `"SHA3-384"` | Oracle/digest policy for **envelope** binding string. |
| `stark_iop_hash` | `"sha256"` | Hash used **inside** genSTARK Merkle/FRI (library default). |
| `context` | string | Domain separation (e.g. `par-noir.zkp.age_attestation`). |
| `nonce` | string | Unique per proof (UUID recommended). |
| `expires_at_ms` | number | Unix ms; verifiers must reject when `now > expires_at_ms`. |
| `public_inputs` | object | Predicate inputs (`zkp_type`, `age_bucket`, etc.). |
| `stark_binding_sha3_384_b64` | string | Standard base64 of **raw 48-byte** SHA3-384 digest of `binding_utf8` (see below). |
| `stark_final_r0_decimal` | string | Decimal string of field element: **register 0** at final step (step 63), in the STARK prime field. |
| `stark_proof_b64` | string | Base64 of **binary** `genstark` `serialize(proof)` output. |
| `ml_dsa_public_key_b64` | string | Raw ML-DSA-65 **public** key (1952 bytes decoded). |
| `ml_dsa_signature_b64` | string | ML-DSA-65 signature over `SHA3-384(signing_bytes)`. |

### `binding_utf8`

Let `stable_public_inputs` = JSON.stringify(sort_keys_recursive(`public_inputs`)) (same key order as v1). Then:

```
binding_utf8 = stable_public_inputs || "\x1e" || context || "\x1e" || nonce
```

(Use Unicode code point U+001E as separator; encode as UTF-8.)

Compute `binding_digest = SHA3-384(UTF8(binding_utf8))`, 48 bytes; `stark_binding_sha3_384_b64` is standard base64 of those bytes.

### STARK public limbs

Six field elements `b0..b5`: for each `i in 0..5`, take bytes `binding_digest[8*i .. 8*i+7]`, interpret as big-endian unsigned 64-bit integer, reduce modulo the STARK field prime  
`p = 2^32 - 3 * 2^25 + 1`.

Verifier **must** recompute `binding_digest` and limbs from `public_inputs`, `context`, `nonce` and require **exact equality** with `stark_binding_sha3_384_b64` after ML-DSA passes (constant-time compare not required for base64 strings at this layer; prefer `timingSafeEqual` on decoded bytes if available).

### `signing_bytes`

UTF-8 JSON of the envelope **without** `ml_dsa_signature_b64`, with **stable key order** (recursive sort; implementation matches `@par-noir/zk-protocol-v1` `sortKeysDeep`).

### Assertions passed to `stark.verify`

- `{ register: 0, step: 63, value: stark_final_r0 }` with `value = BigInt(stark_final_r0_decimal)`
- `{ register: 1, step: 63, value: b0 }` (first limb as field element)

`publicInputs` to verify: `[[b0],[b1],[b2],[b3],[b4],[b5]]` (each a one-element bigint array per genstark API).

## Verification steps

1. Parse JSON; reject unless `format_version === 2`, `zk_proof_version === 2`, and `zk_proof_type` matches.
2. Reject if expired (`now > expires_at_ms`).
3. Recompute `binding_digest` from `public_inputs`, `context`, `nonce`; decode `stark_binding_sha3_384_b64`; require equality.
4. Recompute `signing_bytes`, SHA3-384 digest, verify ML-DSA-65.
5. Deserialize STARK proof from `stark_proof_b64`; run `stark.verify(assertions, proof, publicLimbs)` with `wasm: false` for portability.

## Migration

- **Issuance:** Dashboard and clients **must emit v2** for new proofs (v1 issuance removed from production UI).
- **Verification:** API and clients **accept v1 and v2** during transition so existing stored proofs remain valid until re-issued.
- v1 specification: [ZK_PROOF_V1.md](ZK_PROOF_V1.md).

## Legacy rejection

Any string that does not decode to a valid **v1** or **v2** envelope must fail verification (same posture as v1-only era for older JSON).
