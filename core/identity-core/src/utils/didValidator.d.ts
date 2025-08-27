export interface DIDValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    didType?: 'key' | 'web' | 'ion' | 'unknown';
    method?: string;
    identifier?: string;
}
export interface DIDComponents {
    scheme: string;
    method: string;
    identifier: string;
    fragment?: string;
    query?: string;
    path?: string;
}
export declare class DIDValidator {
    private static readonly DID_SCHEME_PATTERN;
    private static readonly DID_METHOD_PATTERN;
    private static readonly DID_IDENTIFIER_PATTERN;
    private static readonly DID_KEY_PATTERN;
    private static readonly DID_WEB_PATTERN;
    private static readonly DID_ION_PATTERN;
    private static readonly PUBLIC_KEY_PATTERNS;
    private static readonly CID_PATTERN;
    private static readonly DOMAIN_PATTERN;
    static validateDID(did: string): DIDValidationResult;
    private static parseDID;
    private static validateMethodSpecific;
    private static isValidPublicKey;
    private static containsSuspiciousPatterns;
    static validateDIDDocument(didDoc: any): DIDValidationResult;
    static validateCID(cid: string): boolean;
    static validateDomain(domain: string): boolean;
    static validateSignature(signature: string): boolean;
    static validateChallenge(challenge: string): boolean;
    static getDIDMethod(did: string): string | null;
    static getDIDIdentifier(did: string): string | null;
    static isDIDMethod(did: string, method: string): boolean;
    static normalizeDID(did: string): string;
    static generateDIDKey(publicKey: string): string | null;
    static extractPublicKeyFromDIDKey(didKey: string): string | null;
}
//# sourceMappingURL=didValidator.d.ts.map