export interface WebAuthnCredential {
    id: string;
    type: 'public-key';
    transports: AuthenticatorTransport[];
    attestationObject: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    publicKey: ArrayBuffer;
    signCount: number;
    backupEligible: boolean;
    backupState: boolean;
    createdAt: string;
    lastUsed: string;
}
export interface WebAuthnAuthenticationResult {
    success: boolean;
    credentialId: string;
    signature: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    userHandle: ArrayBuffer;
    signCount: number;
}
export interface WebAuthnRegistrationResult {
    success: boolean;
    credentialId: string;
    publicKey: ArrayBuffer;
    attestationObject: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    transports: string[];
}
export interface WebAuthnConfig {
    rpName: string;
    rpID: string;
    userID: string;
    userName: string;
    userDisplayName: string;
    challenge: Uint8Array;
    timeout: number;
    attestation: 'direct' | 'indirect' | 'none';
    authenticatorSelection: {
        authenticatorAttachment: 'platform' | 'cross-platform';
        userVerification: 'required' | 'preferred' | 'discouraged';
        requireResidentKey: boolean;
    };
    pubKeyCredParams: Array<{
        type: 'public-key';
        alg: number;
    }>;
    excludeCredentials: Array<{
        type: 'public-key';
        id: ArrayBuffer;
        transports: AuthenticatorTransport[];
    }>;
}
export declare class WebAuthnManager {
    private config;
    private credentials;
    constructor(config?: Partial<WebAuthnConfig>);
    static isSupported(): boolean;
    static isPlatformAuthenticatorAvailable(): Promise<boolean>;
    static isConditionalMediationSupported(): boolean;
    registerCredential(): Promise<WebAuthnRegistrationResult>;
    authenticateCredential(credentialId?: string): Promise<WebAuthnAuthenticationResult>;
    authenticateWithConditionalMediation(): Promise<WebAuthnAuthenticationResult | null>;
    removeCredential(credentialId: string): Promise<boolean>;
    getCredentials(): WebAuthnCredential[];
    getCredential(credentialId: string): WebAuthnCredential | undefined;
    hasCredentials(): boolean;
    private stringToArrayBuffer;
    private base64ToArrayBuffer;
    private arrayBufferToBase64;
    private extractPublicKey;
    verifySignature(signature: ArrayBuffer, authenticatorData: ArrayBuffer, clientDataJSON: ArrayBuffer, publicKey: ArrayBuffer, challenge: ArrayBuffer): Promise<boolean>;
}
//# sourceMappingURL=webauthn.d.ts.map