# Integration Credentials Security

## Overview

Integration credentials (OAuth tokens, API keys) for services like Google Drive are now stored securely using encryption, rather than in plaintext localStorage.

## Security Improvements

### Before (Vulnerable)
- ❌ OAuth access tokens stored in **plaintext** localStorage
- ❌ Refresh tokens stored in **plaintext** localStorage  
- ❌ Tokens visible in browser DevTools → Application → Local Storage
- ❌ Tokens accessible to any JavaScript code on the page
- ❌ Tokens persist even after logout

### After (Secure)
- ✅ All integration credentials **encrypted** before storage
- ✅ Encryption key derived from user's pnName + passcode (2FA credentials)
- ✅ Credentials **cannot be decrypted** without user authentication
- ✅ Credentials **automatically cleared** on logout
- ✅ **Automatic migration** of existing plaintext tokens to encrypted storage

## Implementation

### IntegrationCredentialManager

A new secure credential manager handles all integration credentials:

```typescript
// Store credentials (encrypted)
await IntegrationCredentialManager.storeCredentials(
  'google_drive_backend_1',
  {
    accessToken: '...',
    refreshToken: '...',
    email: 'user@example.com'
  },
  sessionId
);

// Retrieve credentials (decrypted)
const credentials = await IntegrationCredentialManager.getCredentials(
  'google_drive_backend_1',
  sessionId
);

// Remove credentials
await IntegrationCredentialManager.removeCredentials('google_drive_backend_1');

// Clear all (on logout)
await IntegrationCredentialManager.clearAll();
```

### Encryption Details

1. **Key Derivation**: Uses PBKDF2 with 100,000 iterations
   - Derived from: `sessionId + pnName + passcode`
   - Ensures credentials are tied to user authentication

2. **Encryption**: AES-GCM 256-bit
   - Industry-standard encryption
   - Includes authentication tag for integrity

3. **Storage**: Encrypted blobs in localStorage
   - While localStorage is still used, data is encrypted
   - Without user credentials, encrypted data is useless

## Migration

### Automatic Migration

On user authentication, the system automatically:

1. Checks for plaintext tokens in localStorage
2. Encrypts and stores them securely
3. Removes plaintext versions
4. Logs migration success

### Manual Migration

If needed, migration can be triggered manually:

```typescript
const migrated = await IntegrationCredentialManager.migratePlaintextCredentials(
  'google_drive',
  sessionId
);
```

## Affected Integrations

### Google Drive
- ✅ Access tokens encrypted
- ✅ Refresh tokens encrypted
- ✅ Email addresses encrypted
- ✅ All plaintext storage removed

### Future Integrations
- All new integrations should use `IntegrationCredentialManager`
- Never store tokens in plaintext localStorage
- Always require user authentication to decrypt

## Security Guarantees

1. **No Plaintext Storage**: All credentials encrypted at rest
2. **User-Dependent**: Cannot decrypt without user's pnName + passcode
3. **Session-Based**: Credentials cleared on logout
4. **Automatic Cleanup**: Plaintext tokens automatically migrated/removed

## Developer Guidelines

### ✅ DO

```typescript
// Store credentials securely
await IntegrationCredentialManager.storeCredentials(
  integrationId,
  credentials,
  sessionId
);

// Retrieve credentials securely
const creds = await IntegrationCredentialManager.getCredentials(
  integrationId,
  sessionId
);
```

### ❌ DON'T

```typescript
// NEVER store tokens in plaintext
localStorage.setItem('google_drive_token', token); // ❌
localStorage.setItem('google_drive_refresh_token', refreshToken); // ❌

// NEVER store in IndexedDB without encryption
await db.put({ accessToken: token }); // ❌
```

## Testing

To verify credentials are encrypted:

1. Connect Google Drive integration
2. Open DevTools → Application → Local Storage
3. Look for keys starting with `encrypted_integration_`
4. Verify values are encrypted blobs (not plaintext tokens)
5. Verify no plaintext `*_token` or `*_refresh_token` keys exist

## Logout Behavior

On logout:
- ✅ All integration credentials cleared from encrypted storage
- ✅ All plaintext tokens removed (if any remain)
- ✅ User must re-authenticate to access integrations
- ✅ Credentials cannot be decrypted without user's pnName + passcode

## Threat Model

### What Attackers Can See
- Encrypted credential blobs in localStorage
- Integration IDs (e.g., 'google_drive_backend_1')
- Storage structure

### What Attackers Cannot Access
- Plaintext access tokens
- Plaintext refresh tokens
- Decryption keys (derived from user credentials)
- Decrypted credentials (without user authentication)

### Attack Mitigation
1. **LocalStorage Inspection**: Attackers see encrypted blobs, not tokens
2. **Code Analysis**: Encryption algorithms visible, but keys are user-dependent
3. **Session Hijacking**: Credentials require user's pnName + passcode to decrypt
4. **Logout**: All credentials cleared, requiring re-authentication

## Conclusion

Integration credentials are now stored securely using encryption derived from user authentication. This ensures that:

- ✅ Tokens are not exposed in plaintext
- ✅ Credentials require user authentication to decrypt
- ✅ Automatic migration cleans up existing vulnerabilities
- ✅ Logout properly clears all credentials

The security model follows the same principles as user credentials: **encryption, not obscurity**.

