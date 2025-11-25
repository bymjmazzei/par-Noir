# Security Migration Guide

## Overview

This guide helps migrate code from storing pN name and passcode in `AuthSession` to using `SecureCredentialManager`.

## ✅ Completed Changes

### 1. Core Infrastructure
- ✅ Created `MemorySecurity` utility for memory zeroization
- ✅ Created `PNNameHash` utility for secure lookups
- ✅ Updated `AuthSession` interface to remove `pnName` and `passcode`
- ✅ Updated `authenticateIdentity()` to use `SecureCredentialManager`
- ✅ Enhanced `SecureCredentialManager` with memory zeroization

### 2. Files Modified
- `apps/id-dashboard/src/utils/security/memorySecurity.ts` (NEW)
- `apps/id-dashboard/src/utils/security/pnNameHash.ts` (NEW)
- `apps/id-dashboard/src/utils/crypto.ts` (UPDATED)
- `apps/id-dashboard/src/types/crypto.ts` (UPDATED)
- `apps/id-dashboard/src/utils/secureCredentialManager.ts` (ENHANCED)

## 🔄 Migration Pattern

### Before (INSECURE)
```typescript
// ❌ DON'T DO THIS
const session = await IdentityCrypto.authenticateIdentity(encryptedIdentity, passcode);
console.log(session.pnName); // ❌ SECRET exposed
console.log(session.passcode); // ❌ SECRET exposed

// Using secrets
const pnName = session.pnName;
const passcode = session.passcode;
```

### After (SECURE)
```typescript
// ✅ DO THIS
const session = await IdentityCrypto.authenticateIdentity(encryptedIdentity, passcode);
// pN name and passcode are automatically stored in SecureCredentialManager

// Getting secrets when needed
import { SecureCredentialManager } from './utils/secureCredentialManager';

const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) {
  throw new Error('Credentials expired or not found');
}

const { pnName, passcode } = credentials;
// Use secrets here, but don't store them in variables longer than necessary

// Clear after use (optional, but recommended)
SecureCredentialManager.clearCredentials(session.id);
```

## 📋 Files That Need Updates

### High Priority (117 locations using `session.passcode`)
1. `apps/id-dashboard/src/components/storage/FileStorageAggregator.tsx` (30+ usages)
2. `apps/id-dashboard/src/App.tsx` (20+ usages)
3. `apps/id-dashboard/src/components/storage/GoogleDriveStorage.tsx` (5+ usages)
4. `apps/id-dashboard/src/utils/integrationCredentialManager.ts` (3+ usages)
5. Other files with `session.passcode` or `authenticatedUser.passcode`

### High Priority (100+ locations using `session.pnName`)
1. `apps/id-dashboard/src/components/storage/FileStorageAggregator.tsx` (50+ usages)
2. `apps/id-dashboard/src/App.tsx` (30+ usages)
3. `apps/id-dashboard/src/utils/optimizedStorage.ts` (lookup functions)
4. Other files with `session.pnName` or `authenticatedUser.pnName`

## 🔍 Finding Usages

### Search Patterns
```bash
# Find all usages of session.pnName
grep -r "session\.pnName\|authenticatedUser\.pnName\|\.pnName" apps/id-dashboard/src

# Find all usages of session.passcode
grep -r "session\.passcode\|authenticatedUser\.passcode\|\.passcode" apps/id-dashboard/src

# Find AuthSession type usages
grep -r "AuthSession\|authenticatedUser" apps/id-dashboard/src
```

## 📝 Step-by-Step Migration

### Step 1: Import SecureCredentialManager
```typescript
import { SecureCredentialManager } from '../utils/secureCredentialManager';
// or
import { SecureCredentialManager } from '../../utils/secureCredentialManager';
```

### Step 2: Replace Direct Access
```typescript
// BEFORE
const pnName = session.pnName;
const passcode = session.passcode;

// AFTER
const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) {
  // Handle expired/missing credentials
  throw new Error('Credentials expired');
}
const { pnName, passcode } = credentials;
```

### Step 3: Handle Expired Credentials
```typescript
// Always check if credentials exist
const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) {
  // Options:
  // 1. Re-authenticate user
  // 2. Show error message
  // 3. Redirect to login
  return;
}
```

### Step 4: Clear After Use (Optional but Recommended)
```typescript
// For sensitive operations, clear immediately after use
const credentials = SecureCredentialManager.getCredentials(session.id);
if (credentials) {
  // Use credentials
  await doSomething(credentials.pnName, credentials.passcode);
  
  // Clear immediately after use (optional)
  // SecureCredentialManager.clearCredentials(session.id);
}
```

## 🎯 Common Patterns

### Pattern 1: File Operations
```typescript
// BEFORE
const encrypted = await encryptFile(file, session.pnName, session.passcode);

// AFTER
const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) throw new Error('Credentials expired');
const encrypted = await encryptFile(file, credentials.pnName, credentials.passcode);
```

### Pattern 2: API Calls
```typescript
// BEFORE
await api.call(session.pnName, session.passcode);

// AFTER
const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) throw new Error('Credentials expired');
await api.call(credentials.pnName, credentials.passcode);
```

### Pattern 3: Conditional Checks
```typescript
// BEFORE
if (session.pnName && session.passcode) {
  // do something
}

// AFTER
const credentials = SecureCredentialManager.getCredentials(session.id);
if (credentials) {
  // do something with credentials.pnName and credentials.passcode
}
```

### Pattern 4: Lookups by pN Name
```typescript
// BEFORE
const identity = storage.getByPNName(session.pnName);

// AFTER
// Option 1: Use hashed lookup (recommended)
import { PNNameHash } from '../utils/security/pnNameHash';
const credentials = SecureCredentialManager.getCredentials(session.id);
if (!credentials) throw new Error('Credentials expired');
const lookupKey = await PNNameHash.getLookupKey(credentials.pnName);
const identity = storage.getByHash(lookupKey);

// Option 2: Use credentials directly (if lookup function requires it)
const identity = storage.getByPNName(credentials.pnName);
```

## ⚠️ Important Notes

### 1. Credentials Expire After 15 Minutes
- Credentials automatically expire after 15 minutes
- Always check if credentials exist before using
- Handle expired credentials gracefully

### 2. Memory Only Storage
- Credentials are NEVER persisted to localStorage/IndexedDB
- They exist only in memory during active session
- They are cleared on page reload/refresh

### 3. Zeroization
- Secrets are zeroized from memory when cleared
- This is best-effort (JavaScript strings are immutable)
- Still provides defense in depth

### 4. Don't Store in Variables
```typescript
// ❌ DON'T DO THIS
const pnName = credentials.pnName;
const passcode = credentials.passcode;
// Store in component state or props - SECRETS exposed!

// ✅ DO THIS
// Get credentials when needed, use immediately, don't store
const credentials = SecureCredentialManager.getCredentials(session.id);
if (credentials) {
  await doSomething(credentials.pnName, credentials.passcode);
  // Don't store pnName/passcode in component state
}
```

## 🧪 Testing Checklist

After migration, verify:

- [ ] No `session.pnName` or `session.passcode` in codebase
- [ ] All secret access goes through `SecureCredentialManager`
- [ ] Expired credentials are handled gracefully
- [ ] No secrets stored in component state
- [ ] No secrets in localStorage/IndexedDB
- [ ] Memory zeroization works on logout
- [ ] Application works correctly with new pattern

## 🚀 Next Steps

1. **Update FileStorageAggregator.tsx** (highest priority - most usages)
2. **Update App.tsx** (high priority - core functionality)
3. **Update GoogleDriveStorage.tsx** (medium priority)
4. **Update other components** (as needed)
5. **Remove pN name from localStorage/IndexedDB** (cleanup)
6. **Add tests** for SecureCredentialManager usage

## 📚 Reference

- `MITIGATION_STRATEGIES.md` - Full security strategy
- `IMPLEMENTATION_SUMMARY.md` - Quick reference
- `apps/id-dashboard/src/utils/secureCredentialManager.ts` - Implementation
- `apps/id-dashboard/src/utils/security/memorySecurity.ts` - Memory utilities
- `apps/id-dashboard/src/utils/security/pnNameHash.ts` - Hash utilities

---

**Last Updated**: 2024-12-XX
**Status**: Core infrastructure complete, migration in progress

