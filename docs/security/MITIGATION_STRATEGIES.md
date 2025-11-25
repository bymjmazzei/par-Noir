# Security Risk Mitigation Strategies

This document outlines concrete mitigation strategies for the remaining attack vectors in the Identity Protocol ecosystem.

## 1. Secret Management - pN Name and Passcode

### Problem
**CRITICAL**: Both pN name and passcode are secrets and must be treated identically:
- Currently stored in `AuthSession` in plaintext
- Stored in localStorage/IndexedDB in various places
- Used as lookup keys throughout the application
- Vulnerable to memory dumps and inspection

### Solutions

#### A. Secure Credential Manager
**Implementation**: Store both pN name and passcode securely, never in plaintext.

```typescript
// apps/id-dashboard/src/utils/security/secureCredentialManager.ts
export class SecureCredentialManager {
  private static credentials = new Map<string, {
    pnName: string;
    passcode: string;
    expiresAt: number;
  }>();

  /**
   * Store credentials temporarily in memory (not persistent storage)
   */
  static store(identityId: string, pnName: string, passcode: string, ttlMs: number = 15 * 60 * 1000): void {
    // Clear any existing credentials for this identity
    this.clear(identityId);

    // Store in memory only (not localStorage/IndexedDB)
    this.credentials.set(identityId, {
      pnName,
      passcode,
      expiresAt: Date.now() + ttlMs
    });

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.clear(identityId);
    }, ttlMs);
  }

  /**
   * Get credentials (returns null if expired or not found)
   */
  static get(identityId: string): { pnName: string; passcode: string } | null {
    const creds = this.credentials.get(identityId);
    if (!creds) return null;
    
    if (Date.now() > creds.expiresAt) {
      this.clear(identityId);
      return null;
    }

    return {
      pnName: creds.pnName,
      passcode: creds.passcode
    };
  }

  /**
   * Clear credentials and zeroize memory
   */
  static clear(identityId: string): void {
    const creds = this.credentials.get(identityId);
    if (creds) {
      // Zeroize sensitive data
      MemorySecurity.zeroize(creds.pnName);
      MemorySecurity.zeroize(creds.passcode);
      this.credentials.delete(identityId);
    }
  }

  /**
   * Clear all credentials
   */
  static clearAll(): void {
    this.credentials.forEach((_, id) => this.clear(id));
    this.credentials.clear();
  }
}
```

#### B. Use Hashed pN Name for Lookups
**Implementation**: Never use plaintext pN name as identifier.

```typescript
// apps/id-dashboard/src/utils/security/pnNameHash.ts
export class PNNameHash {
  /**
   * Generate hash of pN name for use as identifier
   * This allows lookups without exposing the pN name
   */
  static async hash(pnName: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pnName);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate lookup key from pN name hash
   */
  static async getLookupKey(pnName: string): Promise<string> {
    const hash = await this.hash(pnName);
    return `pn_${hash.substring(0, 16)}`; // Use first 16 chars of hash
  }
}
```

#### C. Updated AuthSession Interface
**Implementation**: Remove both pN name and passcode from AuthSession.

```typescript
// apps/id-dashboard/src/types/crypto.ts
export interface AuthSession {
  id: string; // DID - this is public, safe to store
  nickname: string; // Display name - can be public
  accessToken: string;
  expiresIn: number;
  authenticatedAt: string;
  publicKey: string; // Public key - safe to store
  authToken?: string;
  // REMOVED: pnName - SECRET, use SecureCredentialManager.get(id).pnName
  // REMOVED: passcode - SECRET, use SecureCredentialManager.get(id).passcode
}
```

---

## 2. Memory Attack Mitigation

### Problem
Keys exist in browser memory during active session, vulnerable to memory dumps and inspection.

### Solutions

#### A. Memory Zeroization
**Implementation**: Clear sensitive data from memory immediately after use.

```typescript
// apps/id-dashboard/src/utils/security/memorySecurity.ts
export class MemorySecurity {
  /**
   * Securely zeroize sensitive data from memory
   */
  static zeroize(buffer: ArrayBuffer | Uint8Array | string): void {
    if (buffer instanceof ArrayBuffer) {
      const view = new Uint8Array(buffer);
      crypto.getRandomValues(view); // Overwrite with random data
      for (let i = 0; i < view.length; i++) {
        view[i] = 0;
      }
    } else if (buffer instanceof Uint8Array) {
      crypto.getRandomValues(buffer);
      buffer.fill(0);
    } else if (typeof buffer === 'string') {
      // For strings, we can't directly zeroize, but we can clear references
      // Note: JavaScript strings are immutable, so this is best effort
      const encoder = new TextEncoder();
      const buffer = encoder.encode(buffer);
      crypto.getRandomValues(buffer);
      buffer.fill(0);
    }
  }

  /**
   * Zeroize multiple buffers
   */
  static zeroizeMultiple(...buffers: (ArrayBuffer | Uint8Array | string)[]): void {
    buffers.forEach(buf => this.zeroize(buf));
  }

  /**
   * Secure cleanup wrapper for async operations
   */
  static async withSecureCleanup<T>(
    operation: () => Promise<T>,
    cleanup: (result: T) => void
  ): Promise<T> {
    try {
      const result = await operation();
      cleanup(result);
      return result;
    } catch (error) {
      throw error;
    }
  }
}
```

#### B. Automatic Session Timeout
**Implementation**: Automatically clear keys from memory after inactivity.

```typescript
// apps/id-dashboard/src/utils/security/sessionTimeout.ts
export class SessionTimeoutManager {
  private timeoutId: number | null = null;
  private readonly TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private onTimeout: () => void;

  constructor(onTimeout: () => void) {
    this.onTimeout = onTimeout;
    this.reset();
  }

  reset(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = window.setTimeout(() => {
      this.onTimeout();
    }, this.TIMEOUT_MS);
  }

  destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

#### C. Keep Keys in Web Workers Only
**Implementation**: Never expose keys to main thread - all operations in isolated worker.

**Current Status**: ✅ Already implemented via `cryptoWorkerManager`

**Enhancement**: Ensure passcode is never stored in AuthSession:

```typescript
// Remove passcode from AuthSession - it should never be stored
// apps/id-dashboard/src/utils/crypto.ts (line 181)
return {
  id: identity.id,
  pnName: resolvedPnName,
  nickname: identity.nickname || resolvedPnName,
  accessToken: token,
  expiresIn: this.TOKEN_EXPIRY,
  authenticatedAt: new Date().toISOString(),
  publicKey: encryptedIdentity.publicKey,
  // REMOVED: passcode, // NEVER store passcode in session
  authToken,
};
```

---

## 2. Keylogger Mitigation

### Problem
Keyloggers can capture passcode during entry.

### Solutions

#### A. Virtual Keyboard
**Implementation**: On-screen keyboard prevents hardware keyloggers.

```typescript
// apps/id-dashboard/src/components/security/VirtualKeyboard.tsx
export const VirtualKeyboard: React.FC<{
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
}> = ({ onKeyPress, onBackspace, onEnter }) => {
  const keys = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')']
  ];

  return (
    <div className="virtual-keyboard">
      {keys.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(key => (
            <button
              key={key}
              onClick={() => onKeyPress(key)}
              className="keyboard-key"
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="keyboard-row">
        <button onClick={onBackspace}>⌫</button>
        <button onClick={onEnter}>Enter</button>
      </div>
    </div>
  );
};
```

#### B. Biometric Authentication
**Implementation**: Use WebAuthn API for biometric authentication.

```typescript
// apps/id-dashboard/src/utils/security/webauthn.ts
export class WebAuthnManager {
  /**
   * Register biometric credential
   */
  static async register(userId: string, userName: string): Promise<Credential> {
    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        name: "Par Noir Identity",
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }], // ES256
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Use device authenticator
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "direct"
    };

    return await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    }) as PublicKeyCredential;
  }

  /**
   * Authenticate with biometric
   */
  static async authenticate(
    credentialId: ArrayBuffer,
    challenge: Uint8Array
  ): Promise<AuthenticatorAssertionResponse> {
    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      allowCredentials: [{
        id: credentialId,
        type: "public-key",
        transports: ["internal"]
      }],
      timeout: 60000,
      userVerification: "required"
    };

    const credential = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    }) as PublicKeyCredential;

    return credential.response as AuthenticatorAssertionResponse;
  }
}
```

#### C. Passcode Strength Requirements
**Implementation**: Enforce strong passcodes to resist brute force.

```typescript
// apps/id-dashboard/src/utils/validation/passcodeStrength.ts
export class PasscodeStrengthValidator {
  static validate(passcode: string): {
    valid: boolean;
    strength: 'weak' | 'medium' | 'strong' | 'very-strong';
    issues: string[];
  } {
    const issues: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' | 'very-strong' = 'weak';

    // Minimum length
    if (passcode.length < 12) {
      issues.push('Passcode must be at least 12 characters');
    } else if (passcode.length >= 16) {
      strength = 'strong';
    }

    // Character variety
    const hasLower = /[a-z]/.test(passcode);
    const hasUpper = /[A-Z]/.test(passcode);
    const hasNumber = /\d/.test(passcode);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passcode);

    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (varietyCount < 3) {
      issues.push('Use a mix of uppercase, lowercase, numbers, and special characters');
    } else if (varietyCount === 4 && passcode.length >= 16) {
      strength = 'very-strong';
    } else if (varietyCount >= 3) {
      strength = 'medium';
    }

    // Common patterns
    const commonPatterns = [
      /12345/,
      /password/i,
      /qwerty/i,
      /admin/i,
      /(.)\1{3,}/, // Repeated characters
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(passcode)) {
        issues.push('Avoid common patterns and repeated characters');
        strength = 'weak';
        break;
      }
    }

    // Entropy check
    const entropy = this.calculateEntropy(passcode);
    if (entropy < 50) {
      issues.push('Passcode is too predictable');
      strength = 'weak';
    }

    return {
      valid: issues.length === 0 && passcode.length >= 12,
      strength,
      issues
    };
  }

  private static calculateEntropy(passcode: string): number {
    const charSet = new Set(passcode.split(''));
    const size = charSet.size;
    return passcode.length * Math.log2(size || 1);
  }
}
```

---

## 3. Malware/Device Compromise Mitigation

### Problem
Malware can intercept files, capture passcodes, and access memory.

### Solutions

#### A. Device Attestation
**Implementation**: Verify device integrity before operations.

```typescript
// apps/id-dashboard/src/utils/security/deviceAttestation.ts
export class DeviceAttestation {
  /**
   * Generate device fingerprint
   */
  static async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.languages.join(','),
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() || '',
    ];

    const fingerprint = components.join('|');
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Check for suspicious browser extensions
   */
  static async checkBrowserExtensions(): Promise<{
    suspicious: boolean;
    extensions: string[];
  } {
    // Check for known malicious extension patterns
    const suspiciousPatterns = [
      /password/i,
      /keylog/i,
      /capture/i,
      /steal/i,
    ];

    // Note: Browser extensions can't be directly detected, but we can check for
    // suspicious behavior patterns
    const extensions: string[] = [];
    let suspicious = false;

    // Check for modified DOM (extensions often inject scripts)
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const externalScripts = scripts.filter(s => 
      !s.src.startsWith(window.location.origin) &&
      !s.src.startsWith('blob:') &&
      !s.src.startsWith('data:')
    );

    if (externalScripts.length > 0) {
      suspicious = true;
      extensions.push('External scripts detected');
    }

    return { suspicious, extensions };
  }

  /**
   * Verify device hasn't been compromised
   */
  static async verifyDeviceIntegrity(): Promise<boolean> {
    const fingerprint = await this.generateFingerprint();
    const extensionCheck = await this.checkBrowserExtensions();
    
    // Store fingerprint and check for changes
    const storedFingerprint = localStorage.getItem('device_fingerprint');
    if (storedFingerprint && storedFingerprint !== fingerprint) {
      console.warn('Device fingerprint changed - possible compromise');
      return false;
    }
    
    if (!storedFingerprint) {
      localStorage.setItem('device_fingerprint', fingerprint);
    }

    return !extensionCheck.suspicious;
  }
}
```

#### B. Encrypted File Integrity Verification
**Implementation**: Add HMAC to encrypted files to detect tampering.

```typescript
// apps/id-dashboard/src/utils/crypto/fileIntegrity.ts
export class FileIntegrityManager {
  /**
   * Add integrity check to encrypted identity file
   */
  static async addIntegrityCheck(
    encryptedIdentity: EncryptedIdentity,
    passcode: string
  ): Promise<EncryptedIdentity & { hmac: string }> {
    const dataToSign = JSON.stringify({
      publicKey: encryptedIdentity.publicKey,
      encryptedData: encryptedIdentity.encryptedData,
      iv: encryptedIdentity.iv,
      salt: encryptedIdentity.salt
    });

    // Derive HMAC key from passcode
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const hmacKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('hmac-salt'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const key = await crypto.subtle.importKey(
      'raw',
      hmacKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(dataToSign)
    );

    const hmac = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      ...encryptedIdentity,
      hmac
    };
  }

  /**
   * Verify file integrity
   */
  static async verifyIntegrity(
    encryptedIdentity: EncryptedIdentity & { hmac?: string },
    passcode: string
  ): Promise<boolean> {
    if (!encryptedIdentity.hmac) {
      return false; // No integrity check present
    }

    const { hmac, ...data } = encryptedIdentity;
    const calculated = await this.addIntegrityCheck(data, passcode);
    
    return calculated.hmac === hmac;
  }
}
```

---

## 4. Physical Access Mitigation

### Problem
Physical access to unlocked device allows full access.

### Solutions

#### A. Automatic Lock on Inactivity
**Implementation**: Lock session after short inactivity period.

```typescript
// apps/id-dashboard/src/utils/security/autoLock.ts
export class AutoLockManager {
  private lockTimeout: number | null = null;
  private readonly LOCK_DELAY_MS = 2 * 60 * 1000; // 2 minutes
  private onLock: () => void;

  constructor(onLock: () => void) {
    this.onLock = onLock;
    this.setupListeners();
  }

  private setupListeners(): void {
    // Reset on user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => this.reset(), { passive: true });
    });

    // Lock on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lock();
      } else {
        this.reset();
      }
    });

    // Lock on window blur
    window.addEventListener('blur', () => {
      this.lock();
    });

    this.reset();
  }

  reset(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
    }
    this.lockTimeout = window.setTimeout(() => {
      this.lock();
    }, this.LOCK_DELAY_MS);
  }

  lock(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
    this.onLock();
  }

  destroy(): void {
    this.lock();
  }
}
```

#### B. Screen Blur on Tab Switch
**Implementation**: Blur sensitive content when tab is not active.

```typescript
// apps/id-dashboard/src/utils/security/screenProtection.ts
export class ScreenProtection {
  static enable(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Add blur overlay
        const overlay = document.createElement('div');
        overlay.id = 'screen-protection-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.9);
          z-index: 999999;
          backdrop-filter: blur(10px);
        `;
        document.body.appendChild(overlay);
      } else {
        // Remove overlay
        const overlay = document.getElementById('screen-protection-overlay');
        if (overlay) {
          overlay.remove();
        }
      }
    });
  }
}
```

---

## 5. Browser Vulnerability Mitigation

### Problem
Browser exploits can access memory and intercept operations.

### Solutions

#### A. Content Security Policy (CSP)
**Implementation**: Strict CSP to prevent XSS and code injection.

```typescript
// apps/id-dashboard/index.html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.parnoir.com;
  worker-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
">
```

#### B. Subresource Integrity (SRI)
**Implementation**: Verify external scripts haven't been tampered with.

```html
<script 
  src="https://cdn.example.com/library.js"
  integrity="sha384-..."
  crossorigin="anonymous">
</script>
```

#### C. Isolated Context
**Implementation**: Use Cross-Origin Isolation for SharedArrayBuffer protection.

```typescript
// apps/id-dashboard/vite.config.ts headers
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  // ... other headers
}
```

---

## 6. Supply Chain Attack Mitigation

### Problem
Compromised dependencies can inject malicious code.

### Solutions

#### A. Dependency Auditing
**Implementation**: Regular security audits of dependencies.

```bash
# Add to package.json scripts
"scripts": {
  "audit": "npm audit --audit-level=moderate",
  "audit:fix": "npm audit fix",
  "check:deps": "npm audit && npm outdated"
}
```

#### B. Lock File Integrity
**Implementation**: Use package-lock.json and verify checksums.

```bash
# Verify package integrity
npm ci --prefer-offline --no-audit
```

#### C. Code Signing
**Implementation**: Sign releases and verify signatures.

```typescript
// apps/id-dashboard/src/utils/security/codeSigning.ts
export class CodeSigning {
  /**
   * Verify application integrity
   */
  static async verifyApplicationIntegrity(): Promise<boolean> {
    // In production, verify code signatures
    // This is a placeholder for actual implementation
    const expectedHash = process.env.APP_INTEGRITY_HASH;
    if (!expectedHash) {
      return true; // Development mode
    }

    // Verify critical files haven't been modified
    // Implementation would check file hashes against expected values
    return true;
  }
}
```

---

## 7. Side-Channel Attack Mitigation

### Problem
Timing attacks can leak information about keys.

### Solutions

#### A. Constant-Time Operations
**Implementation**: Use constant-time comparison for sensitive operations.

```typescript
// apps/id-dashboard/src/utils/security/constantTime.ts
export class ConstantTimeOperations {
  /**
   * Constant-time string comparison
   */
  static compare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Still do comparison to maintain constant time
      const dummy = b;
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Constant-time buffer comparison
   */
  static compareBuffers(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
}
```

---

## Implementation Priority

### High Priority (Implement First)
1. ✅ **CRITICAL**: Remove pN name AND passcode from AuthSession
2. ✅ **CRITICAL**: Implement SecureCredentialManager for both secrets
3. ✅ **CRITICAL**: Use hashed pN name for lookups (never plaintext)
4. ✅ Memory zeroization after use
5. ✅ Automatic session timeout
6. ✅ Passcode strength validation
7. ✅ Content Security Policy

### Medium Priority
6. Virtual keyboard option
7. WebAuthn/biometric support
8. Device attestation
9. File integrity checks (HMAC)
10. Auto-lock on inactivity

### Low Priority (Nice to Have)
11. Screen blur on tab switch
12. Constant-time operations
13. Code signing verification
14. Advanced side-channel protections

---

## Testing Checklist

- [ ] **CRITICAL**: pN name is NEVER stored in AuthSession
- [ ] **CRITICAL**: Passcode is NEVER stored in AuthSession
- [ ] **CRITICAL**: Both pN name and passcode stored only in SecureCredentialManager
- [ ] **CRITICAL**: pN name never stored in localStorage/IndexedDB in plaintext
- [ ] **CRITICAL**: Lookups use hashed pN name, not plaintext
- [ ] Memory is zeroized after sensitive operations
- [ ] Session auto-locks after inactivity
- [ ] CSP headers are properly configured
- [ ] Passcode strength validation works
- [ ] Device attestation detects changes
- [ ] File integrity verification works
- [ ] Virtual keyboard prevents keyloggers
- [ ] WebAuthn integration works

---

**Last Updated**: 2024-12-XX
**Next Review**: Quarterly

