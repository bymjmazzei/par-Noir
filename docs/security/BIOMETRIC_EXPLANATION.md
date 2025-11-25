# How Biometric Authentication Works (Corrected)

## 🔐 **Critical Correction**: Decryption Requires BOTH pnName AND Passcode

**Important**: The pN file encryption/decryption requires **BOTH** `pnName` and `passcode` as secrets. Both are used together in the key derivation process.

---

## 🔑 **Encryption/Decryption Architecture**

### **Key Derivation Process**

The encryption key is derived from **BOTH** secrets:

```
Key Material = Combine(pnName, passcode)
Encryption Key = PBKDF2(Key Material, Salt, 1,000,000 iterations, SHA-512)
```

**Both `pnName` and `passcode` are SECRETS** and must be:
- ✅ Stored together in `SecureCredentialManager`
- ✅ Never exposed in `AuthSession` or other persistent objects
- ✅ Zeroized from memory after use
- ✅ Required together for decryption

---

## 🔄 **How Biometric Authentication Works**

### **Overview**

Biometric authentication uses the **WebAuthn API** (FIDO2 standard) to provide passwordless authentication. However, **biometric authentication alone is NOT sufficient** - it only proves device ownership. **Both pnName and passcode are still required** to decrypt the encrypted identity data.

---

## 📋 **Complete Flow**

### **1. Registration (Setup)**

When a user sets up biometric authentication:

```typescript
BiometricAuth.registerCredential(identityId, pnName)
```

**What Happens**:
1. **Check Availability**: Verifies WebAuthn and platform authenticator are available
2. **Generate Challenge**: Creates 32-byte random challenge
3. **Create Credential Options**:
   - Relying Party: "Identity Protocol" + domain
   - User Info: `identityId` (encoded) and `pnName`
   - Algorithms: ES256 (ECDSA) or RS256 (RSA)
   - Authenticator: Platform (built-in), user verification required
   - Resident Key: `true` (stored on device)
4. **Browser Prompt**: Device shows biometric prompt (fingerprint/face)
5. **Key Generation**: Device generates cryptographic key pair
   - **Private Key**: Stored securely in device's Secure Enclave/TPM (never exposed)
   - **Public Key**: Returned to application
6. **Store Metadata**: Application stores credential metadata (NOT the private key):
   ```typescript
   {
     id: "biometric_1234567890",
     identityId: "did:key:...",
     credentialId: "hex-encoded-credential-id",
     publicKey: "hex-encoded-public-key",
     deviceName: "iPhone",
     createdAt: "2024-12-XX",
     authenticatorType: "platform"
   }
   ```

**Critical**: The private key **never leaves the device**. Only metadata is stored.

---

### **2. Authentication (Login)**

When a user authenticates with biometrics:

```typescript
BiometricAuth.authenticate(identityId)
```

**What Happens**:

1. **Retrieve Credentials**: Loads stored credential metadata for `identityId`
2. **Generate Challenge**: Creates 32-byte random challenge
3. **Request Authentication**: 
   - Browser prompts for biometric (Touch ID/Face ID/etc.)
   - Device signs challenge with private key
   - Returns signed assertion
4. **Verify Assertion**: Validates signature using stored public key
5. **Success**: Biometric authentication succeeds ✅

**BUT**: This only proves **device ownership**. The identity is still **encrypted**!

---

### **3. Identity Decryption (Requires BOTH Secrets)**

After biometric authentication succeeds:

```typescript
// Get encrypted identity
const encryptedIdentity = await getIdentity(identityId);

// Decrypt requires BOTH pnName AND passcode
const decryptedData = await decrypt(
  encryptedIdentity,
  pnName,    // SECRET #1
  passcode   // SECRET #2
);
```

**Key Derivation**:
```typescript
// Combine both secrets
const keyMaterial = `${pnName}:${passcode}`;

// Derive encryption key using PBKDF2
const encryptionKey = PBKDF2(
  keyMaterial,           // Combined pnName:passcode
  salt,                  // From encrypted identity
  1,000,000 iterations,  // Military-grade
  SHA-512                // Military-grade hash
);

// Decrypt using AES-256-GCM
const decryptedData = AES_GCM_Decrypt(
  encryptedData,
  encryptionKey,
  iv
);
```

**Critical**: Both `pnName` and `passcode` are required for key derivation!

---

## 🔐 **Security Architecture**

### **Two-Layer Security**

```
┌─────────────────────────────────────┐
│  Layer 1: Biometric Authentication │
│  (WebAuthn / Platform Authenticator)│ ← Proves device ownership
│  - Touch ID / Face ID / Fingerprint │
│  - Windows Hello                    │
│  - Device-specific                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 2: Identity Decryption        │
│  (Requires BOTH pnName + passcode)  │ ← Decrypts encrypted identity
│  - pnName: SECRET                    │
│  - passcode: SECRET                  │
│  - Combined for key derivation       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Key Derivation                      │
│  PBKDF2(pnName:passcode, salt, ...) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  AES-256-GCM Decryption              │
│  Decrypt(encryptedData, key, iv)    │
└─────────────────────────────────────┘
```

---

## 🔄 **Complete Authentication Flow**

### **Step-by-Step**

1. **User Initiates**: Clicks "Unlock with Biometric"
2. **Biometric Auth**: 
   - Browser prompts: "Use Touch ID?"
   - User authenticates
   - Device signs challenge
   - ✅ **Biometric succeeds** (proves device ownership)
3. **Passcode Prompt**: 
   - System shows `BiometricPasscodeModal`
   - User must enter **passcode**
   - System already knows **pnName** (from identity selection)
4. **Key Derivation**:
   - Combine: `${pnName}:${passcode}`
   - Derive key: `PBKDF2(combined, salt, 1M iterations, SHA-512)`
5. **Decryption**:
   - Decrypt encrypted identity using derived key
   - Verify decrypted data is valid JSON
   - Verify decrypted `username` matches `pnName`
6. **Credential Storage**:
   - Store `pnName` and `passcode` in `SecureCredentialManager` (memory only)
   - Create `AuthSession` (without secrets)
   - User is authenticated ✅

---

## 🔑 **Why Both Are Required**

### **pnName + passcode = Two-Factor Authentication**

1. **pnName**: 
   - Identifies which identity to decrypt
   - Part of key derivation material
   - Must match decrypted username

2. **passcode**: 
   - Part of key derivation material
   - Required for PBKDF2 key derivation
   - Cannot decrypt without it

3. **Together**: 
   - Both are combined: `${pnName}:${passcode}`
   - Used as key material for PBKDF2
   - Neither alone can decrypt the identity

---

## 📦 **Storage Architecture**

### **What's Stored Where**

1. **WebAuthn Credentials** (Browser/OS):
   - **Location**: Device Secure Enclave/TPM
   - **Content**: Private key (never exposed)
   - **Access**: Browser/OS only

2. **Credential Metadata** (App):
   - **Location**: localStorage (to be migrated to IndexedDB)
   - **Content**: `credentialId`, `publicKey`, `deviceName`
   - **Purpose**: Identify which credentials exist

3. **Encrypted Identity** (App):
   - **Location**: SimpleStorage or IndexedDB
   - **Content**: Encrypted identity data
   - **Encryption**: AES-256-GCM with key derived from `pnName:passcode`

4. **Session Credentials** (Memory Only):
   - **Location**: `SecureCredentialManager` (in-memory Map)
   - **Content**: `pnName` and `passcode` (temporary)
   - **Expiry**: 15 minutes (auto-clears)
   - **Zeroization**: Cleared from memory on expiration/logout

---

## ⚠️ **Current Implementation Issue**

### **Problem**

The current `decrypt()` function in `crypto.ts` only takes `passcode`:

```typescript
private static async decrypt(encryptedData: EncryptedData, passcode: string)
```

**But it SHOULD take both**:
```typescript
private static async decrypt(
  encryptedData: EncryptedData, 
  pnName: string,      // SECRET #1
  passcode: string     // SECRET #2
)
```

### **Key Derivation Should Be**:
```typescript
private static async deriveKey(
  pnName: string, 
  passcode: string, 
  salt: string
): Promise<CryptoKey> {
  // Combine both secrets
  const keyMaterial = `${pnName}:${passcode}`;
  
  // Derive key from combined material
  const encoder = new TextEncoder();
  const keyMaterialBuffer = encoder.encode(keyMaterial);
  // ... PBKDF2 derivation
}
```

---

## ✅ **Correct Flow**

### **Biometric Authentication**

1. ✅ Biometric proves device ownership
2. ✅ System knows `pnName` (from identity selection)
3. ✅ User enters `passcode` (via modal)
4. ✅ **Both `pnName` and `passcode` are combined** for key derivation
5. ✅ Identity is decrypted using derived key
6. ✅ Credentials stored in `SecureCredentialManager`
7. ✅ User authenticated

### **Why Biometric Still Helps**

- ✅ **Convenience**: Skips typing `pnName` (system already knows it)
- ✅ **Security**: Proves device ownership before passcode entry
- ✅ **UX**: Faster authentication flow
- ✅ **Defense in Depth**: Biometric + passcode = two factors

---

## 🔒 **Security Properties**

### **What Biometric Provides**
- ✅ Device ownership proof
- ✅ Convenience (no typing pnName)
- ✅ Strong authentication (hard to spoof)

### **What Biometric Doesn't Provide**
- ❌ Identity decryption (still needs both secrets)
- ❌ Cross-device access (device-specific)
- ❌ Recovery mechanism (if device lost)

### **What Both Secrets Provide**
- ✅ Identity decryption (requires both)
- ✅ Key derivation (requires both)
- ✅ Two-factor security (both must be correct)

---

## 📝 **Summary**

**Biometric Authentication**:
- Uses WebAuthn API for device-based authentication
- Proves device ownership via biometric
- **Does NOT replace the need for pnName + passcode**
- **Both secrets are still required** for decryption

**Decryption Process**:
- Requires **BOTH** `pnName` and `passcode`
- Key derivation combines: `${pnName}:${passcode}`
- PBKDF2 with 1,000,000 iterations, SHA-512
- AES-256-GCM decryption

**Security**:
- Biometric = device ownership proof
- pnName + passcode = decryption keys
- Both layers required for complete authentication

---

**Last Updated**: 2024-12-XX
**Status**: ✅ **CORRECTED** - Both secrets required for decryption

