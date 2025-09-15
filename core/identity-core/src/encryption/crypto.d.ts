export interface CryptoKeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}
export interface CryptoConfig {
    algorithm: '' | 'ChaCha20-Poly1305' | 'AES-256-CCM';
    keyLength: 256 | 384 | 512;
    hashAlgorithm: 'SHA-384' | 'SHA-512' | 'SHAKE256' | 'Keccak-256';
    ellipticCurve: 'P-384' | 'P-521' | 'BLS12-381';
    quantumResistant: boolean;
    hsmEnabled: boolean;
    keyRotationInterval: number;
    postQuantumEnabled: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export interface EncryptedData {
    data: string;
    iv: string;
    tag: string;
    algorithm: string;
    keyId: string;
    timestamp: string;
    securityLevel: string;
    quantumResistant: boolean;
    hsmProtected: boolean;
}
export interface KeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    keyId: string;
    algorithm: string;
    securityLevel: string;
    createdAt: string;
    expiresAt: string;
    quantumResistant: boolean;
    hsmProtected: boolean;
}
export interface HSMConfig {
    enabled: boolean;
    provider: 'aws-kms' | 'azure-keyvault' | 'gcp-kms' | 'local-hsm';
    region?: string;
    keyId?: string;
    accessKey?: string;
    secretKey?: string;
    vaultName?: string;
}
export declare class MilitaryGradeCrypto {
    static readonly MIN_PASSCODE_LENGTH = 12;
    static readonly MAX_LOGIN_ATTEMPTS = 5;
    static readonly LOCKOUT_DURATION: number;
    static readonly MILITARY_CONFIG: {
        iterations: number;
        memoryCost: number;
        parallelism: number;
    };
    static readonly ALGORITHM = "";
    static readonly KEY_LENGTH = 256;
    private static failedAttempts;
    private config;
    private hsmConfig;
    private keyStore;
    private encryptionCache;
    private securityAuditLog;
    private kmsClient?;
    private azureKeyClient?;
    constructor(config?: Partial<CryptoConfig>, hsmConfig?: Partial<HSMConfig>);
    private initializeSecurity;
    private verifyCryptoCapabilities;
    private initializeHSM;
    private initializeAWSKMS;
    private initializeAzureKeyVault;
    private initializeGCPKMS;
    private initializeLocalHSM;
    private generateInitialKeyPairs;
    private generateEncryptionKey;
    private generateSigningKey;
    private generateKeyExchangeKey;
    private generateKeyId;
    private startKeyRotationTimer;
    private rotateExpiredKeys;
    private rotateKey;
    private migrateEncryptedData;
    private logSecurityEvent;
    static validatePasscode(passcode: string): {
        isValid: boolean;
        errors: string[];
        strength: 'weak' | 'medium' | 'strong' | 'military';
    };
    static isAccountLocked(identifier: string, context?: {
        ipAddress?: string;
        userAgent?: string;
        deviceFingerprint?: string;
    }): boolean;
    static recordFailedAttempt(identifier: string, context?: {
        ipAddress?: string;
        userAgent?: string;
        deviceFingerprint?: string;
    }): void;
    static clearFailedAttempts(identifier: string): void;
    private static zeroizeBuffer;
    private static zeroizeString;
    private static secureCleanup;
    static arrayBufferToBase64(buffer: ArrayBuffer): string;
    static base64ToArrayBuffer(base64: string): ArrayBuffer;
    static hash(data: string): Promise<string>;
    static encrypt(data: string, passcode: string): Promise<{
        data: string;
        iv: string;
        tag: string;
        salt: string;
    }>;
    static decrypt(encryptedData: {
        data: string;
        iv: string;
        tag: string;
        salt: string;
    }, passcode: string): Promise<string>;
    static generateKeyPair(keyType?: 'Ed25519' | 'X25519' | 'P-384' | 'P-521'): Promise<{
        publicKey: string;
        privateKey: string;
        keyType: string;
        keyUsage: string[];
    }>;
    private static generateEd25519KeyPair;
    private static generateX25519KeyPair;
    private static generateP384KeyPair;
    private static generateP521KeyPair;
    static deriveKey(passcode: string, salt: string, algorithm?: 'PBKDF2' | 'Argon2id' | 'Scrypt'): Promise<CryptoKey>;
    private static deriveKeyArgon2id;
    private static deriveKeyScrypt;
    private static deriveKeyPBKDF2;
    encrypt(data: string, options?: {
        algorithm?: string;
        quantumResistant?: boolean;
        hsmProtected?: boolean;
        securityLevel?: string;
    }): Promise<EncryptedData>;
    decrypt(encryptedData: EncryptedData): Promise<string>;
    sign(data: string, options?: {
        algorithm?: string;
        quantumResistant?: boolean;
        hsmProtected?: boolean;
    }): Promise<{
        signature: string;
        publicKey: string;
        algorithm: string;
    }>;
    verify(data: string, signature: string, publicKey: string, algorithm: string): Promise<boolean>;
    private hashData;
    private getEncryptionKey;
    private getDecryptionKey;
    private getSigningKey;
    private generateDataId;
    getSecurityAuditLog(): Array<{
        timestamp: string;
        event: string;
        details: any;
        riskLevel: string;
    }>;
    getKeyStoreInfo(): {
        totalKeys: number;
        encryptionKeys: number;
        signingKeys: number;
        keyExchangeKeys: number;
        expiredKeys: number;
        quantumResistantKeys: number;
        hsmProtectedKeys: number;
    };
    getSecurityComplianceReport(): {
        overallCompliance: boolean;
        issues: string[];
        recommendations: string[];
        lastAudit: string;
        quantumResistantStatus: string;
        hsmStatus: string;
    };
    getQuantumResistanceStatus(): {
        enabled: boolean;
        algorithms: string[];
        coverage: number;
        recommendations: string[];
    };
    getHSMStatus(): {
        enabled: boolean;
        provider: string;
        status: string;
        recommendations: string[];
    };
}
export { MilitaryGradeCrypto as CryptoManager };
//# sourceMappingURL=crypto.d.ts.map