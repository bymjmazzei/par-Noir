# pN Identifier Consistency

## Overview

The pN identifier is a stable identifier used for Google Drive folders, OAuth binding, and API storage rows. **Canonical id is derived from the identity public key only** (independent of Key 1 and Key 2).

## Canonical method (preferred)

```typescript
import { VolumeIdGenerator } from '../../utils/crypto/volumeIdGenerator';

const pnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(publicKey);
// Returns: "pn-{first 12 hex chars of SHA-256(publicKey)}"
```

### Algorithm

1. **Hash**: SHA-256 of UTF-8 `publicKey`
2. **Extract**: First 12 hex characters
3. **Format**: `pn-{12-char-hex}`

### Why publicKey-only?

- **Stable across key rotation** (recovery sets a new Key 1 / Key 2, same keypair)
- **OAuth and API binding** do not break after recovery
- **No Key 1 or Key 2 in identifier derivation** (both are secrets, never id ingredients)

## Usage requirements

1. **Always prefer** `generateCanonicalVolumeId(publicKey)` for new OAuth sessions, API credentials, and recovery flows.
2. **Never log** Key 1 or Key 2.
3. **Persist `driveFolderId`** in storage credentials when connecting Google Drive so recovery re-link can find the folder.

## Related

- Recovery: same `publicKey` after Shamir recovery → same canonical id → messaging keys unchanged
