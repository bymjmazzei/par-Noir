# pN Identifier Consistency

## Overview

The pN identifier is a stable identifier used for Google Drive folders, OAuth binding, and API storage rows. **Canonical id is derived from the identity public key only** (passcode-independent).

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

- **Stable across passcode rotation** (recovery sets new passcode, same keys)
- **OAuth and API binding** do not break after recovery
- **No passcode in identifier derivation** (passcode is a secret factor, not an id ingredient)

## Legacy method (migration only)

`VolumeIdGenerator.generateVolumeId({ pnName, passcode, publicKey })` hashes all three factors. Existing Drive folders may use this id. On unlock, call `POST /api/storage/migrate-volume-id` when legacy ≠ canonical.

## Usage requirements

1. **Always prefer** `generateCanonicalVolumeId(publicKey)` for new OAuth sessions, API credentials, and recovery flows.
2. **Never log** pn name or passcode when generating or migrating ids.
3. **Persist `driveFolderId`** in storage credentials when connecting Google Drive so recovery re-link can find the folder after id migration.

## Related

- Dashboard: `apps/id-dashboard/src/utils/volumeIdMigration.ts`
- API: `POST /api/storage/migrate-volume-id`
- Recovery: same `publicKey` after Shamir recovery → same canonical id → messaging keys unchanged
