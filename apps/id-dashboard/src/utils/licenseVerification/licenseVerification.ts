import { cryptoWorkerManager } from './cryptoWorkerManager';
// Main LicenseVerification Class - Maintains backward compatibility while using modular components
import { LicenseInfo, LicenseProof } from '../types/licenseVerification';
import { APICallMonitor } from './apiCallMonitor';
import { EnterpriseFeatureDetector } from './enterpriseFeatureDetector';
import { ScaleIndicatorAnalyzer } from './scaleIndicatorAnalyzer';
import { UsagePatternAnalyzer } from './usagePatternAnalyzer';
import { LicenseManager } from './licenseManager';
import { ZKPManager } from './zkpManager';

// License verification system with ZKP support
export class LicenseVerification {
  // API Call Frequency Monitoring
  static async monitorAPICallFrequency(identityHash: string): Promise<number> {
    return await APICallMonitor.monitorAPICallFrequency(identityHash);
  }

  // Log API call for monitoring
  static logAPICall(identityHash: string, endpoint: string, method: string): void {
    APICallMonitor.logAPICall(identityHash, endpoint, method);
  }

  // Enterprise Feature Access Detection
  static async checkEnterpriseFeatureAccess(identityHash: string): Promise<boolean> {
    return await EnterpriseFeatureDetector.checkEnterpriseFeatureAccess(identityHash);
  }

  // Log enterprise feature access
  static logEnterpriseFeatureAccess(
    identityHash: string, 
    featureId: string, 
    featureName: string, 
    requiresCommercialLicense: boolean = true
  ): void {
    EnterpriseFeatureDetector.logEnterpriseFeatureAccess(
      identityHash, 
      featureId, 
      featureName, 
      requiresCommercialLicense
    );
  }

  // Scale Indicators Analysis
  static async analyzeScaleIndicators(userActivity: any): Promise<any> {
    return await ScaleIndicatorAnalyzer.analyzeScaleIndicators(userActivity);
  }

  // Store scale indicators
  static storeScaleIndicators(indicators: any): void {
    ScaleIndicatorAnalyzer.storeScaleIndicators(indicators);
  }

  // Comprehensive usage pattern analysis
  static async analyzeUsagePattern(identityHash: string, userActivity?: any): Promise<any> {
    return await UsagePatternAnalyzer.analyzeUsagePattern(identityHash, userActivity);
  }

  // Get stored usage pattern
  static getUsagePattern(identityHash: string): any {
    return UsagePatternAnalyzer.getUsagePattern(identityHash);
  }

  // Check if grace period is active for an identity
  static isGracePeriodActive(identityHash: string): boolean {
    return UsagePatternAnalyzer.isGracePeriodActive(identityHash);
  }

  // Check if grace period has expired and enforcement should begin
  static shouldEnforceRestrictions(identityHash: string): boolean {
    return UsagePatternAnalyzer.shouldEnforceRestrictions(identityHash);
  }

  // Get grace period status information
  static getGracePeriodStatus(identityHash: string): any {
    return UsagePatternAnalyzer.getGracePeriodStatus(identityHash);
  }

  // Reset grace period (for testing or when user upgra license)
  static resetGracePeriod(identityHash: string): void {
    UsagePatternAnalyzer.resetGracePeriod(identityHash);
  }

  // Clear detection logs (for testing or privacy)
  static clearDetectionLogs(): void {
    APICallMonitor.clearAPICallLogs();
    EnterpriseFeatureDetector.clearEnterpriseFeatureLogs();
    ScaleIndicatorAnalyzer.clearScaleIndicatorLogs();
    UsagePatternAnalyzer.clearUsagePatterns();
  }

  // Get detection statistics
  static getDetectionStats(): any {
    const apiCallStats = APICallMonitor.getAPICallStats();
    const enterpriseFeatureStats = EnterpriseFeatureDetector.getEnterpriseFeatureStats();
    const scaleIndicatorStats = ScaleIndicatorAnalyzer.getScaleIndicatorStats();
    const usagePatternStats = UsagePatternAnalyzer.getUsagePatternStats();

    return {
      totalAPICalls: apiCallStats.totalAPICalls,
      totalEnterpriseAccesses: enterpriseFeatureStats.totalEnterpriseAccesses,
      totalScaleIndicators: scaleIndicatorStats.totalScaleIndicators,
      totalUsagePatterns: usagePatternStats.totalUsagePatterns
    };
  }

  // Generate ZKP proof for license verification
  static async generateLicenseProof(licenseInfo: LicenseInfo, identityData: any): Promise<LicenseProof> {
    return await ZKPManager.generateLicenseProof(licenseInfo, identityData);
  }

  // Verify license using ZKP
  static async verifyLicenseProof(proof: LicenseProof): Promise<boolean> {
    return await ZKPManager.verifyLicenseProof(proof);
  }

  // Check if license is valid (not expired, etc.)
  static isLicenseValid(licenseInfo: LicenseInfo): boolean {
    return LicenseManager.isLicenseValid(licenseInfo);
  }

  // Generate receipt for accounting purposes
  static generateReceipt(licenseInfo: LicenseInfo, paymentDetails: any): any {
    return LicenseManager.generateReceipt(licenseInfo, paymentDetails);
  }

  // Generate a free non-commercial license for new users
  static async generateFreeLicense(identityHash: string, identityName: string): Promise<LicenseInfo> {
    return await LicenseManager.generateFreeLicense(identityHash, identityName);
  }

  // Generate a commercial license
  static async generateCommercialLicense(
    licenseType: 'perpetual' | 'annual',
    identityHash: string,
    identityName: string
  ): Promise<LicenseInfo> {
    return await LicenseManager.generateCommercialLicense(licenseType, identityHash, identityName);
  }

  // Find license by identity hash
  static async findLicenseByIdentityHash(identityHash: string): Promise<LicenseInfo | null> {
    return await LicenseManager.findLicenseByIdentityHash(identityHash);
  }

  // Store license
  static async storeLicense(licenseInfo: LicenseInfo): Promise<void> {
    return await LicenseManager.storeLicense(licenseInfo);
  }

  // Transfer license during identity recovery
  static async transferLicense(oldIdentityHash: string, newIdentityHash: string): Promise<LicenseInfo | null> {
    return await LicenseManager.transferLicense(oldIdentityHash, newIdentityHash);
  }

  // Invalidate a license
  static async invalidateLicense(licenseKey: string): Promise<void> {
    return await LicenseManager.invalidateLicense(licenseKey);
  }

  // Get license price
  static getLicensePrice(licenseType: string): number {
    return LicenseManager.getLicensePrice(licenseType);
  }

  // Check if user has a license (free or commercial)
  static async hasLicense(identityHash: string): Promise<boolean> {
    return await LicenseManager.hasLicense(identityHash);
  }

  // Check if user has commercial license
  static async hasCommercialLicense(identityHash: string): Promise<boolean> {
    return await LicenseManager.hasCommercialLicense(identityHash);
  }

  // Get license status for display
  static async getLicenseStatus(identityHash: string): Promise<any> {
    return await LicenseManager.getLicenseStatus(identityHash);
  }
}
