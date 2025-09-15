// Usage Pattern Analyzer - Handles usage pattern analysis and grace period management
import { UsagePattern } from '../types/licenseVerification';
import { DETECTION_THRESHOLDS } from './detectionConstants';
import { APICallMonitor } from './apiCallMonitor';
import { EnterpriseFeatureDetector } from './enterpriseFeatureDetector';
import { ScaleIndicatorAnalyzer } from './scaleIndicatorAnalyzer';

export class UsagePatternAnalyzer {
  // Detection mechanism storage
  private static usagePatterns: Map<string, UsagePattern> = new Map();

  // Comprehensive usage pattern analysis
  static async analyzeUsagePattern(identityHash: string, userActivity?: any): Promise<UsagePattern> {
    const apiCallFrequency = await APICallMonitor.monitorAPICallFrequency(identityHash);
    const enterpriseFeatureAccess = await EnterpriseFeatureDetector.checkEnterpriseFeatureAccess(identityHash);
    const scaleIndicators = userActivity ? await ScaleIndicatorAnalyzer.analyzeScaleIndicators(userActivity) : null;
    
    // Determine if usage pattern indicates commercial use
    // Removed user count check - basic auth is unlimited
    const isCommercial = 
      apiCallFrequency > DETECTION_THRESHOLDS.API_CALL_FREQUENCY_THRESHOLD ||
      enterpriseFeatureAccess ||
      (scaleIndicators && (
        // Removed userCount check - basic auth is unlimited
        scaleIndicators.integrationCount > DETECTION_THRESHOLDS.SCALE_THRESHOLDS.INTEGRATION_COUNT_THRESHOLD ||
        scaleIndicators.whiteLabelUsage ||
        scaleIndicators.multiTenantUsage
      ));
    
    // Get existing usage pattern to check grace period
    const existingPattern = this.usagePatterns.get(identityHash);
    const now = Date.now();
    
    let commercialUsageFirstDetected = existingPattern?.commercialUsageFirstDetected;
    let gracePeriodExpires = existingPattern?.gracePeriodExpires;
    let gracePeriodActive = false;
    
    // If commercial usage detected and this is the first time
    if (isCommercial && !existingPattern?.commercialUsageFirstDetected) {
      commercialUsageFirstDetected = now;
      gracePeriodExpires = now + (DETECTION_THRESHOLDS.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    }
    
    // Check if grace period is active
    if (gracePeriodExpires && now < gracePeriodExpires) {
      gracePeriodActive = true;
    }
    
    const usagePattern: UsagePattern = {
      apiCallFrequency,
      enterpriseFeatureAccess,
      scaleIndicators,
      isCommercial: isCommercial || false,
      lastChecked: now,
      commercialUsageFirstDetected,
      gracePeriodExpires,
      gracePeriodActive
    };
    
    // Store the usage pattern
    this.usagePatterns.set(identityHash, usagePattern);
    
    return usagePattern;
  }

  // Get stored usage pattern
  static getUsagePattern(identityHash: string): UsagePattern | null {
    return this.usagePatterns.get(identityHash) || null;
  }

  // Check if grace period is active for an identity
  static isGracePeriodActive(identityHash: string): boolean {
    const pattern = this.usagePatterns.get(identityHash);
    if (!pattern) return false;
    
    return pattern.gracePeriodActive || false;
  }

  // Check if grace period has expired and enforcement should begin
  static shouldEnforceRestrictions(identityHash: string): boolean {
    const pattern = this.usagePatterns.get(identityHash);
    if (!pattern) return false;
    
    // Only enforce if commercial usage detected and grace period expired
    return pattern.isCommercial && !pattern.gracePeriodActive;
  }

  // Get grace period status information
  static getGracePeriodStatus(identityHash: string): {
    isActive: boolean;
    expiresAt: Date | null;
    daysRemaining: number;
    shouldEnforce: boolean;
  } {
    const pattern = this.usagePatterns.get(identityHash);
    if (!pattern || !pattern.isCommercial) {
      return {
        isActive: false,
        expiresAt: null,
        daysRemaining: 0,
        shouldEnforce: false
      };
    }
    
    const now = Date.now();
    const expiresAt = pattern.gracePeriodExpires ? new Date(pattern.gracePeriodExpires) : null;
    const daysRemaining = pattern.gracePeriodExpires 
      ? Math.max(0, Math.ceil((pattern.gracePeriodExpires - now) / (24 * 60 * 60 * 1000)))
      : 0;
    
    return {
      isActive: pattern.gracePeriodActive || false,
      expiresAt,
      daysRemaining,
      shouldEnforce: !pattern.gracePeriodActive
    };
  }

  // Reset grace period (for testing or when user upgra license)
  static resetGracePeriod(identityHash: string): void {
    const pattern = this.usagePatterns.get(identityHash);
    if (pattern) {
      pattern.commercialUsageFirstDetected = undefined;
      pattern.gracePeriodExpires = undefined;
      pattern.gracePeriodActive = false;
      this.usagePatterns.set(identityHash, pattern);
    }
  }

  // Clear usage patterns (for testing or privacy)
  static clearUsagePatterns(): void {
    this.usagePatterns.clear();
  }

  // Get usage pattern statistics
  static getUsagePatternStats(): { totalUsagePatterns: number } {
    return {
      totalUsagePatterns: this.usagePatterns.size
    };
  }
}
