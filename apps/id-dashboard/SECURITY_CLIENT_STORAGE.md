# Client-Side Storage Security Documentation

## Overview

This document addresses security concerns regarding client-side database initialization and storage.

## IndexedDB Initialization on Client

### Why It's Necessary

IndexedDB is a browser API that **must** be initialized on the client side. It cannot be "moved to the backend" because:

1. **Browser API Limitation**: IndexedDB is a client-side storage API - it exists only in the browser
2. **Offline Functionality**: The app requires local storage for offline operation
3. **Performance**: Local storage provides fast access without network latency

### Security Measures Implemented

#### 1. No Plaintext Credentials Stored

**Critical**: The following databases **NEVER** store plaintext credentials:

- ✅ `IdentityDashboardDB` - Only stores encrypted identity data (no pnName/passcode)
- ✅ `IdentityProtocolDB` - Only stores encrypted identity data (no pnName/passcode)

**Credentials Storage**:
- pnName and passcode are stored **ONLY** in memory via `SecureCredentialManager`
- Credentials are **NEVER** persisted to IndexedDB, localStorage, or sessionStorage
- Credentials are cleared on logout and expire after session timeout

#### 2. Database Structure Visibility

While database initialization code is visible in client-side JavaScript:

- **Database names are not secrets** - they're just identifiers
- **Structure visibility is acceptable** - the security comes from encryption, not obscurity
- **No sensitive data** is stored in plaintext regardless of structure visibility

#### 3. Encryption Key Generation

Encryption keys are generated client-side because:

- Keys are used for **local encryption only** - never transmitted to servers
- Each user's data is encrypted with a unique key
- Keys are stored in memory or encrypted storage, never in plaintext

## Database Usage

### IdentityDashboardDB

**Purpose**: Legacy PWA migration storage (being phased out)

**Stored Data**:
- Encrypted identity objects (`EncryptedIdentity`)
- Settings and configuration
- **NO** plaintext pnName or passcode

**Security**:
- All data is encrypted before storage
- Credentials are explicitly sanitized before storage
- Used only for migration, not primary storage

### IdentityProtocolDB (Primary Storage)

**Purpose**: Primary identity storage via `SecureStorage` class

**Stored Data**:
- Encrypted identity data
- Session metadata (without credentials)
- **NO** plaintext pnName or passcode

**Security**:
- All sensitive data encrypted
- Credentials stored only in `SecureCredentialManager` (memory)
- Session data explicitly excludes credentials

## Best Practices

### For Developers

1. **Never store credentials in IndexedDB**:
   ```typescript
   // ❌ BAD
   await storage.saveIdentity({ pnName: 'user', passcode: '123456' });
   
   // ✅ GOOD
   await storage.saveIdentity({ publicKey: '...', encryptedData: '...' });
   ```

2. **Use SecureCredentialManager for credentials**:
   ```typescript
   // ✅ GOOD
   SecureCredentialManager.setCredentials(sessionId, pnName, passcode);
   ```

3. **Sanitize data before storage**:
   ```typescript
   // ✅ GOOD
   const sanitized = { ...data };
   delete sanitized.pnName;
   delete sanitized.passcode;
   ```

### Security Audit Checklist

- [x] No plaintext pnName in IndexedDB
- [x] No plaintext passcode in IndexedDB
- [x] Credentials stored only in SecureCredentialManager
- [x] Session data excludes credentials
- [x] All sensitive data encrypted before storage
- [x] Credentials cleared on logout
- [x] Migration script cleans existing vulnerable data

## Threat Model

### What Attackers Can See

1. **Database structure** - Visible in client code
2. **Database names** - Visible in client code
3. **Encryption algorithms** - Visible in client code

### What Attackers Cannot Access

1. **Encryption keys** - Generated per-session, stored securely
2. **Plaintext credentials** - Never stored, only in memory
3. **Decrypted data** - Requires credentials that are never persisted

### Attack Mitigation

1. **Database inspection** - Attackers can see structure but not plaintext data
2. **Code analysis** - Attackers can see algorithms but not keys or credentials
3. **Memory inspection** - Credentials in memory are cleared on logout/timeout

## Conclusion

While database initialization code is visible in client-side JavaScript, this is an **acceptable security trade-off** because:

1. **Security through encryption, not obscurity** - Data is encrypted regardless of structure visibility
2. **No credentials persisted** - Critical credentials are never stored
3. **Industry standard** - All client-side apps must initialize storage on the client
4. **Defense in depth** - Multiple layers of security (encryption, sanitization, memory-only credentials)

The real security comes from:
- ✅ Encryption of all sensitive data
- ✅ Never storing credentials in persistent storage
- ✅ Using memory-only storage for credentials
- ✅ Proper data sanitization before storage

