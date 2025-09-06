import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
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

export interface SecurityEvent {
  timestamp: string;
  event: string;
  details: any;
}

export interface ThreatIndicator {
  type: 'extension' | 'fingerprint' | 'malware' | 'network' | 'behavior';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  timestamp: number;
}

export interface BehavioralPattern {
  type: 'typing' | 'mouse' | 'navigation' | 'timing' | 'interaction';
  pattern: any;
  baseline: any;
  deviation: number;
  timestamp: number;
}

export interface DeviceIntegrityCheck {
  component: string;
  status: 'healthy' | 'suspicious' | 'compromised';
  details: string;
  timestamp: number;
}

export interface SecurityMetrics {
  threatCount: number;
  anomalyCount: number;
  integrityScore: number;
  lastCheck: number;
  uptime: number;
}
