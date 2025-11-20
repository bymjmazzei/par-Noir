# pN Identifier Consistency

## Overview

The pN identifier is a stable, deterministic identifier used to create pN-specific folders in Google Drive and other storage backends. It ensures that files are organized consistently across all implementations (web dashboard, desktop app, etc.).

## Generation Method

### Primary Method: VolumeIdGenerator

All pN identifiers are generated using `VolumeIdGenerator.generateVolumeId()`:

```typescript
import { VolumeIdGenerator } from '../../utils/crypto/volumeIdGenerator';

const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
  pnName: 'user_pn_name',
  passcode: 'user_passcode',
  publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...'
});
// Returns: "pn-7c1f0cf425b5" (12-character hex hash)
```

### Algorithm

1. **Combine credentials**: `${pnName}:${passcode}:${publicKey}`
2. **Hash**: SHA-256 hash of the combined string
3. **Extract**: First 12 characters of hex representation
4. **Format**: `pn-{12-char-hex-hash}`

### Why This Method?

- **Deterministic**: Same credentials always produce the same identifier
- **Consistent**: Same algorithm used in desktop app, web dashboard, and all implementations
- **Secure**: Uses all 3 pieces of 2FA credentials (pnName + passcode + publicKey)
- **Stable**: Identifier doesn't change across sessions or devices

## Fallback Methods

When credentials are not fully available, the system uses fallback methods:

### Fallback 1: Derived Identifier (did:publicKey)

```typescript
// Uses: SHA256(did:publicKey).substring(0, 12)
const combined = `${authenticatedUser.id}:${publicKey}`;
const hash = SHA256(combined);
const identifier = `pn-${hash.substring(0, 12)}`;
```

This is stored in `pnIdentifierRef` and used when VolumeIdGenerator cannot be used.

### Fallback 2: Direct pnName

Only used as last resort when no other method is available.

## Usage Locations

The pN identifier is used in:

1. **Google Drive Folder Creation**
   - Creates folder: `par Noir - pn-7c1f0cf425b5`
   - Stores files in pN-specific folder

2. **Metadata Folder Creation**
   - Creates: `_metadata` folder inside pN folder
   - Stores owner index and public file index

3. **File Indexing**
   - Links files to pN identifier in metadata
   - Enables pN-specific file queries

4. **Cross-Platform Sync**
   - Same identifier used across web, desktop, mobile
   - Ensures files are accessible from all platforms

## Consistency Guarantees

✅ **Same credentials = Same identifier**
- If you use the same pnName, passcode, and publicKey, you'll get the same identifier
- This ensures your Google Drive folder is always the same

✅ **Cross-platform consistency**
- Web dashboard uses same algorithm as desktop app
- Files uploaded from web are accessible from desktop and vice versa

✅ **Session persistence**
- Identifier doesn't change between sessions
- Once created, the folder structure remains stable

## Migration Notes

If you see a new pN identifier in Google Drive:

1. **Check credentials**: Make sure you're using the same pnName, passcode, and publicKey
2. **Old folders**: Previous folders with different identifiers will still work
3. **New uploads**: New files will go to the folder with the correct identifier
4. **Manual migration**: You can manually move files from old folders to new folders if needed

## Implementation Details

### VolumeIdGenerator

Located at: `apps/id-dashboard/src/utils/crypto/volumeIdGenerator.ts`

```typescript
export class VolumeIdGenerator {
  static async generateVolumeId(params: {
    pnName: string;
    passcode: string;
    publicKey: string;
  }): Promise<string> {
    const combined = `${params.pnName}:${params.passcode}:${params.publicKey}`;
    const hash = SHA256(combined);
    return `pn-${hash.substring(0, 12)}`;
  }
}
```

### Usage in FileStorageAggregator

All pN identifier generation in `FileStorageAggregator.tsx` now uses:

1. **Primary**: `VolumeIdGenerator.generateVolumeId()` when credentials available
2. **Fallback**: `pnIdentifierRef.current` (derived from did:publicKey)
3. **Last resort**: Direct pnName or 'default'

## Troubleshooting

### Multiple pN Folders

If you see multiple pN folders in Google Drive:

1. **Cause**: Different identifier generation methods were used
2. **Solution**: All code now uses VolumeIdGenerator consistently
3. **Action**: New uploads will go to the correct folder (with consistent identifier)
4. **Cleanup**: Old folders can be manually deleted or left as-is

### Identifier Mismatch

If files aren't appearing in expected folder:

1. **Check**: Verify you're using the same credentials (pnName, passcode, publicKey)
2. **Verify**: Check console logs for generated identifier
3. **Debug**: Look for `[Upload] Generated pN identifier` or `[loadFiles] Generated pN identifier` logs

## Security Notes

- **pnName and passcode**: Never stored in localStorage or IndexedDB
- **Identifier**: Derived from credentials but doesn't expose them
- **Hash**: One-way function - cannot reverse to get credentials
- **Storage**: Only the identifier (not credentials) is used for folder naming

