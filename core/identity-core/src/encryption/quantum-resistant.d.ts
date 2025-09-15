export interface QuantumResistantConfig {
    enabled: boolean;
    algorithm: 'CRYSTALS-Kyber' | 'NTRU' | 'SABER' | 'FALCON' | 'Dilithium' | 'SPHINCS+';
    hybridMode: boolean;
    keySize: 512 | 768 | 1024 | 2048;
    fallbackToClassical: boolean;
    securityLevel: '128' | '192' | '256';
}
export interface QuantumKeyPair {
    classicalPublicKey: string;
    classicalPrivateKey: string;
    quantumPublicKey: string;
    quantumPrivateKey: string;
    hybridSignature: string;
    algorithm: string;
    createdAt: string;
    quantumResistant: boolean;
    securityLevel: string;
    keySize: number;
}
export declare class AuthenticQuantumResistantCrypto {
    private static readonly DEFAULT_CONFIG;
    private config;
    private isSupported;
    private latticeParams;
    constructor(config?: Partial<QuantumResistantConfig>);
    private getLatticeParams;
    private checkSupport;
    private detectQuantumSupport;
    generateHybridKeyPair(): Promise<QuantumKeyPair>;
    private generateQuantumKeyPair;
    private generateKyberKeyPair;
    private generateNTRUKeyPair;
    private generateSABERKeyPair;
    private generateFALCONKeyPair;
    private generateDilithiumKeyPair;
    private generateSPHINCSKeyPair;
    private generateRandomPolynomial;
    private generateSmallPolynomial;
    private generateDiscreteGaussian;
    private polynomialMultiply;
    private polynomialAdd;
    private polynomialInverse;
    private modularInverse;
    private encodePolynomial;
    private decodePolynomial;
    private hashToPolynomial;
    private generateMerkleRoot;
    private createHybridSignature;
    private createQuantumSignature;
    private createKyberSignature;
    private createNTRUSignature;
    private createFALCONSignature;
    private createDilithiumSignature;
    private createSPHINCSSignature;
    private generateOneTimeSignature;
    verifyHybridSignature(signature: string, publicKey: string, message: Uint8Array): Promise<boolean>;
    private verifyQuantumSignature;
    private verifyKyberSignature;
    private verifyNTRUSignature;
    private verifyFALCONSignature;
    private verifyDilithiumSignature;
    private verifySPHINCSSignature;
    private fallbackToClassical;
    private exportKey;
    private importKey;
    private arrayBufferToBase64;
    private base64ToArrayBuffer;
    private arrayBuffersEqual;
    isQuantumResistantAvailable(): boolean;
    getConfig(): QuantumResistantConfig;
    getSecurityLevel(): {
        classical: string;
        quantum: string;
        hybrid: string;
        algorithm: string;
        keySize: number;
    };
}
export { AuthenticQuantumResistantCrypto as QuantumResistantCrypto };
//# sourceMappingURL=quantum-resistant.d.ts.map