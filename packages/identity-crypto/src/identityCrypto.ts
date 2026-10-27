// Self-contained cryptographic utilities
import { mlDsa65Keygen, mlKem768Keygen, bytesToBase64, deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto';
import {
  splitSecret,
  generateRecoveryMaster,
  encryptRecoveryEnvelope,
  buildRecoveryPayload,
  sealRecoveryShares,
  type RecoveryPayload,
} from '@par-noir/recovery-crypto';
import { SecureCredentialManager } from './secureCredentialManager';
import { MemorySecurity } from './memorySecurity';
import { safePnDisplayName } from './displayName';
import type {
  AuthSession,
  DIDKeyPair,
  EncryptedData,
  EncryptedIdentity,
  IdentityCreationResult,
} from './types';

export type {
  AuthSession,
  DIDKeyPair,
  EncryptedData,
  EncryptedIdentity,
  IdentityCreationResult,
} from './types';

const DEFAULT_PROFILE_PICTURE = '/branding/Par-Noir-Icon-White.png';

export class IdentityCrypto {
  private static readonly DID_PREFIX = 'did:key:';
  private static readonly TOKEN_EXPIRY = 3600; // 1 hour

  /**
   * Generate a DID with ML-DSA-65 + ML-KEM-768 (see docs/security/IDENTITY_PQC_DECISIONS.md).
   */
  static async generateDID(): Promise<DIDKeyPair> {
    try {
      const dsa = mlDsa65Keygen();
      const kem = mlKem768Keygen();
      const publicKey = bytesToBase64(dsa.publicKey);
      const did = this.DID_PREFIX + (await this.generateDIDIdentifier(publicKey));

      return {
        publicKey,
        privateKey: bytesToBase64(dsa.secretKey),
        did,
        mlKemPublicKey: bytesToBase64(kem.publicKey),
        mlKemSecretKey: bytesToBase64(kem.secretKey),
      };
    } catch (error) {
      throw new Error(`Failed to generate DID: ${error}`);
    }
  }

  /**
   * Create a real identity with encrypted storage
   */
  static async createIdentity(
    key1: string,
    nickname: string,
    key2: string,
    recoveryEmail?: string,
    recoveryPhone?: string,
    recoveryThreshold = 2,
    recoveryTotalShares = 5
  ): Promise<IdentityCreationResult> {
    try {
      return await this.sealIdentity({
        keys: await this.generateDID(),
        key1,
        nickname,
        key2,
        recoveryEmail,
        recoveryPhone,
        recoveryThreshold,
        recoveryTotalShares,
      });
    } catch (error) {
      throw new Error(`Failed to create identity: ${error}`);
    }
  }

  /**
   * Re-seal a recovered pN under new Key 1 + Key 2. Keeps the same keys (publicKey, DID, ML-DSA,
   * ML-KEM) and issues a fresh recovery envelope and shares, exactly as createIdentity does.
   */
  static async restoreIdentity(params: {
    payload: RecoveryPayload;
    key1: string;
    key2: string;
    nickname?: string;
  }): Promise<IdentityCreationResult> {
    const { payload } = params;
    try {
      return await this.sealIdentity({
        keys: {
          publicKey: payload.publicKey,
          privateKey: payload.mlDsaSecretKey,
          did: payload.identityId,
          mlKemPublicKey: payload.mlKemPublicKey,
          mlKemSecretKey: payload.mlKemSecretKey,
        },
        key1: params.key1,
        nickname: params.nickname ?? '',
        key2: params.key2,
        recoveryThreshold: payload.recoveryConfig?.threshold ?? 2,
        recoveryTotalShares: payload.recoveryConfig?.totalShares ?? 5,
      });
    } catch (error) {
      throw new Error(`Failed to restore identity: ${error}`);
    }
  }

  private static async sealIdentity(params: {
    keys: DIDKeyPair;
    key1: string;
    nickname: string;
    key2: string;
    recoveryEmail?: string;
    recoveryPhone?: string;
    recoveryThreshold: number;
    recoveryTotalShares: number;
  }): Promise<IdentityCreationResult> {
    const { keys, key1, key2 } = params;
    const recoveryConfig = {
      threshold: params.recoveryThreshold,
      totalShares: params.recoveryTotalShares,
      version: 1 as const,
      createdAt: new Date().toISOString()
    };

    const identityData = {
      id: keys.did,
      key1,
      nickname: params.nickname.trim() === key1.trim() ? '' : params.nickname,
      email: '',
      phone: '',
      recoveryEmail: params.recoveryEmail || '',
      recoveryPhone: params.recoveryPhone || '',
      profilePicture: DEFAULT_PROFILE_PICTURE,
      createdAt: new Date().toISOString(),
      status: 'active',
      custodiansRequired: true,
      custodiansSetup: false,
      recoveryConfig,
      pqcSecrets: {
        mlDsaSecretKey: keys.privateKey,
        mlKemSecretKey: keys.mlKemSecretKey,
      },
    };

    const encryptedData = await this.encrypt(JSON.stringify(identityData), key1, key2);

    const recoveryMaster = generateRecoveryMaster();
    const recoveryPayload = buildRecoveryPayload({
      publicKey: keys.publicKey,
      mlKemPublicKey: keys.mlKemPublicKey,
      mlKemSecretKey: keys.mlKemSecretKey,
      mlDsaSecretKey: keys.privateKey,
      identityId: keys.did,
      recoveryConfig
    });
    const recoveryEnvelope = await encryptRecoveryEnvelope(recoveryMaster, recoveryPayload);
    const recoveryShares = splitSecret(recoveryMaster, params.recoveryThreshold, params.recoveryTotalShares);
    const recoverySharesSealed = await sealRecoveryShares(recoveryShares, key1, key2);

    return {
      identity: {
        publicKey: keys.publicKey,
        mlKemPublicKey: keys.mlKemPublicKey,
        encryptedData: encryptedData.encrypted,
        iv: encryptedData.iv,
        salt: encryptedData.salt,
        recoveryEnvelope,
        recoverySharesSealed,
      },
      recoveryShares,
      recoveryConfig
    };
  }

  /**
   * Generate a new cryptographic identity for re-key migration.
   * Copies profile fields from decrypted predecessor JSON; new keys and recovery envelope.
   */
  static async prepareRotatedIdentity(params: {
    key1: string;
    newKey2: string;
    predecessorDecrypted: {
      nickname?: string;
      recoveryEmail?: string;
      recoveryPhone?: string;
      recoveryConfig?: { threshold: number; totalShares: number };
    };
  }): Promise<IdentityCreationResult> {
    const cfg = params.predecessorDecrypted.recoveryConfig;
    return this.createIdentity(
      params.key1,
      params.predecessorDecrypted.nickname ?? '',
      params.newKey2,
      params.predecessorDecrypted.recoveryEmail,
      params.predecessorDecrypted.recoveryPhone,
      cfg?.threshold ?? 2,
      cfg?.totalShares ?? 5
    );
  }

  /** @deprecated Use createIdentity return value; kept for callers expecting EncryptedIdentity only. */
  static async createIdentityLegacy(
    key1: string,
    nickname: string,
    key2: string,
    recoveryEmail?: string,
    recoveryPhone?: string
  ): Promise<EncryptedIdentity> {
    const { identity } = await this.createIdentity(key1, nickname, key2, recoveryEmail, recoveryPhone);
    return identity;
  }

  /**
   * Authenticate and decrypt identity
   * 
   * SECURITY: Key 1 and Key 2 are SECRETS and are stored in SecureCredentialManager,
   * NOT in the returned AuthSession object.
   */
  static async authenticateIdentity(
    encryptedIdentity: EncryptedIdentity,
    key2: string,
    expectedKey1?: string
  ): Promise<AuthSession> {
    try {
      // Use only the current decryption method - NO LEGACY FALLBACK
      // Legacy fallback was a security vulnerability that allowed wrong credentials to work
      // SECURITY: Decryption requires BOTH Key 1 and Key 2
      // Both are secrets and must be combined for key derivation
      const decryptedData = await this.decrypt(
        {
          encrypted: encryptedIdentity.encryptedData,
          iv: encryptedIdentity.iv,
          salt: encryptedIdentity.salt
        },
        expectedKey1 || '', // Key 1 - SECRET #1 (required for decryption)
        key2                 // Key 2 - SECRET #2 (required for decryption)
      );

      const identity = JSON.parse(decryptedData);
      
      if (expectedKey1 && identity.key1 !== expectedKey1) {
        throw new Error('Authentication failed: Key 1 mismatch');
      }
      
      // Generate JWT-like token
      const token = await this.generateAuthToken(identity.id);
      
      const key1Value: string = identity.key1;

      // SECURITY: Store Key 1 and Key 2 in SecureCredentialManager (memory only, never persisted)
      // These are SECRETS and must NOT be in the AuthSession object
      SecureCredentialManager.setCredentials(
        identity.id,
        key1Value,
        key2,
        15 * 60 * 1000 // 15 minutes TTL
      );

      // Generate auth token hash (for verification purposes)
      const encoder = new TextEncoder();
      const digestData = encoder.encode(`${key1Value}::${encryptedIdentity.publicKey || identity.id}::${key2}`);
      const digestBuffer = await window.crypto.subtle.digest('SHA-256', digestData);
      const authToken = Array.from(new Uint8Array(digestBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      
      // SECURITY: Zeroize Key 2 from local variables (best-effort)
      // Note: JavaScript strings are immutable, but we try to clear references
      const key2Buffer = encoder.encode(key2);
      MemorySecurity.zeroize(key2Buffer);
      
      // Return AuthSession WITHOUT Key 1 or Key 2 (these are SECRETS)
      return {
        id: identity.id, // DID comes from decrypted data
        nickname: safePnDisplayName({
          nickname: identity.nickname,
          key1: key1Value,
          pnIdentifier: encryptedIdentity.publicKey ? deriveCanonicalPnIdentifier(encryptedIdentity.publicKey) : null,
        }),
        accessToken: token,
        expiresIn: this.TOKEN_EXPIRY,
        authenticatedAt: new Date().toISOString(),
        publicKey: encryptedIdentity.publicKey,
        authToken,
        // SECURITY: Key 1 and Key 2 are NOT included - use SecureCredentialManager.getCredentials(id)
      };
    } catch (error) {
      // SECURITY: Zeroize Key 2 on error too
      const encoder = new TextEncoder();
      const key2Buffer = encoder.encode(key2);
      MemorySecurity.zeroize(key2Buffer);
      
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  /**
   * Local AuthSession.accessToken is an opaque session marker, not a verifiable JWT.
   * Server/session mint uses ML-DSA OAuth unlock proofs — do not call this.
   */
  static async verifyAuthToken(_token: string, _expectedDID: string): Promise<boolean> {
    throw new Error(
      'verifyAuthToken is not supported; use OAuth unlock proofs (ML-DSA) for session mint'
    );
  }

  /**
   * Generate secure recovery key
   */
  static async generateRecoveryKey(identityId: string, purpose: string): Promise<string> {
    try {
      const keyData = {
        identityId,
        purpose,
        timestamp: Date.now(),
        random: crypto.getRandomValues(new Uint8Array(32))
      };

      const keyString = JSON.stringify(keyData);
      const encoder = new TextEncoder();
      const data = encoder.encode(keyString);
      
      // Generate SHA-256 hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return `recovery-${hashHex.substring(0, 32)}`;
    } catch (error) {
      throw new Error(`Failed to generate recovery key: ${error}`);
    }
  }

  /**
   * Generate a set of recovery keys
   * Simple implementation to avoid crypto operation errors
   */
  static async generateRecoveryKeySet(_identityId: string, totalKeys: number = 5): Promise<string[]> {
    try {
      const recoveryKeys: string[] = [];
      const purposes = ['personal', 'legal', 'insurance', 'will', 'emergency'];
      
      for (let i = 0; i < totalKeys; i++) {
        // Generate a simple recovery key using random values
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        const keyHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const recoveryKey = `recovery-${purposes[i] || `backup-${i + 1}`}-${keyHex}`;
        recoveryKeys.push(recoveryKey);
      }
      
      return recoveryKeys;
    } catch (error) {
      throw new Error(`Failed to generate recovery key set: ${error}`);
    }
  }



  /**
   * Hash Key 2 for verification
   */
  static async hashKey2(key2: string, salt: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const key2Buffer = encoder.encode(key2);
      const saltBuffer = encoder.encode(salt);

      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        key2Buffer,
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: 100000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );

      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      throw new Error(`Failed to hash Key 2: ${error}`);
    }
  }

  /**
   * Verify Key 2 against stored hash
   */
  static async verifyKey2(key2: string, storedHash: string, salt: string): Promise<boolean> {
    try {
      const computedHash = await this.hashKey2(key2, salt);
      return computedHash === storedHash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Public encrypt method for external use
   * SECURITY: Requires both Key 1 and Key 2
   */
  static async encryptData(data: string, key1: string, key2: string): Promise<EncryptedData> {
    return await this.encrypt(data, key1, key2);
  }

  /**
   * Public decrypt method for external use
   * SECURITY: Requires both Key 1 and Key 2
   */
  static async decryptData(encryptedData: EncryptedData, key1: string, key2: string): Promise<string> {
    return await this.decrypt(encryptedData, key1, key2);
  }

  /**
   * Encrypt data with physical key binding (UID).
   * Key derivation includes uid: key1:key2:uid
   * Used for USB (generated UID) or NFC (card UID) binding.
   */
  static async encryptDataWithBinding(
    data: string,
    key1: string,
    key2: string,
    uid: string
  ): Promise<EncryptedData> {
    return await this.encryptWithBinding(data, key1, key2, uid);
  }

  /**
   * Decrypt data with physical key binding (UID).
   * Requires the same UID that was used during encryption.
   */
  static async decryptDataWithBinding(
    encryptedData: EncryptedData,
    key1: string,
    key2: string,
    uid: string
  ): Promise<string> {
    return await this.decryptWithBinding(encryptedData, key1, key2, uid);
  }

  /**
   * Build AuthSession from decrypted identity (used after decryptDataWithBinding).
   * Verifies Key 1, sets credentials in SecureCredentialManager.
   */
  static async buildAuthSessionFromDecrypted(
    identity: { id: string; key1: string; nickname?: string; [key: string]: unknown },
    publicKey: string,
    key1: string,
    key2: string
  ): Promise<AuthSession> {
    if (identity.key1 !== key1) {
      throw new Error('Authentication failed: Key 1 mismatch');
    }

    const key1Value = identity.key1;
    SecureCredentialManager.setCredentials(identity.id, key1Value, key2, 15 * 60 * 1000);

    const token = await this.generateAuthToken(identity.id);
    const encoder = new TextEncoder();
    const digestData = encoder.encode(`${key1Value}::${publicKey}::${key2}`);
    const digestBuffer = await window.crypto.subtle.digest('SHA-256', digestData);
    const authToken = Array.from(new Uint8Array(digestBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const key2Buffer = encoder.encode(key2);
    MemorySecurity.zeroize(key2Buffer);

    return {
      id: identity.id,
      nickname: safePnDisplayName({
        nickname: identity.nickname,
        key1: key1Value,
        pnIdentifier: publicKey ? deriveCanonicalPnIdentifier(publicKey) : null,
      }),
      accessToken: token,
      expiresIn: this.TOKEN_EXPIRY,
      authenticatedAt: new Date().toISOString(),
      publicKey,
      authToken,
    };
  }

  /**
   * Opaque local session marker for AuthSession.accessToken (not a signed JWT).
   * Real API sessions are minted via ML-DSA OAuth unlock proofs.
   */
  private static async generateAuthToken(did: string): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const id = this.arrayBufferToBase64(bytes.buffer);
    return `pn-session.${did}.${id}`;
  }

  /**
   * Encrypt data with physical key binding (UID).
   */
  private static async encryptWithBinding(
    data: string,
    key1: string,
    key2: string,
    uid: string
  ): Promise<EncryptedData> {
    try {
      const salt = this.generateSalt();
      const key = await this.deriveKey(key1, key2, salt, uid);
      const iv = this.generateIV();

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );

      return {
        encrypted: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv),
        salt
      };
    } catch (error) {
      throw new Error(`Failed to encrypt data with binding: ${error}`);
    }
  }

  /**
   * Decrypt data with physical key binding (UID).
   */
  private static async decryptWithBinding(
    encryptedData: EncryptedData,
    key1: string,
    key2: string,
    uid: string
  ): Promise<string> {
    try {
      const key = await this.deriveKey(key1, key2, encryptedData.salt, uid);

      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const data = this.base64ToArrayBuffer(encryptedData.encrypted);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error(`Failed to decrypt data with binding: ${error}`);
    }
  }

  /**
   * Encrypt data with Key 1 and Key 2
   * SECURITY: Both Key 1 and Key 2 are SECRETS and are required for encryption/decryption
   * 
   * @param data - Data to encrypt
   * @param key1 - Key 1 (SECRET #1)
   * @param key2 - Key 2 (SECRET #2)
   */
  private static async encrypt(data: string, key1: string, key2: string): Promise<EncryptedData> {
    try {
      const salt = this.generateSalt();
      // SECURITY: Combine both secrets for key derivation
      const key = await this.deriveKey(key1, key2, salt);
      const iv = this.generateIV();
      
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBuffer
      );
      
      return {
        encrypted: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv),
        salt
      };
    } catch (error) {
      throw new Error(`Failed to encrypt data: ${error}`);
    }
  }

  /**
   * Decrypt data with Key 1 and Key 2
   * SECURITY: Both Key 1 and Key 2 are SECRETS and are required for decryption
   * 
   * @param encryptedData - Encrypted data to decrypt
   * @param key1 - Key 1 (SECRET #1)
   * @param key2 - Key 2 (SECRET #2)
   */
  private static async decrypt(encryptedData: EncryptedData, key1: string, key2: string): Promise<string> {
    try {
      // SECURITY: Combine both secrets for key derivation
      const key = await this.deriveKey(key1, key2, encryptedData.salt);
      
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const data = this.base64ToArrayBuffer(encryptedData.encrypted);
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error(`Failed to decrypt data: ${error}`);
    }
  }

  /**
   * Derive encryption key from Key 1 and Key 2 (and optional UID for physical key binding)
   * SECURITY: Both Key 1 and Key 2 are SECRETS and must be combined for key derivation
   * 
   * @param key1 - Key 1 (SECRET #1)
   * @param key2 - Key 2 (SECRET #2)
   * @param salt - Salt for key derivation
   * @param uid - Optional UID for physical key binding (USB or NFC card UID)
   */
  private static async deriveKey(
    key1: string,
    key2: string,
    salt: string,
    uid?: string
  ): Promise<CryptoKey> {
    try {
      // SECURITY: Combine both secrets for key derivation
      // Format: "key1:key2" or "key1:key2:uid" when binding
      const keyMaterial = uid ? `${key1}:${key2}:${uid}` : `${key1}:${key2}`;
      
      const encoder = new TextEncoder();
      const keyMaterialBuffer = encoder.encode(keyMaterial);
      const saltBuffer = this.base64ToArrayBuffer(salt);

      const keyMaterialKey = await window.crypto.subtle.importKey(
        'raw',
        keyMaterialBuffer,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const derivedKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: 1000000, // Military-grade: 1M iterations
          hash: 'SHA-512', // Military-grade: SHA-512
        },
        keyMaterialKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      return derivedKey;
    } catch (error) {
      throw new Error(`Failed to derive encryption key: ${error}`);
    }
  }

  /**
   * Generate salt for encryption
   */
  private static generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return this.arrayBufferToBase64(salt);
  }

  /**
   * Generate IV for encryption
   */
  private static generateIV(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12));
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      throw new Error(`Failed to convert base64 to ArrayBuffer: ${error}`);
    }
  }

  /**
   * Generate DID identifier from public key with cryptographic fallback
   */
  private static async generateDIDIdentifier(publicKey: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyBuffer = encoder.encode(publicKey);
      
      // Generate a deterministic identifier from the public key
      const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch (error) {
      // Cryptographic fallback using crypto.getRandomValues()
      const randomBytes = crypto.getRandomValues(new Uint8Array(8));
      return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  /**
   * @deprecated Removed mock path. Use authenticateIdentity / decryptData with the encrypted blob.
   */
  static async decryptIdentity(_publicKey: string, _key2: string): Promise<never> {
    throw new Error(
      'decryptIdentity is not supported; use authenticateIdentity or decryptData with the encrypted identity blob'
    );
  }
} 