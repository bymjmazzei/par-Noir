# pN Identifier Consistency

## Overview

The pN identifier is a stable identifier used for Google Drive folders, OAuth binding, and API storage rows. **Canonical id is derived from the identity public key only** (independent of Key 1 and Key 2).

## Canonical method

```typescript
import {
  deriveCanonicalPnIdentifier,
  deriveDidFromPublicKey,
} from '@par-noir/pqc-crypto/oauth-unlock-proof';

const pnIdentifier = deriveCanonicalPnIdentifier(publicKey); // "pn-<64 hex>"
const did = deriveDidFromPublicKey(publicKey);               // "did:pn:<64 hex>"
```

`@par-noir/pqc-crypto/oauth-unlock-proof` is the only implementation. Do not re-derive the id anywhere else.

### Algorithm

1. **Decode**: base64 ML-DSA-65 public key → 1952 raw bytes (anything else throws)
2. **Hash**: full SHA-256 of those bytes → 64 lowercase hex chars
3. **Format**: `pn-<hex>` for the pN identifier, `did:pn:<hex>` for the DID (same hash)

Validate with `isPnIdentifier` / `isPnDid` (`PN_IDENTIFIER_RE`, `PN_DID_RE`). Convert with `pnIdentifierFromDid` / `pnDidFromIdentifier`.

### Why publicKey-only?

- **Stable across key rotation** (recovery sets a new Key 1 / Key 2, same keypair)
- **OAuth and API binding** do not break after recovery
- **No Key 1 or Key 2 in identifier derivation** (both are secrets, never id ingredients)

## Usage requirements

1. **Always use** `deriveCanonicalPnIdentifier(publicKey)` for OAuth sessions, API credentials, and recovery flows.
2. **Never log** Key 1 or Key 2.
3. **Persist `driveFolderId`** in storage credentials when connecting Google Drive so recovery re-link can find the folder.

## Related

- Recovery: same `publicKey` after Shamir recovery → same canonical id → messaging keys unchanged
