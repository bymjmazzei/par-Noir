// Scale Indicator Analyzer - Handles scale indicators analysis for commercial usage detection
import { ScaleIndicators } from '../types/licenseVerification';

export class ScaleIndicatorAnalyzer {
  // Detection mechanism storage
  private static scaleIndicatorsLog: Map<string, ScaleIndicators> = new Map();

  // Scale Indicators Analysis
  static async analyzeScaleIndicators(userActivity: any): Promise<ScaleIndicators | null> {
    // Analyze user activity for scale indicators that suggest commercial use
    
    // Check if we have stored scale data for this user
    const storedIndicators = this.scaleIndicatorsLog.get(userActivity.identityHash || 'unknown');
    
    if (storedIndicators) {
      return storedIndicators;
    }
    
    // Analyze user activity for scale indicators
    const scaleIndicators = this.extractScaleIndicators(userActivity);
    
    if (scaleIndicators) {
      const indicators: ScaleIndicators = {
        userCount: scaleIndicators.userCount || 0,
        integrationCount: scaleIndicators.integrationCount || 0,
        whiteLabelUsage: scaleIndicators.whiteLabelUsage || false,
        multiTenantUsage: scaleIndicators.multiTenantUsage || false,
        lastUpdated: Date.now(),
        identityHash: userActivity.identityHash || 'unknown'
      };
      
      this.scaleIndicatorsLog.set(indicators.identityHash, indicators);
      return indicators;
    }
    
    return null;
  }

  // Extract scale indicators from user activity
  private static extractScaleIndicators(userActivity: any): any {
    // This analyzes usage patterns that suggest commercial scale
    
    const indicators: any = {};
    
    // Check for multi-user patterns
    if (userActivity.userManagement) {
      indicators.userCount = userActivity.userManagement.totalUsers || 0;
    }
    
    // Check for integration patterns
    if (userActivity.integrations) {
      indicators.integrationCount = userActivity.integrations.count || 0;
    }
    
    // Check for white-label usage
    if (userActivity.whiteLabel) {
      indicators.whiteLabelUsage = userActivity.whiteLabel.enabled || false;
    }
    
    // Check for multi-tenant usage
    if (userActivity.multiTenant) {
      indicators.multiTenantUsage = userActivity.multiTenant.enabled || false;
    }
    
    return indicators;
  }

  // Store scale indicators
  static storeScaleIndicators(indicators: ScaleIndicators): void {
    this.scaleIndicatorsLog.set(indicators.identityHash, indicators);
  }

  // Clear scale indicators logs (for testing or privacy)
  static clearScaleIndicatorLogs(): void {
    this.scaleIndicatorsLog.clear();
  }

  // Get scale indicators statistics
  static getScaleIndicatorStats(): { totalScaleIndicators: number } {
    return {
      totalScaleIndicators: this.scaleIndicatorsLog.size
    };
  }
}
