# par Noir identity wire format (PQC)

**Status:** Active for new identities per [IDENTITY_PQC_DECISIONS.md](../security/IDENTITY_PQC_DECISIONS.md).

## Version 1 (`formatVersion: 1`)

| Field | Type | Meaning |
|-------|------|---------|
| `formatVersion` | number | Must be `1` |
| `sigAlgId` | string | `ML-DSA-65` |
| `kemAlgId` | string | `ML-KEM-768` |
| `hashPolicyId` | string | `SHA3-384` |
| `mlDsaPublicKey` | bytes | Raw ML-DSA-65 public key (1952 bytes) |
| `mlKemPublicKey` | bytes | Raw ML-KEM-768 public key (1184 bytes) |
| `metadata` | map (optional) | Non-secret string map |

**Encoding:** CBOR via `@par-noir/pqc-crypto` (`encodeIdentityBlobV1` / `decodeIdentityBlobV1`).

**API / OAuth:** The legacy `publicKey` string passed to the API may be **base64(raw ML-DSA public key)** for PQC identities, or a concatenation policy documented in the client; servers treat it as an opaque binding input for `pn_identifier` derivation alongside DID and secrets.

## Key sizes (reference)

- ML-DSA-65: public 1952 B, secret 4032 B  
- ML-KEM-768: public 1184 B, secret 2400 B  

## Related

- Package: `@par-noir/pqc-crypto`  
- Identity-core: `ParNoirPqcIdentity` helpers  
