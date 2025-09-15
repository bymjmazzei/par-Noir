export interface HSMConfig {
    enabled: boolean;
    provider: 'aws-kms' | 'azure-keyvault' | 'gcp-kms' | 'local-hsm';
    region?: string;
    keyId?: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
    fallbackToLocal: boolean;
}
export interface HSMKeyPair {
    keyId: string;
    publicKey: string;
    encryptedPrivateKey: string;
    provider: string;
    region: string;
    createdAt: string;
    expiresAt?: string;
    hsmProtected: boolean;
}
export interface HSMOperation {
    operation: 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'generate';
    keyId: string;
    data?: string;
    algorithm?: string;
    timestamp: string;
    success: boolean;
    error?: string;
}
export declare class HSMManager {
    private config;
    private operationLog;
    private isConnected;
    constructor(config?: Partial<HSMConfig>);
    initialize(): Promise<boolean>;
    private initializeAWSKMS;
    private initializeAzureKeyVault;
    private initializeGCPKMS;
    private initializeLocalHSM;
    private simulateHSMConnection;
    generateKeyPair(algorithm?: string): Promise<HSMKeyPair>;
    sign(keyId: string, data: string, algorithm?: string): Promise<string>;
    verify(keyId: string, data: string, signature: string, algorithm?: string): Promise<boolean>;
    encrypt(keyId: string, data: string, algorithm?: string): Promise<string>;
    decrypt(keyId: string, encryptedData: string, algorithm?: string): Promise<string>;
    private simulateHSMKeyGeneration;
    private simulateHSMSigning;
    private simulateHSMVerification;
    private simulateHSMEncryption;
    private simulateHSMDecryption;
    private fallbackToLocalKeyGeneration;
    private fallbackToLocalSigning;
    private fallbackToLocalVerification;
    private fallbackToLocalEncryption;
    private fallbackToLocalDecryption;
    private generateKeyId;
    private arrayBufferToBase64;
    private logOperation;
    getOperationLog(): HSMOperation[];
    isHSMConnected(): boolean;
    getConfig(): HSMConfig;
    updateConfig(newConfig: Partial<HSMConfig>): void;
}
//# sourceMappingURL=hsmManager.d.ts.map