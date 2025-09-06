import { cryptoWorkerManager } from './cryptoWorkerManager';
import { IdentityData, EncryptedIdentity, AuthenticationResult } from '../../types/crypto';
import { DIDManager } from './didManager';
import { RecoveryKeyManager } from './recoveryKeyManager';
import { EncryptionManager } from './encryptionManager';
import { TokenManager } from './tokenManager';

export class IdentityManager {
    /**
     * Create a real identity with encrypted storage
     */
    static async createIdentity(
        username: string, 
        nickname: string, 
        passcode: string, 
        recoveryEmail: string, 
        recoveryPhone: string
    ): Promise<EncryptedIdentity> {
        try {
            // Generate DID and key pair
            const didKeyPair = await DIDManager.generateDID();
            
            // Generate 5 recovery keys using Shamir's Secret Sharing
            // These are STATIC and encrypted in the ID file
            const recoveryKeys = await RecoveryKeyManager.generateRecoveryKeySet(didKeyPair.did, 5);
            
            // Create identity data (ALL data goes in encrypted data including DID and recovery keys)
            const identityData: IdentityData = {
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
            const encryptedData = await EncryptionManager.encrypt(JSON.stringify(identityData), passcode);
            
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
        expectedUsername: string
    ): Promise<AuthenticationResult> {
        try {
            // Use only the current decryption method - NO LEGACY FALLBACK
            // Legacy fallback was a security vulnerability that allowed wrong credentials to work
            const decryptedData = await EncryptionManager.decrypt({
                encrypted: encryptedIdentity.encryptedData,
                iv: encryptedIdentity.iv,
                salt: encryptedIdentity.salt
            }, passcode);
            
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
                expiresIn: TokenManager.getTokenExpiry(),
                authenticatedAt: new Date().toISOString(),
                publicKey: encryptedIdentity.publicKey
            };
        } catch (error) {
            throw new Error(`Authentication failed: ${error}`);
        }
    }

    /**
     * Decrypt an identity to get its data
     */
    static async decryptIdentity(_publicKey: string, _passcode: string): Promise<Partial<IdentityData>> {
        try {
            // This is a simplified implementation
            // In a real implementation, you would:
            // 1. Find the encrypted identity by public key
            // 2. Decrypt the encryptedData using the passcode
            // 3. Return the decrypted identity data
            // Production implementation required
            return {
                id: 'production-did',
                username: 'production-user',
                nickname: 'Production User',
                _publicKey
            } as any;
        } catch (error) {
            throw new Error(`Failed to decrypt identity: ${error}`);
        }
    }
}
