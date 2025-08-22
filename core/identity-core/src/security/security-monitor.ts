/**
 * Security Monitor - Central Security Management System
 * Integrates quantum-resistant crypto, HSM, and threat detection
 * Runs in the background without affecting UI/UX
 */

import { QuantumResistantCrypto, QuantumResistantConfig } from '../encryption/quantum-resistant';
import { HSMManager, HSMConfig } from './hsmManager';
import { ThreatDetectionSystem, ThreatDetectionConfig } from './threat-detection';

export interface SecurityMonitorConfig {
  enabled: boolean;
  quantumResistant: QuantumResistantConfig;
  hsm: HSMConfig;
  threatDetection: ThreatDetectionConfig;
  autoUpgrade: boolean; // Automatically upgrade to enhanced security
  fallbackMode: boolean; // Fallback to basic security if enhanced fails
  monitoringLevel: 'basic' | 'enhanced' | 'enterprise';
}

export interface SecurityStatus {
  overall: 'secure' | 'warning' | 'critical';
  quantumResistant: 'enabled' | 'disabled' | 'unavailable';
  hsm: 'connected' | 'disconnected' | 'unavailable';
  threatDetection: 'active' | 'inactive' | 'error';
  lastCheck: string;
  alerts: number;
  events: number;
  recommendations: string[];
}

export interface SecurityMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  securityScore: number; // 0-100
  uptime: number; // percentage
  lastIncident?: string;
}

export class SecurityMonitor {
  private config: SecurityMonitorConfig;
  private quantumCrypto: QuantumResistantCrypto;
  private hsmManager: HSMManager;
  private threatDetection: ThreatDetectionSystem;
  private status: SecurityStatus;
  private metrics: SecurityMetrics;
  private isInitialized: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SecurityMonitorConfig> = {}) {
    this.config = {
      enabled: false, // Disabled by default
      quantumResistant: { 
        enabled: false,
        algorithm: 'CRYSTALS-Kyber',
        hybridMode: true,
        keySize: 768,
        fallbackToClassical: true,
        securityLevel: '192'
      },
      hsm: { 
        enabled: false, 
        provider: 'local-hsm',
        fallbackToLocal: true 
      },
      threatDetection: { 
        enabled: false,
        sensitivity: 'medium',
        monitoringInterval: 30000,
        maxEventsPerHour: 1000,
        alertThreshold: 70,
        autoBlock: false,
        logLevel: 'warn'
      },
      autoUpgrade: false,
      fallbackMode: true,
      monitoringLevel: 'basic',
      ...config
    };

    // Initialize security components
    this.quantumCrypto = new QuantumResistantCrypto(this.config.quantumResistant);
    this.hsmManager = new HSMManager(this.config.hsm);
    this.threatDetection = new ThreatDetectionSystem(this.config.threatDetection);

    // Initialize status
    this.status = {
      overall: 'secure',
      quantumResistant: 'disabled',
      hsm: 'disconnected',
      threatDetection: 'inactive',
      lastCheck: new Date().toISOString(),
      alerts: 0,
      events: 0,
      recommendations: []
    };

    // Initialize metrics
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      securityScore: 100,
      uptime: 100
    };
  }

  /**
   * Initialize security monitor
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Initialize quantum-resistant cryptography
      await this.initializeQuantumResistant();

      // Initialize HSM
      await this.initializeHSM();

      // Initialize threat detection
      await this.initializeThreatDetection();

      // Start health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      this.updateStatus();
      this.log('info', 'Security monitor initialized successfully');
    } catch (error) {
      this.log('error', `Failed to initialize security monitor: ${error}`);
      if (this.config.fallbackMode) {
        this.enableFallbackMode();
      }
    }
  }

  /**
   * Initialize quantum-resistant cryptography
   */
  private async initializeQuantumResistant(): Promise<void> {
    try {
      if (this.config.quantumResistant.enabled) {
        // Check if quantum-resistant features are available
        if (this.quantumCrypto.isQuantumResistantAvailable()) {
          this.status.quantumResistant = 'enabled';
          this.log('info', 'Quantum-resistant cryptography enabled');
        } else {
          this.status.quantumResistant = 'unavailable';
          this.log('warn', 'Quantum-resistant cryptography not available, using classical');
        }
      } else {
        this.status.quantumResistant = 'disabled';
      }
    } catch (error) {
      this.status.quantumResistant = 'unavailable';
      this.log('error', `Quantum-resistant initialization failed: ${error}`);
    }
  }

  /**
   * Initialize HSM
   */
  private async initializeHSM(): Promise<void> {
    try {
      if (this.config.hsm.enabled) {
        const connected = await this.hsmManager.initialize();
        if (connected) {
          this.status.hsm = 'connected';
          this.log('info', 'HSM connected successfully');
        } else {
          this.status.hsm = 'disconnected';
          this.log('warn', 'HSM connection failed, using local storage');
        }
      } else {
        this.status.hsm = 'disconnected';
      }
    } catch (error) {
      this.status.hsm = 'unavailable';
      this.log('error', `HSM initialization failed: ${error}`);
    }
  }

  /**
   * Initialize threat detection
   */
  private async initializeThreatDetection(): Promise<void> {
    try {
      if (this.config.threatDetection.enabled) {
        await this.threatDetection.initialize();
        this.status.threatDetection = 'active';
        this.log('info', 'Threat detection system active');
      } else {
        this.status.threatDetection = 'inactive';
      }
    } catch (error) {
      this.status.threatDetection = 'error';
      this.log('error', `Threat detection initialization failed: ${error}`);
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Check every minute
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check quantum-resistant status
      if (this.config.quantumResistant.enabled) {
        this.status.quantumResistant = this.quantumCrypto.isQuantumResistantAvailable() ? 'enabled' : 'unavailable';
      }

      // Check HSM status
      if (this.config.hsm.enabled) {
        this.status.hsm = this.hsmManager.isHSMConnected() ? 'connected' : 'disconnected';
      }

      // Check threat detection status
      if (this.config.threatDetection.enabled) {
        this.status.threatDetection = this.threatDetection.isEnabled() ? 'active' : 'error';
      }

      // Update metrics
      this.updateMetrics();

      // Update overall status
      this.updateStatus();

      // Update last check time
      this.status.lastCheck = new Date().toISOString();

      this.log('info', 'Health check completed');
    } catch (error) {
      this.log('error', `Health check failed: ${error}`);
    }
  }

  /**
   * Update security status
   */
  private updateStatus(): void {
    const alerts = this.threatDetection.getAlerts().filter(a => !a.resolved).length;
    const events = this.threatDetection.getEvents().length;

    this.status.alerts = alerts;
    this.status.events = events;

    // Determine overall status
    let criticalIssues = 0;
    let warnings = 0;

    if (this.status.quantumResistant === 'unavailable' && this.config.quantumResistant.enabled) {
      warnings++;
    }

    if (this.status.hsm === 'unavailable' && this.config.hsm.enabled) {
      warnings++;
    }

    if (this.status.threatDetection === 'error' && this.config.threatDetection.enabled) {
      criticalIssues++;
    }

    if (alerts > 10) {
      criticalIssues++;
    } else if (alerts > 5) {
      warnings++;
    }

    // Set overall status
    if (criticalIssues > 0) {
      this.status.overall = 'critical';
    } else if (warnings > 0) {
      this.status.overall = 'warning';
    } else {
      this.status.overall = 'secure';
    }

    // Generate recommendations
    this.generateRecommendations();
  }

  /**
   * Update security metrics
   */
  private updateMetrics(): void {
    const events = this.threatDetection.getEvents();
    const alerts = this.threatDetection.getAlerts();

    this.metrics.totalOperations = events.length;
    this.metrics.successfulOperations = events.filter(e => e.action !== 'blocked').length;
    this.metrics.failedOperations = events.filter(e => e.action === 'blocked').length;

    // Calculate security score
    let score = 100;

    // Deduct points for issues
    if (this.status.quantumResistant === 'unavailable') score -= 10;
    if (this.status.hsm === 'unavailable') score -= 15;
    if (this.status.threatDetection === 'error') score -= 20;
    if (this.metrics.failedOperations > 0) score -= 5;
    if (this.status.alerts > 5) score -= 10;

    this.metrics.securityScore = Math.max(0, score);
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(): void {
    this.status.recommendations = [];

    if (this.status.quantumResistant === 'unavailable' && this.config.quantumResistant.enabled) {
      this.status.recommendations.push('Enable quantum-resistant cryptography for enhanced security');
    }

    if (this.status.hsm === 'unavailable' && this.config.hsm.enabled) {
      this.status.recommendations.push('Connect to HSM for enterprise-grade key management');
    }

    if (this.status.threatDetection === 'error' && this.config.threatDetection.enabled) {
      this.status.recommendations.push('Fix threat detection system to monitor security events');
    }

    if (this.status.alerts > 5) {
      this.status.recommendations.push('Review and resolve security alerts');
    }

    if (this.metrics.securityScore < 80) {
      this.status.recommendations.push('Security score is low, review security configuration');
    }
  }

  /**
   * Enable fallback mode
   */
  private enableFallbackMode(): void {
    this.log('warn', 'Enabling fallback mode with basic security');
    
    // Disable enhanced features
    this.config.quantumResistant.enabled = false;
    this.config.hsm.enabled = false;
    this.config.threatDetection.enabled = false;

    // Update status
    this.status.quantumResistant = 'disabled';
    this.status.hsm = 'disconnected';
    this.status.threatDetection = 'inactive';
    this.status.overall = 'warning';

    this.status.recommendations.push('Enhanced security features disabled, using basic security mode');
  }

  /**
   * Generate enhanced key pair
   */
  async generateEnhancedKeyPair(): Promise<any> {
    try {
      this.metrics.totalOperations++;

      // Try quantum-resistant first
      if (this.quantumCrypto.isQuantumResistantAvailable()) {
        const quantumKeyPair = await this.quantumCrypto.generateHybridKeyPair();
        this.metrics.successfulOperations++;
        this.log('info', 'Generated quantum-resistant key pair');
        return quantumKeyPair;
      }

      // Try HSM if available
      if (this.hsmManager.isHSMConnected()) {
        const hsmKeyPair = await this.hsmManager.generateKeyPair();
        this.metrics.successfulOperations++;
        this.log('info', 'Generated HSM-protected key pair');
        return hsmKeyPair;
      }

      // Fallback to classical cryptography
      const classicalKeyPair = await crypto.subtle.generateKey(
        { name: 'Ed25519' },
        true,
        ['sign', 'verify']
      );

      this.metrics.successfulOperations++;
      this.log('info', 'Generated classical key pair');
      return classicalKeyPair;

    } catch (error) {
      this.metrics.failedOperations++;
      this.log('error', `Key generation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Sign data with enhanced security
   */
  async signData(data: string, keyPair: any): Promise<string> {
    try {
      this.metrics.totalOperations++;

      // Record security event
      this.threatDetection.recordEvent({
        type: 'authorization',
        severity: 'medium',
        details: {
          operation: 'sign',
          dataLength: data.length,
          timestamp: new Date().toISOString()
        }
      });

      // Try quantum-resistant signing
      if (keyPair.quantumResistant && this.quantumCrypto.isQuantumResistantAvailable()) {
        // For now, use classical signing since quantum-resistant signing is not implemented
        const signature = await crypto.subtle.sign(
          'Ed25519',
          keyPair.privateKey,
          new TextEncoder().encode(data)
        );
        this.metrics.successfulOperations++;
        return this.arrayBufferToBase64(signature);
      }

      // Try HSM signing
      if (keyPair.hsmProtected && this.hsmManager.isHSMConnected()) {
        const signature = await this.hsmManager.sign(keyPair.keyId, data);
        this.metrics.successfulOperations++;
        return signature;
      }

      // Fallback to classical signing
      const signature = await crypto.subtle.sign(
        'Ed25519',
        keyPair.privateKey,
        new TextEncoder().encode(data)
      );

      this.metrics.successfulOperations++;
      return this.arrayBufferToBase64(signature);

    } catch (error) {
      this.metrics.failedOperations++;
      this.log('error', `Data signing failed: ${error}`);
      throw error;
    }
  }

  /**
   * Verify signature with enhanced security
   */
  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      this.metrics.totalOperations++;

      // Record security event
      this.threatDetection.recordEvent({
        type: 'authorization',
        severity: 'low',
        details: {
          operation: 'verify',
          dataLength: data.length,
          timestamp: new Date().toISOString()
        }
      });

      // Try quantum-resistant verification
      if (this.quantumCrypto.isQuantumResistantAvailable()) {
        const isValid = await this.quantumCrypto.verifyHybridSignature(
          signature,
          publicKey,
          new TextEncoder().encode(data)
        );
        this.metrics.successfulOperations++;
        return isValid;
      }

      // Fallback to classical verification
      const key = await crypto.subtle.importKey(
        'spki',
        this.base64ToArrayBuffer(publicKey),
        'Ed25519',
        false,
        ['verify']
      );

      const isValid = await crypto.subtle.verify(
        'Ed25519',
        key,
        this.base64ToArrayBuffer(signature),
        new TextEncoder().encode(data)
      );

      this.metrics.successfulOperations++;
      return isValid;

    } catch (error) {
      this.metrics.failedOperations++;
      this.log('error', `Signature verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Upgrade security level
   */
  async upgradeSecurityLevel(): Promise<void> {
    if (!this.config.autoUpgrade) {
      return;
    }

    try {
      // Try to enable quantum-resistant cryptography
      if (this.status.quantumResistant === 'disabled') {
        this.config.quantumResistant.enabled = true;
        await this.initializeQuantumResistant();
      }

      // Try to connect to HSM
      if (this.status.hsm === 'disconnected') {
        this.config.hsm.enabled = true;
        await this.initializeHSM();
      }

      // Try to enable threat detection
      if (this.status.threatDetection === 'inactive') {
        this.config.threatDetection.enabled = true;
        await this.initializeThreatDetection();
      }

      this.log('info', 'Security level upgraded successfully');
    } catch (error) {
      this.log('error', `Security upgrade failed: ${error}`);
    }
  }

  /**
   * Get security status
   */
  getSecurityStatus(): SecurityStatus {
    return { ...this.status };
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Get configuration
   */
  getConfig(): SecurityMonitorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SecurityMonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if needed
    if (this.isInitialized) {
      this.initialize();
    }
  }

  /**
   * Check if enhanced security is available
   */
  isEnhancedSecurityAvailable(): boolean {
    return (
      this.quantumCrypto.isQuantumResistantAvailable() ||
      this.hsmManager.isHSMConnected() ||
      this.threatDetection.isEnabled()
    );
  }

  /**
   * Utility methods
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private log(level: string, message: string): void {
    console.log(`[SecurityMonitor] ${level.toUpperCase()}: ${message}`);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.threatDetection.destroy();
    this.isInitialized = false;
  }
} 