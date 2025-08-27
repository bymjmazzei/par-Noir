export interface PackageIntegrityConfig {
    enablePackageVerification: boolean;
    enableDependencyAuditing: boolean;
    enableSubresourceIntegrity: boolean;
    enableCSP: boolean;
    enablePackageSigning: boolean;
    securityLevel: 'standard' | 'military' | 'top-secret';
}
export interface PackageVerificationResult {
    isValid: boolean;
    packageName: string;
    version: string;
    signature: string;
    integrity: string;
    vulnerabilities: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
}
export interface DependencyAuditResult {
    totalDependencies: number;
    vulnerableDependencies: number;
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    mediumVulnerabilities: number;
    lowVulnerabilities: number;
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
export interface CSPConfig {
    'default-src': string[];
    'script-src': string[];
    'style-src': string[];
    'img-src': string[];
    'connect-src': string[];
    'font-src': string[];
    'object-src': string[];
    'media-src': string[];
    'frame-src': string[];
    'worker-src': string[];
    'manifest-src': string[];
    'base-uri': string[];
    'form-action': string[];
    'frame-ancestors': string[];
    'upgrade-insecure-requests': boolean;
    'block-all-mixed-content': boolean;
}
export declare class SupplyChainSecurityManager {
    private config;
    private packageSignatures;
    private dependencyAuditResults;
    private securityEvents;
    constructor(config?: Partial<PackageIntegrityConfig>);
    initialize(): Promise<void>;
    private setupContentSecurityPolicy;
    private generateCSPHeader;
    private applyCSPHeader;
    private verifyPackageIntegrity;
    private getPackageDependencies;
    private verifyPackage;
    private getPackageSignature;
    private getPackageIntegrity;
    private checkPackageVulnerabilities;
    private calculateRiskLevel;
    private generatePackageRecommendations;
    private auditDependencies;
    private performDependencyAudit;
    private setupSubresourceIntegrity;
    private addIntegrityAttributes;
    verifyExternalResource(url: string, expectedHash: string): Promise<boolean>;
    private hashContent;
    private logSecurityEvent;
    getDependencyAuditResults(): DependencyAuditResult[];
    getSecurityEvents(): Array<{
        timestamp: string;
        event: string;
        details: any;
    }>;
    getLatestAuditResult(): DependencyAuditResult | null;
}
//# sourceMappingURL=supply-chain-security.d.ts.map