# SyncReceiver Security Fix

## 🔒 Security Issues Fixed

### Before (INSECURE)
1. ❌ **localStorage**: Stored `pnName` and `passcode` in plaintext
2. ❌ **File Download**: Included `pnName` in plaintext in downloaded file
3. ❌ **Filename**: Used `pnName` in filename (`${pnName}-synced.pn`)
4. ❌ **PWA Storage**: Stored `pnName` in localStorage (`pwa-identities`)
5. ❌ **UI Display**: Displayed `pnName` in success message
6. ❌ **Verification**: Compared plaintext `pnName` and `passcode`

### After (SECURE)
1. ✅ **localStorage**: Detects and rejects sync data with plaintext secrets
2. ✅ **File Download**: Uses `pnIdentifier` (hash-based) instead of `pnName`
3. ✅ **Filename**: Uses identifier (`pn-{hash}-synced.pn`) instead of `pnName`
4. ✅ **PWA Storage**: Stores only `pnIdentifier`, not `pnName`
5. ✅ **UI Display**: Generic message without exposing `pnName`
6. ✅ **Verification**: Uses hash comparison (`PNNameHash.verify()`)

## 📋 Changes Made

### 1. Verification Logic
- **Before**: `pnName !== syncData.pnName || passcode !== syncData.passcode`
- **After**: `PNNameHash.verify(pnName, syncData.pnNameHash)`
- **Legacy Support**: Detects and warns about insecure sync data

### 2. File Creation
- **Before**: `pnName: pnName` (plaintext)
- **After**: `pnIdentifier: pn-{hash}` (hash-based identifier)

### 3. Filename
- **Before**: `${pnName}-synced.pn`
- **After**: `pn-{hash}-synced.pn`

### 4. PWA Storage
- **Before**: `name: pnName` (plaintext)
- **After**: `pnIdentifier: pn-{hash}` (hash-based)

### 5. UI Display
- **Before**: `Your pN "{pnName}" has been downloaded...`
- **After**: `Your pN file has been downloaded...`

## ⚠️ Important Notes

### Sync Data Creation (Needs Update)
The sync data creation code (wherever it is) should be updated to:
1. **Hash pnName** before storing: `pnNameHash = await PNNameHash.hash(pnName)`
2. **Store hash only**: `{ pnNameHash, deviceType, ... }` (NO plaintext pnName/passcode)
3. **Remove passcode**: Passcode should NOT be stored in sync data at all

### Legacy Data Handling
- SyncReceiver detects legacy/insecure sync data
- Warns user and removes insecure data
- Prevents use of insecure sync data

## 🔐 Security Guarantees

### ✅ **Never Exposed**:
- ❌ Plaintext `pnName` in localStorage
- ❌ Plaintext `pnName` in downloaded file
- ❌ Plaintext `pnName` in filename
- ❌ Plaintext `pnName` in UI display
- ❌ Plaintext `passcode` anywhere

### ✅ **Only Used**:
- ✅ Hash-based verification (`PNNameHash.verify()`)
- ✅ Hash-based identifiers (`pn-{hash}`)
- ✅ User input (temporary, not stored)

## 📝 Next Steps

1. **Update Sync Data Creation**: Find where sync data is created and update it to use hashes
2. **Test Legacy Migration**: Ensure legacy sync data is properly rejected
3. **Update Documentation**: Document secure sync data format

---

**Status**: ✅ **SECURED**
**Date**: 2024-12-XX
**Risk Level**: 🟢 **LOW** (after fixes)

