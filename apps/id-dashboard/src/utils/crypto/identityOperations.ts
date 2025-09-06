import { cryptoWorkerManager } from './cryptoWorkerManager';
// Core Identity Operations
import { DIDKeyPair, EncryptedIdentity, AuthSession } from '../../types/crypto';
import { KeyGenerator } from './keyGenerator';
import { RecoveryKeyManager } from './recoveryKeyManager';
import { EncryptionManager } from './encryptionManager';
import { TokenManager } from './tokenManager';

export class IdentityOperations {
  private static readonly DID_PREFIX = 'did:key:';
  private static readonly TOKEN_EXPIRY = 3600; // 1 hour

  /**
   * Generate a real DID with Ed25519 key pair
   */
  static async generateDID(): Promise<DIDKeyPair> {
    try {
      const keyPair = await KeyGenerator.generateKeyPair();
      const did = this.DID_PREFIX + await KeyGenerator.generateDIDIdentifier(keyPair.publicKey);
      
      return {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        did
      };
    } catch (error) {
      throw new Error(`Failed to generate DID: ${error}`);
    }
  }

  /**
   * Create a real identity with encrypted storage
   */
  static async createIdentity(
    username: string,
    nickname: string,
    passcode: string,
    recoveryEmail?: string,
    recoveryPhone?: string
  ): Promise<EncryptedIdentity> {
    try {
      // Generate DID and key pair
      const didKeyPair = await this.generateDID();
      
      // Generate 5 recovery keys using Shamir's Secret Sharing
      // These are STATIC and encrypted in the ID file
      const recoveryKeys = await RecoveryKeyManager.generateRecoveryKeySet(didKeyPair.did, 5);
      
      // Create identity data (ALL data goes in encrypted data including DID and recovery keys)
      const identityData = {
        id: didKeyPair.did, // DID is now encrypted too
        username,
        nickname,
        email: '',
        phone: '',
        recoveryEmail: recoveryEmail || '',
        recoveryPhone: recoveryPhone || '',
        profilePicture: '/branding/Par-Noir-Icon-White.png',
        createdAt: new Date().toISOString(),
        status: 'active',
        custodiansRequired: true,
        custodiansSetup: false,
        recoveryKeys: recoveryKeys // Recovery keys are encrypted and stored in ID file
      };

      // Encrypt ALL sensitive identity data including DID and recovery keys
      const encryptedData = await EncryptionManager.encrypt(
        JSON.stringify(identityData),
        passcode
      );

      return {
        publicKey: didKeyPair.publicKey, // Only public key is in plain text
        encryptedData: encryptedData.encrypted,
        iv: encryptedData.iv,
        salt: encryptedData.salt
      };
    } catch (error) {
      throw new Error(`Failed to create identity: ${error}`);
    }
  }

  /**
   * Authenticate and decrypt identity
   */
  static async authenticateIdentity(
    encryptedIdentity: EncryptedIdentity,
    passcode: string,
    expectedUsername?: string
  ): Promise<AuthSession> {
    try {
      // Use only the current decryption method - NO LEGACY FALLBACK
      // Legacy fallback was a security vulnerability that allowed wrong credentials to work
      const decryptedData = await EncryptionManager.decrypt(
        {
          encrypted: encryptedIdentity.encryptedData,
          iv: encryptedIdentity.iv,
          salt: encryptedIdentity.salt
        },
        passcode
      );

      const identity = JSON.parse(decryptedData);
      
      // CRITICAL SECURITY FIX: Verify the decrypted username matches the expected username
      if (expectedUsername && identity.username !== expectedUsername) {
        throw new Error('Authentication failed: username mismatch');
      }
      
      // Generate JWT-like token
      const token = await TokenManager.generateAuthToken(identity.id, identity.username);
      
      return {
        id: identity.id, // DID comes from decrypted data
        pnName: identity.pnName,
        nickname: identity.nickname || identity.pnName,
        accessToken: token,
        expiresIn: this.TOKEN_EXPIRY,
        authenticatedAt: new Date().toISOString(),
        publicKey: encryptedIdentity.publicKey
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  /**
   * Verify authentication token
   */
  static async verifyAuthToken(token: string, expectedDID: string): Promise<boolean> {
    try {
      // In a real implementation, this would verify JWT signature
      // For now, we'll do basic validation
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        return false;
      }

      const payload = JSON.parse(atob(tokenParts[1]));
      const now = Math.floor(Date.now() / 1000);
      
      return payload.did === expectedDID && payload.exp > now;
    } catch (error) {
      return false;
    }
  }

  /**
   * Decrypt an identity to get its data
   */
  static async decryptIdentity(
    publicKey: string,
    passcode: string
  ): Promise<unknown> {
    try {
      // Find the encrypted identity by public key
      // Decrypt the encryptedData using the passcode
      // Return the decrypted identity data
      
      // Implementation requires proper identity storage and encryption
      throw new Error('Identity decryption not implemented. Please use the proper identity management system.');
    } catch (error) {
      throw new Error(`Failed to decrypt identity: ${error}`);
    }
  }
}
