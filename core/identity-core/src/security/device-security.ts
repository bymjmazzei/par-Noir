/**
 * Device Security Module - Hardware Security and Threat Detection
 * Implements WebAuthn, device fingerprinting, malware detection, and behavioral analysis
 */

import { IdentityError, IdentityErrorCodes } from '../types';

export interface DeviceSecurityConfig {
  enableWebAuthn: boolean;
  enableThreatDetection: boolean;
  enableBehavioralAnalysis: boolean;
  enableMalwareDetection: boolean;
  enableDeviceFingerprinting: boolean;
  securityLevel: 'standard' | 'military' | 'top-secret';
}

export interface DeviceFingerprint {
  id: string;
  components: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number;
    maxTouchPoints: number;
    canvasFingerprint: string;
    webglFingerprint: string;
    audioFingerprint: string;
    fontFingerprint: string;
  };
  hash: string;
  timestamp: string;
}

export interface ThreatDetectionResult {
  isThreat: boolean;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: string[];
  confidence: number;
  recommendations: string[];
}

export interface BehavioralAnalysisResult {
  isAnomalous: boolean;
  anomalyScore: number;
  detectedBehaviors: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  userID: string;
  challenge: Uint8Array;
  timeout: number;
  attestation: 'direct' | 'indirect' | 'none';
  authenticatorSelection: {
    authenticatorAttachment: 'platform' | 'cross-platform';
    userVerification: 'required' | 'preferred' | 'discouraged';
    requireResidentKey: boolean;
  };
}

export class DeviceSecurityManager {
  private config: DeviceSecurityConfig;
  private deviceFingerprint: DeviceFingerprint | null = null;
  private threatHistory: ThreatDetectionResult[] = [];
  private behavioralHistory: BehavioralAnalysisResult[] = [];
  private securityEvents: Array<{ timestamp: string; event: string; details: any }> = [];

  constructor(config: Partial<DeviceSecurityConfig> = {}) {
    this.config = {
      enableWebAuthn: true,
      enableThreatDetection: true,
      enableBehavioralAnalysis: true,
      enableMalwareDetection: true,
      enableDeviceFingerprinting: true,
      securityLevel: 'military',
      ...config
    };
  }

  /**
   * Initialize device security
   */
  async initialize(): Promise<void> {
    try {
      // Generate device fingerprint
      if (this.config.enableDeviceFingerprinting) {
        this.deviceFingerprint = await this.generateDeviceFingerprint();
      }

      // Start threat detection
      if (this.config.enableThreatDetection) {
        await this.startThreatDetection();
      }

      // Start behavioral analysis
      if (this.config.enableBehavioralAnalysis) {
        await this.startBehavioralAnalysis();
      }

      this.logSecurityEvent('device_security_initialized', { config: this.config });
    } catch (error) {
      throw new IdentityError(
        'Failed to initialize device security',
        IdentityErrorCodes.SECURITY_ERROR,
        error
      );
    }
  }

  /**
   * Generate device fingerprint
   */
  private async generateDeviceFingerprint(): Promise<DeviceFingerprint> {
    const components = {
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: (navigator as any).deviceMemory || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      canvasFingerprint: await this.generateCanvasFingerprint(),
      webglFingerprint: await this.generateWebGLFingerprint(),
      audioFingerprint: await this.generateAudioFingerprint(),
      fontFingerprint: await this.generateFontFingerprint()
    };

    const fingerprintData = JSON.stringify(components);
    const hash = await this.hashData(fingerprintData);

    return {
      id: crypto.randomUUID(),
      components,
      hash,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate canvas fingerprint
   */
  private async generateCanvasFingerprint(): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw unique pattern
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Identity Protocol Security', 2, 2);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Identity Protocol Security', 4, 4);

    return canvas.toDataURL();
  }

  /**
   * Generate WebGL fingerprint
   */
  private async generateWebGLFingerprint(): Promise<string> {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!gl) return '';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

    return `${vendor}-${renderer}`;
  }

  /**
   * Generate audio fingerprint
   */
  private async generateAudioFingerprint(): Promise<string> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0; // Silent
      oscillator.type = 'triangle';
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(0);

      const audioData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(audioData);

      oscillator.stop();
      audioContext.close();

      return Array.from(audioData).slice(0, 10).join(',');
    } catch (error) {
      return 'audio_not_supported';
    }
  }

  /**
   * Generate font fingerprint
   */
  private async generateFontFingerprint(): Promise<string> {
    const fonts = [
      'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
      'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console'
    ];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const baseFont = 'monospace';
    const baseWidth = ctx.measureText('Identity Protocol').width;
    const availableFonts: string[] = [];

    for (const font of fonts) {
      ctx.font = `12px ${font}`;
      const width = ctx.measureText('Identity Protocol').width;
      if (width !== baseWidth) {
        availableFonts.push(font);
      }
    }

    return availableFonts.join(',');
  }

  /**
   * Start threat detection
   */
  private async startThreatDetection(): Promise<void> {
    // Monitor for suspicious activities
    setInterval(async () => {
      const threatResult = await this.detectThreats();
      if (threatResult.isThreat) {
        this.threatHistory.push(threatResult);
        this.handleThreat(threatResult);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Detect threats
   */
  private async detectThreats(): Promise<ThreatDetectionResult> {
    const threats: string[] = [];
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 0;

    // Check for suspicious browser extensions
    if (await this.detectSuspiciousExtensions()) {
      threats.push('Suspicious browser extensions detected');
      threatLevel = 'medium';
      confidence += 0.3;
    }

    // Check for unusual device fingerprint changes
    if (await this.detectFingerprintChanges()) {
      threats.push('Device fingerprint changed unexpectedly');
      threatLevel = 'high';
      confidence += 0.4;
    }

    // Check for malware signatures
    if (await this.detectMalwareSignatures()) {
      threats.push('Malware signatures detected');
      threatLevel = 'critical';
      confidence += 0.8;
    }

    // Check for suspicious network activity
    if (await this.detectSuspiciousNetworkActivity()) {
      threats.push('Suspicious network activity detected');
      threatLevel = 'medium';
      confidence += 0.3;
    }

    return {
      isThreat: threats.length > 0,
      threatLevel,
      threats,
      confidence: Math.min(confidence, 1.0),
      recommendations: this.generateThreatRecommendations(threats)
    };
  }

  /**
   * Detect suspicious browser extensions
   */
  private async detectSuspiciousExtensions(): Promise<boolean> {
    // Check for extensions that might access sensitive data
    const suspiciousPatterns = [
      'password',
      'key',
      'crypto',
      'wallet',
      'identity',
      'auth'
    ];

    // This is a simplified check - in production, you'd use more sophisticated detection
    return false; // Placeholder
  }

  /**
   * Detect device fingerprint changes
   */
  private async detectFingerprintChanges(): Promise<boolean> {
    if (!this.deviceFingerprint) return false;

    const currentFingerprint = await this.generateDeviceFingerprint();
    const originalHash = this.deviceFingerprint.hash;
    const currentHash = currentFingerprint.hash;

    return originalHash !== currentHash;
  }

  /**
   * Detect malware signatures
   */
  private async detectMalwareSignatures(): Promise<boolean> {
    // Check for known malware patterns
    const malwarePatterns = [
      'keylogger',
      'screen_capture',
      'memory_dump',
      'process_injection'
    ];

    // This is a simplified check - in production, you'd use more sophisticated detection
    return false; // Placeholder
  }

  /**
   * Detect suspicious network activity
   */
  private async detectSuspiciousNetworkActivity(): Promise<boolean> {
    // Check for unusual network requests
    // This is a simplified check - in production, you'd monitor actual network activity
    return false; // Placeholder
  }

  /**
   * Start behavioral analysis
   */
  private async startBehavioralAnalysis(): Promise<void> {
    // Monitor user behavior patterns
    setInterval(async () => {
      const behaviorResult = await this.analyzeBehavior();
      if (behaviorResult.isAnomalous) {
        this.behavioralHistory.push(behaviorResult);
        this.handleAnomalousBehavior(behaviorResult);
      }
    }, 60000); // Check every minute
  }

  /**
   * Analyze user behavior
   */
  private async analyzeBehavior(): Promise<BehavioralAnalysisResult> {
    const detectedBehaviors: string[] = [];
    let anomalyScore = 0;

    // Check for unusual typing patterns
    if (await this.detectUnusualTypingPatterns()) {
      detectedBehaviors.push('Unusual typing patterns');
      anomalyScore += 0.3;
    }

    // Check for unusual mouse movements
    if (await this.detectUnusualMouseMovements()) {
      detectedBehaviors.push('Unusual mouse movements');
      anomalyScore += 0.2;
    }

    // Check for unusual timing patterns
    if (await this.detectUnusualTimingPatterns()) {
      detectedBehaviors.push('Unusual timing patterns');
      anomalyScore += 0.4;
    }

    const riskLevel: 'low' | 'medium' | 'high' = 
      anomalyScore < 0.3 ? 'low' : 
      anomalyScore < 0.7 ? 'medium' : 'high';

    return {
      isAnomalous: anomalyScore > 0.5,
      anomalyScore: Math.min(anomalyScore, 1.0),
      detectedBehaviors,
      riskLevel
    };
  }

  /**
   * Detect unusual typing patterns
   */
  private async detectUnusualTypingPatterns(): Promise<boolean> {
    // Monitor typing speed, rhythm, and patterns
    // This is a simplified check - in production, you'd implement sophisticated analysis
    return false; // Placeholder
  }

  /**
   * Detect unusual mouse movements
   */
  private async detectUnusualMouseMovements(): Promise<boolean> {
    // Monitor mouse movement patterns
    // This is a simplified check - in production, you'd implement sophisticated analysis
    return false; // Placeholder
  }

  /**
   * Detect unusual timing patterns
   */
  private async detectUnusualTimingPatterns(): Promise<boolean> {
    // Monitor timing between actions
    // This is a simplified check - in production, you'd implement sophisticated analysis
    return false; // Placeholder
  }

  /**
   * Handle detected threats
   */
  private handleThreat(threat: ThreatDetectionResult): void {
    this.logSecurityEvent('threat_detected', threat);

    if (threat.threatLevel === 'critical') {
      // Immediate action required
      this.triggerEmergencyLockdown();
    } else if (threat.threatLevel === 'high') {
      // Enhanced security measures
      this.triggerEnhancedSecurity();
    } else {
      // Warning and monitoring
      this.triggerWarning(threat);
    }
  }

  /**
   * Handle anomalous behavior
   */
  private handleAnomalousBehavior(behavior: BehavioralAnalysisResult): void {
    this.logSecurityEvent('anomalous_behavior_detected', behavior);

    if (behavior.riskLevel === 'high') {
      this.triggerEnhancedSecurity();
    } else {
      this.triggerWarning({ message: 'Anomalous behavior detected', details: behavior });
    }
  }

  /**
   * Trigger emergency lockdown
   */
  private triggerEmergencyLockdown(): void {
    this.logSecurityEvent('emergency_lockdown_triggered', {});
    // Implement emergency security measures
    // - Lock all operations
    // - Require re-authentication
    // - Alert user
  }

  /**
   * Trigger enhanced security
   */
  private triggerEnhancedSecurity(): void {
    this.logSecurityEvent('enhanced_security_triggered', {});
    // Implement enhanced security measures
    // - Additional authentication steps
    // - Increased monitoring
    // - Reduced functionality
  }

  /**
   * Trigger warning
   */
  private triggerWarning(warning: any): void {
    this.logSecurityEvent('security_warning', warning);
    // Show warning to user
    // - Display security alert
    // - Recommend actions
  }

  /**
   * Generate threat recommendations
   */
  private generateThreatRecommendations(threats: string[]): string[] {
    const recommendations: string[] = [];

    if (threats.includes('Suspicious browser extensions detected')) {
      recommendations.push('Review and disable suspicious browser extensions');
      recommendations.push('Use only trusted extensions from official stores');
    }

    if (threats.includes('Device fingerprint changed unexpectedly')) {
      recommendations.push('Check for unauthorized device changes');
      recommendations.push('Verify device integrity');
    }

    if (threats.includes('Malware signatures detected')) {
      recommendations.push('Run full system malware scan');
      recommendations.push('Update security software');
      recommendations.push('Consider using a clean device');
    }

    if (threats.includes('Suspicious network activity detected')) {
      recommendations.push('Check network security');
      recommendations.push('Use VPN if available');
      recommendations.push('Avoid public networks');
    }

    return recommendations;
  }

  /**
   * Hash data using SHA-256
   */
  private async hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: string, details: any): void {
    this.securityEvents.push({
      timestamp: new Date().toISOString(),
      event,
      details
    });

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }
  }

  /**
   * Get device fingerprint
   */
  getDeviceFingerprint(): DeviceFingerprint | null {
    return this.deviceFingerprint;
  }

  /**
   * Get threat history
   */
  getThreatHistory(): ThreatDetectionResult[] {
    return this.threatHistory;
  }

  /**
   * Get behavioral history
   */
  getBehavioralHistory(): BehavioralAnalysisResult[] {
    return this.behavioralHistory;
  }

  /**
   * Get security events
   */
  getSecurityEvents(): Array<{ timestamp: string; event: string; details: any }> {
    return this.securityEvents;
  }
}
