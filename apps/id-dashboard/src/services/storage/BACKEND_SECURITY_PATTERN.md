# Storage Backend Security Pattern

## Overview
All storage backends (Google Drive, Firebase, GitHub, etc.) must follow this security pattern to ensure credentials are never stored in plaintext.

## Security Requirements

### 1. Credential Storage
- **NEVER** store credentials in plaintext `localStorage` or `sessionStorage`
- **ALWAYS** use `IntegrationCredentialManager` for credential storage
- Credentials are encrypted using AES-GCM 256-bit encryption
- Encryption key is derived from user's `pnName + passcode`

### 2. Backend Implementation Pattern

```typescript
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';

export class YourBackend extends AbstractStorageBackend {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private userEmail: string | null = null;
  private keyPrefix: string;
  private connected = false;
  private backendId: string;

  constructor(config?: Partial<StorageBackendConfig> & { storageKeyPrefix?: string }) {
    const prefix = config?.storageKeyPrefix || 'your_backend';
    super({
      id: config?.id || prefix,
      name: config?.name || 'Your Backend',
      type: 'your_backend',
      ...config
    });
    this.keyPrefix = prefix;
    this.backendId = config?.id || prefix;
    
    // SECURITY: Do NOT load tokens from plaintext localStorage
    // Tokens should only be loaded from encrypted storage via loadEncryptedCredentials()
    // when user is authenticated
  }

  async connect(credentials: any): Promise<void> {
    // Store credentials in encrypted storage
    if (credentials.sessionId) {
      try {
        await IntegrationCredentialManager.storeCredentials(
          this.backendId, // e.g., 'firebase_backend_1' or 'github_backend_1'
          {
            accessToken: credentials.accessToken,
            refreshToken: credentials.refreshToken,
            email: credentials.email,
            // Add any other credential fields
          },
          credentials.sessionId
        );
      } catch (error) {
        console.error('[YourBackend] Failed to store encrypted credentials:', error);
        throw error;
      }
    }
    
    // SECURITY: Remove any existing plaintext credentials
    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
      // Remove any other credential keys
    } catch (e) {
      // Ignore errors
    }
    
    // Store in memory for current session
    this.token = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.userEmail = credentials.email;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Clear from memory
    this.token = null;
    this.refreshToken = null;
    this.userEmail = null;
    
    // SECURITY: Remove any plaintext credentials (defensive cleanup)
    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
    } catch (e) {
      // localStorage might not be available
    }
    
    // Remove from encrypted storage
    try {
      await IntegrationCredentialManager.removeCredentials(this.backendId);
    } catch (e) {
      console.warn('[YourBackend] Failed to remove encrypted credentials:', e);
    }
    
    this.connected = false;
  }

  /**
   * Load credentials from encrypted storage (requires authenticated session)
   */
  async loadEncryptedCredentials(sessionId: string): Promise<boolean> {
    try {
      const credentials = await IntegrationCredentialManager.getCredentials(
        this.backendId,
        sessionId
      );
      
      if (credentials && credentials.accessToken) {
        this.token = credentials.accessToken;
        this.refreshToken = credentials.refreshToken || null;
        this.userEmail = credentials.email || null;
        this.connected = true;
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[YourBackend] Failed to load encrypted credentials:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected && !!this.token;
  }
}
```

### 3. Migration Pattern

When implementing a new backend, also add migration support:

```typescript
// In your backend's connect() method, after storing new credentials:
try {
  // Migrate any existing plaintext credentials to encrypted storage
  const migrated = await IntegrationCredentialManager.migratePlaintextCredentials(
    this.backendId,
    credentials.sessionId
  );
  if (migrated) {
    console.log('[YourBackend] Migrated plaintext credentials to encrypted storage');
  }
} catch (migrationError) {
  console.warn('[YourBackend] Migration failed:', migrationError);
}
```

### 4. Cleanup Pattern

The `IntegrationCredentialManager.cleanupAllPlaintextCredentials()` method automatically:
- Removes all plaintext credentials matching integration patterns
- Cleans up JSON objects containing credentials
- Runs on every app load

### 5. Integration Types

When adding a new integration type, update:
- `IntegrationCredentialManager.cleanupAllPlaintextCredentials()` - Add patterns
- `IntegrationCredentialManager.migratePlaintextCredentials()` - Add key patterns
- Backend implementation - Follow the pattern above

## Examples

### Google Drive
✅ Implemented: `apps/id-dashboard/src/services/storage/GoogleDriveBackend.ts`

### Firebase
⚠️ Not yet implemented - Use this pattern when creating `FirebaseBackend.ts`

### GitHub
⚠️ Not yet implemented - Use this pattern when creating `GitHubBackend.ts`

## Security Checklist

- [ ] No `localStorage.setItem()` calls for tokens/credentials
- [ ] No `sessionStorage.setItem()` calls for tokens/credentials
- [ ] All credentials stored via `IntegrationCredentialManager.storeCredentials()`
- [ ] Credentials loaded via `IntegrationCredentialManager.getCredentials()`
- [ ] Plaintext credentials removed in `connect()` and `disconnect()`
- [ ] Migration support for existing plaintext credentials
- [ ] Cleanup runs on app startup (already integrated in `App.tsx`)

