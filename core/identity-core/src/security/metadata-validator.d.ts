export interface ValidationResult {
    isValid: boolean;
    issues: string[];
    sanitizedData: any;
    riskLevel: 'low' | 'medium' | 'high';
}
export interface ValidationConfig {
    maxCustomFields: number;
    maxFieldLength: number;
    allowScripts: boolean;
    allowExternalLinks: boolean;
    strictMode: boolean;
}
export declare class MetadataValidator {
    private static readonly DEFAULT_CONFIG;
    private static readonly FORBIDDEN_PATTERNS;
    private static readonly SUSPICIOUS_PATTERNS;
    private static readonly ALLOWED_HTML_TAGS;
    static validateMetadata(metadata: any, config?: Partial<ValidationConfig>): ValidationResult;
    private static validateStructure;
    private static detectInjectionAttempts;
    private static detectSuspiciousData;
    private static sanitizeMetadata;
    private static sanitizeString;
    private static validateCustomFields;
    private static calculateRiskLevel;
    private static hasCircularReferences;
    private static getObjectDepth;
    static silentValidate(metadata: any): any;
}
//# sourceMappingURL=metadata-validator.d.ts.map