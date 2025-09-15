import { cryptoWorkerManager } from './cryptoWorkerManager';
// Main IdentityCrypto Class - Maintains backward compatibility while using modular components
import { DIDResult, EncryptedIdentity, AuthenticationResult, EncryptedData } from '../../types/crypto';
import { DIDManager } from './didManager';
import { RecoveryKeyManager } from './recoveryKeyManager';
import { PasscodeManager } from './passcodeManager';
import { EncryptionManager } from './encryptionManager';
import { TokenManager } from './tokenManager';
import { IdentityManager } from './identityManager';

export class IdentityCrypto {
    static readonly DID_PREFIX = 'did:key:';
    static readonly TOKEN_EXPIRY = 3600; // 1 hour

    /**
     * Generate a real DID with Ed25519 key pair
     */
    static async generateDID(): Promise<DIDResult> {
        return DIDManager.generateDID();
    }

    /**
     * Generate a new key pair for DID
     */
    static async generateKeyPair() {
        return DIDManager.generateKeyPair();
    }

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
        return IdentityManager.createIdentity(username, nickname, passcode, recoveryEmail, recoveryPhone);
    }

    /**
     * Authenticate and decrypt identity
     */
    static async authenticateIdentity(
        encryptedIdentity: EncryptedIdentity, 
        passcode: string, 
        expectedUsername: string
    ): Promise<AuthenticationResult> {
        return IdentityManager.authenticateIdentity(encryptedIdentity, passcode, expectedUsername);
    }

    /**
     * Verify authentication token
     */
    static async verifyAuthToken(token: string, expectedDID: string): Promise<boolean> {
        return TokenManager.verifyAuthToken(token, expectedDID);
    }

    /**
     * Generate secure recovery key
     */
    static async generateRecoveryKey(identityId: string, purpose: string): Promise<string> {
        return RecoveryKeyManager.generateRecoveryKey(identityId, purpose);
    }

    /**
     * Generate a set of recovery keys
     */
    static async generateRecoveryKeySet(identityId: string, totalKeys: number = 5): Promise<string[]> {
        return RecoveryKeyManager.generateRecoveryKeySet(identityId, totalKeys);
    }

    /**
     * Hash passcode for verification
     */
    static async hashPasscode(passcode: string, salt: string): Promise<string> {
        return PasscodeManager.hashPasscode(passcode, salt);
    }

    /**
     * Verify passcode against stored hash
     */
    static async verifyPasscode(passcode: string, storedHash: string, salt: string): Promise<boolean> {
        return PasscodeManager.verifyPasscode(passcode, storedHash, salt);
    }

    /**
     * Public encrypt method for external use
     */
    static async encryptData(data: string, passcode: string): Promise<EncryptedData> {
        return EncryptionManager.encrypt(data, passcode);
    }

    /**
     * Public decrypt method for external use
     */
    static async decryptData(encryptedData: EncryptedData, passcode: string): Promise<string> {
        return EncryptionManager.decrypt(encryptedData, passcode);
    }

    /**
     * Generate authentication token
     */
    static async generateAuthToken(did: string, username: string): Promise<string> {
        return TokenManager.generateAuthToken(did, username);
    }

    /**
     * Encrypt data with passcode
     */
    static async encrypt(data: string, passcode: string): Promise<EncryptedData> {
        return EncryptionManager.encrypt(data, passcode);
    }

    /**
     * DEPRECATED: Legacy decryption method - SECURITY VULNERABILITY
     */
    static async legacyDecrypt(encryptedData: EncryptedData, passcode: string): Promise<string> {
        return EncryptionManager.legacyDecrypt(encryptedData, passcode);
    }

    /**
     * Decrypt data with passcode
     */
    static async decrypt(encryptedData: EncryptedData, passcode: string): Promise<string> {
        return EncryptionManager.decrypt(encryptedData, passcode);
    }

    /**
     * Generate signature for token
     */
    static async generateSignature(data: string): Promise<string> {
        // This method is now handled internally by TokenManager
        // Keeping for backward compatibility
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await cryptoWorkerManager.hash('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    }

    /**
     * Generate salt for encryption
     */
    static async generateSalt(): Promise<string> {
        const salt = await cryptoWorkerManager.generateRandom(new Uint8Array(16));
        return this.arrayBufferToBase64(salt);
    }

    /**
     * Generate IV for encryption
     */
    static async generateIV(): Promise<Uint8Array> {
        return await cryptoWorkerManager.generateRandom(new Uint8Array(12));
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    static arrayBufferToBase64(buffer: ArrayBuffer): string {
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
    static base64ToArrayBuffer(base64: string): ArrayBuffer {
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
    static async generateDIDIdentifier(publicKey: string): Promise<string> {
        return DIDManager.generateDIDIdentifier(publicKey);
    }

    /**
     * Decrypt an identity to get its data
     */
    static async decryptIdentity(publicKey: string, passcode: string) {
        return IdentityManager.decryptIdentity(publicKey, passcode);
    }
}
