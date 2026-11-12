# `org.parnoir.author.v1` — pN author credential for CAWG identity assertions

Any C2PA claim generator (Pen, Photoshop, a camera app) can credit a par Noir author by
embedding a [CAWG identity assertion](https://cawg.io/identity/) whose `signer_payload.sig_type`
is `org.parnoir.author.v1`. The claim signer (the tool's X.509 certificate) says which tool made
the file; this assertion says which person did.

Validators that do not know the sig type report `cawg.identity.sig_type.unknown` and otherwise
validate the manifest normally. par Noir verifies it with `verifyAuthorAssertion`.

## Signer payload

Standard CAWG `signer_payload`:

- `sig_type`: `"org.parnoir.author.v1"`
- `referenced_assertions`: hashed URIs of the assertions the author vouches for. It **must**
  include the hard binding (`c2pa.hash.data`, `c2pa.hash.bmff*`, `c2pa.hash.boxes` or
  `c2pa.hash.collection*`) and should include `c2pa.actions*`.

## Signed bytes

1. Normalize the payload: every reference becomes `{ url, hash }` with `hash` as standard
   base64; sort references by `url` (code-unit order).
2. Sign with ML-DSA-65 (FIPS 204) over the UTF-8 bytes of

   ```
   PN-AUTHOR-V1\n{"sigType":"org.parnoir.author.v1","refs":[{"url":"…","hash":"…"},…],"chainHead":<string|null>}
   ```

   (`JSON.stringify` key order exactly as shown.)

## Credential (`signature` field)

UTF-8 JSON:

| Field       | Type                                   | Meaning                                                                                                   |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `v`         | `1`                                    | Format version                                                                                            |
| `alg`       | `"ML-DSA-65"`                          | Signature algorithm                                                                                       |
| `publicKey` | base64                                 | The author's handle signing key (1952 bytes)                                                              |
| `signature` | base64                                 | ML-DSA-65 signature over the signed bytes                                                                 |
| `receipt`   | `{ receipt, signature }` or `null`     | The latest handle receipt from the par Noir registry (`GET /api/public-names/receipt/:handle`), unmodified |
| `chainHead` | string or `null`                       | Pen documents: hash of the latest Pen chain link. Otherwise `null`                                        |

Reserve `PN_AUTHOR_RESERVE_SIZE` (20000) bytes for it.

## Verification

1. `sig_type` is `org.parnoir.author.v1` and a hard binding is referenced.
2. The ML-DSA-65 signature verifies under `publicKey`.
3. If `receipt` is present: the registry key signed it, it names `publicKey` as the signing key,
   it is not an ending event (supersede, release, expire), and it was issued no later than the
   claim's signing time. The handle in the receipt is the credited author.
4. The author's stable id is `authorKeyId = hex(SHA3-384(publicKey))`.

Without a receipt the assertion still proves a key signed the work, but credits no handle.

## Companion assertions

- `org.parnoir.pen.doc` — `{ v: 1, docId, penIrRef, templateId, license: { family, workLicense } }`
  for files exported from Pen.
- `cawg.training-mining` — the author's AI training / mining preferences (default: all
  `notAllowed`).
