export interface DIDKeyPair {
    publicKey: string;
    privateKey: string;
    did: string;
}
export interface EncryptedData {
    encrypted: string;
    iv: string;
    salt: string;
}
export interface EncryptedIdentity {
    publicKey: string;
    encryptedData: string;
    iv: string;
    salt: string;
}
export interface AuthSession {
    id: string;
    pnName: string;
    nickname: string;
    accessToken: string;
    expiresIn: number;
    authenticatedAt: string;
    publicKey: string;
}
export declare class IdentityCrypto {
    private static readonly DID_PREFIX;
    private static readonly TOKEN_EXPIRY;
    /**
     * Generate a real DID with Ed25519 key pair
     */
    static generateDID(): Promise<DIDKeyPair>;
    /**
     * Generate a new key pair for DID
     */
    private static generateKeyPair;
    /**
     * Create a real identity with encrypted storage
     */
    static createIdentity(username: string, nickname: string, passcode: string, recoveryEmail?: string, recoveryPhone?: string): Promise<EncryptedIdentity>;
    /**
     * Authenticate and decrypt identity
     */
    static authenticateIdentity(encryptedIdentity: EncryptedIdentity, passcode: string, expectedUsername?: string): Promise<AuthSession>;
    /**
     * Verify authentication token
     */
    static verifyAuthToken(token: string, expectedDID: string): Promise<boolean>;
    /**
     * Generate secure recovery key
     */
    static generateRecoveryKey(identityId: string, purpose: string): Promise<string>;
    /**
     * Generate a set of recovery keys
     * Simple implementation to avoid crypto operation errors
     */
    static generateRecoveryKeySet(_identityId: string, totalKeys?: number): Promise<string[]>;
    /**
     * Hash passcode for verification
     */
    static hashPasscode(passcode: string, salt: string): Promise<string>;
    /**
     * Verify passcode against stored hash
     */
    static verifyPasscode(passcode: string, storedHash: string, salt: string): Promise<boolean>;
    /**
     * Public encrypt method for external use
     */
    static encryptData(data: string, passcode: string): Promise<EncryptedData>;
    /**
     * Public decrypt method for external use
     */
    static decryptData(encryptedData: EncryptedData, passcode: string): Promise<string>;
    /**
     * Generate authentication token
     */
    private static generateAuthToken;
    /**
     * Encrypt data with passcode
     */
    private static encrypt;
    /**
     * DEPRECATED: Legacy decryption method - SECURITY VULNERABILITY
     * This function tries multiple parameter combinations and can allow wrong credentials to work.
     * DO NOT USE - This was a security flaw that bypassed proper credential validation.
     *
     * @deprecated This method is dangerous and should not be used
     */
    private static legacyDecrypt;
    /**
     * Decrypt data with passcode
     */
    private static decrypt;
    /**
     * Derive encryption key from passcode
     */
    private static deriveKey;
    /**
     * Generate signature for token
     */
    private static generateSignature;
    /**
     * Generate salt for encryption
     */
    private static generateSalt;
    /**
     * Generate IV for encryption
     */
    private static generateIV;
    /**
     * Convert ArrayBuffer to Base64
     */
    private static arrayBufferToBase64;
    /**
     * Convert Base64 to ArrayBuffer
     */
    private static base64ToArrayBuffer;
    /**
     * Generate DID identifier from public key with cryptographic fallback
     */
    private static generateDIDIdentifier;
    /**
     * Decrypt an identity to get its data
     */
    static decryptIdentity(_publicKey: string, _passcode: string): Promise<unknown>;
}
