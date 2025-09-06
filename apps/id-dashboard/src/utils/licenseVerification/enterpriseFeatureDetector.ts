// Enterprise Feature Detector - Handles enterprise feature access detection
import { EnterpriseFeatureAccess } from '../types/licenseVerification';

export class EnterpriseFeatureDetector {
  // Detection mechanism storage
  private static enterpriseFeatureLog: EnterpriseFeatureAccess[] = [];

  // Enterprise Feature Access Detection
  static async checkEnterpriseFeatureAccess(identityHash: string): Promise<boolean> {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Check if user has accessed enterprise features in the last 24 hours
    const recentEnterpriseAccess = this.enterpriseFeatureLog.filter(access => 
      access.identityHash === identityHash && 
      access.accessTimestamp > oneDayAgo &&
      access.requiresCommercialLicense
    );
    
    return recentEnterpriseAccess.length > 0;
  }

  // Log enterprise feature access
  static logEnterpriseFeatureAccess(
    identityHash: string, 
    featureId: string, 
    featureName: string, 
    requiresCommercialLicense: boolean = true
  ): void {
    const accessRecord: EnterpriseFeatureAccess = {
      featureId,
      featureName,
      accessTimestamp: Date.now(),
      identityHash,
      requiresCommercialLicense
    };
    
    this.enterpriseFeatureLog.push(accessRecord);
    
    // Keep only last 1,000 enterprise feature accesses
    if (this.enterpriseFeatureLog.length > 1000) {
      this.enterpriseFeatureLog = this.enterpriseFeatureLog.slice(-1000);
    }
  }

  // Clear enterprise feature logs (for testing or privacy)
  static clearEnterpriseFeatureLogs(): void {
    this.enterpriseFeatureLog = [];
  }

  // Get enterprise feature statistics
  static getEnterpriseFeatureStats(): { totalEnterpriseAccesses: number } {
    return {
      totalEnterpriseAccesses: this.enterpriseFeatureLog.length
    };
  }
}
