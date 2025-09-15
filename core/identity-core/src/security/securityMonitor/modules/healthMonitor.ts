import { SecurityStatus, HealthCheckResult, MonitoringConfig } from '../types/securityMonitor';

export class HealthMonitor {
  private config: MonitoringConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: string = '';
  private healthHistory: HealthCheckResult[] = [];
  private maxHealthHistory: number = 100;

  constructor(config: MonitoringConfig) {
    this.config = config;
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<HealthCheckResult[]> {
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];

    try {
      // Check quantum-resistant status
      const quantumResult = await this.checkQuantumResistantHealth();
      results.push(quantumResult);

      // Check HSM status
      const hsmResult = await this.checkHSMHealth();
      results.push(hsmResult);

      // Check threat detection status
      const threatResult = await this.checkThreatDetectionHealth();
      results.push(threatResult);

      // Check overall system health
      const systemResult = await this.checkSystemHealth();
      results.push(systemResult);

      // Update health history
      this.updateHealthHistory(results);

      // Update last check time
      this.lastHealthCheck = new Date().toISOString();

      return results;
    } catch (error) {
      // Console statement removed for production
      return results;
    }
  }

  /**
   * Check quantum-resistant crypto health
   */
  private async checkQuantumResistantHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Simulate quantum-resistant health check
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const responseTime = Date.now() - startTime;
      const status = responseTime < 100 ? 'healthy' : responseTime < 200 ? 'degraded' : 'unhealthy';

      if (status === 'degraded') {
        warnings.push('Response time above optimal threshold');
      } else if (status === 'unhealthy') {
        errors.push('Response time critically high');
      }

      return {
        component: 'quantum-resistant',
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        errors,
        warnings,
        metrics: {
          responseTime,
          algorithm: 'CRYSTALS-Kyber',
          keySize: 768
        }
      };
    } catch (error) {
      return {
        component: 'quantum-resistant',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        metrics: {}
      };
    }
  }

  /**
   * Check HSM health
   */
  private async checkHSMHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Simulate HSM health check
      await new Promise(resolve => setTimeout(resolve, 30));
      
      const responseTime = Date.now() - startTime;
      const status = responseTime < 50 ? 'healthy' : responseTime < 100 ? 'degraded' : 'unhealthy';

      if (status === 'degraded') {
        warnings.push('HSM response time above optimal threshold');
      } else if (status === 'unhealthy') {
        errors.push('HSM response time critically high');
      }

      return {
        component: 'hsm',
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        errors,
        warnings,
        metrics: {
          responseTime,
          provider: 'local-hsm',
          connected: true
        }
      };
    } catch (error) {
      return {
        component: 'hsm',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        metrics: {}
      };
    }
  }

  /**
   * Check threat detection health
   */
  private async checkThreatDetectionHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Simulate threat detection health check
      await new Promise(resolve => setTimeout(resolve, 40));
      
      const responseTime = Date.now() - startTime;
      const status = responseTime < 80 ? 'healthy' : responseTime < 150 ? 'degraded' : 'unhealthy';

      if (status === 'degraded') {
        warnings.push('Threat detection response time above optimal threshold');
      } else if (status === 'unhealthy') {
        errors.push('Threat detection response time critically high');
      }

      return {
        component: 'threat-detection',
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        errors,
        warnings,
        metrics: {
          responseTime,
          active: true,
          eventsPerHour: 0
        }
      };
    } catch (error) {
      return {
        component: 'threat-detection',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        metrics: {}
      };
    }
  }

  /**
   * Check overall system health
   */
  private async checkSystemHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Simulate system health check
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const responseTime = Date.now() - startTime;
      const status = responseTime < 40 ? 'healthy' : responseTime < 80 ? 'degraded' : 'unhealthy';

      if (status === 'degraded') {
        warnings.push('System response time above optimal threshold');
      } else if (status === 'unhealthy') {
        errors.push('System response time critically high');
      }

      return {
        component: 'system',
        status,
        responseTime,
        lastCheck: new Date().toISOString(),
        errors,
        warnings,
        metrics: {
          responseTime,
          uptime: 99.9,
          memoryUsage: 45.2
        }
      };
    } catch (error) {
      return {
        component: 'system',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        metrics: {}
      };
    }
  }

  /**
   * Update health history
   */
  private updateHealthHistory(results: HealthCheckResult[]): void {
    const timestamp = new Date().toISOString();
    
    for (const result of results) {
      this.healthHistory.push({
        ...result,
        lastCheck: timestamp
      });
    }

    // Maintain max history limit
    if (this.healthHistory.length > this.maxHealthHistory) {
      this.healthHistory = this.healthHistory.slice(-this.maxHealthHistory);
    }
  }

  /**
   * Get health history
   */
  getHealthHistory(): HealthCheckResult[] {
    return [...this.healthHistory];
  }

  /**
   * Get recent health checks
   */
  getRecentHealthChecks(limit: number = 10): HealthCheckResult[] {
    return this.healthHistory.slice(-limit);
  }

  /**
   * Get health checks by component
   */
  getHealthChecksByComponent(component: string): HealthCheckResult[] {
    return this.healthHistory.filter(check => check.component === component);
  }

  /**
   * Get health checks by status
   */
  getHealthChecksByStatus(status: 'healthy' | 'degraded' | 'unhealthy'): HealthCheckResult[] {
    return this.healthHistory.filter(check => check.status === status);
  }

  /**
   * Get last health check time
   */
  getLastHealthCheckTime(): string {
    return this.lastHealthCheck;
  }

  /**
   * Check if health monitoring is active
   */
  isHealthMonitoringActive(): boolean {
    return this.healthCheckInterval !== null;
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update monitoring configuration
   */
  updateMonitoringConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if interval changed
    if (newConfig.healthCheckInterval && this.isHealthMonitoringActive()) {
      this.stopHealthMonitoring();
      this.startHealthMonitoring();
    }
  }

  /**
   * Clear health history
   */
  clearHealthHistory(): void {
    this.healthHistory = [];
  }

  /**
   * Set maximum health history limit
   */
  setMaxHealthHistory(max: number): void {
    this.maxHealthHistory = max;
    
    // Trim if current count exceeds new limit
    if (this.healthHistory.length > this.maxHealthHistory) {
      this.healthHistory = this.healthHistory.slice(-this.maxHealthHistory);
    }
  }

  /**
   * Get maximum health history limit
   */
  getMaxHealthHistory(): number {
    return this.maxHealthHistory;
  }

  /**
   * Export health history for debugging
   */
  exportHealthHistory(): string {
    return JSON.stringify(this.healthHistory, null, 2);
  }

  /**
   * Import health history from string
   */
  importHealthHistory(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.healthHistory = imported;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Destroy health monitor
   */
  troy(): void {
    this.stopHealthMonitoring();
    this.clearHealthHistory();
  }
}
