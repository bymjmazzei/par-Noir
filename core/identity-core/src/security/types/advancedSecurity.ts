export interface SecurityConfig {
  threatDetectionEnabled: boolean;
  behavioralAnalysisEnabled: boolean;
  secureEnclaveEnabled: boolean;
  realTimeMonitoringEnabled: boolean;
  anomalyThreshold: number;
  maxFailedAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  securityLevel: 'basic' | 'standard' | 'military';
  quantumResistant: boolean;
  hsmEnabled: boolean;
  learningRate?: number;
  maxHistorySize?: number;
  reportingInterval?: number;
  certificatePinning?: Record<string, string[]>;
  threatPatterns?: Array<{ id: string; pattern: string; severity: string }>;
  rateLimits?: Record<string, number>;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  source: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  location: string;
  riskScore: number;
  mitigated: boolean;
  userId?: string;
  metadata?: {
    location?: string;
    responseTime?: number;
    threatDetected?: boolean;
    threatType?: string;
    rateLimited?: boolean;
    behavioralAnomaly?: boolean;
    anomalyDetails?: any;
    error?: string;
    originalEvent?: any;
  };
}

export interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  threatsBlocked: number;
  anomaliesDetected: number;
  lastUpdated: string;
  eventsByType: Map<string, number>;
  eventsBySeverity: Map<string, number>;
  eventsByHour: number[];
  eventsByDay: number[];
  totalResponseTime: number;
  responseCount: number;
  averageResponseTime: number;
}

export interface SecureEnclave {
  id: string;
  type: 'tpm' | 'sgx' | 'trustzone' | 'secure-enclave';
  status: 'active' | 'compromised' | 'inactive';
  capabilities: string[];
  keyStore: Map<string, any>;
  lastHealthCheck: string;
  healthScore: number;
}

export interface BehavioralProfile {
  userId: string;
  patterns: Map<string, any>;
  baseline: {
    averageLoginTime: number;
    commonLocations: string[];
    commonDevices: string[];
    commonActions: string[];
    averageTypingSpeed: number;
    averageMouseSpeed: number;
  };
  lastUpdated: string;
  lastActivity: string;
  confidence: number;
  learningData: SecurityEvent[];
  riskScore: number;
  anomalyCount: number;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  metadata?: any;
  isActive: boolean;
  ipAddress: string;
  userAgent: string;
  location: string;
}

export interface FailedAttempt {
  timestamp: string;
  metadata?: any;
  ipAddress: string;
  userAgent: string;
  location: string;
}

export interface ThreatIndicator {
  id: string;
  type: string;
  severity: string;
  timestamp: string;
  details: any;
  mitigated: boolean;
}

export interface SecurityStatus {
  overallStatus: 'secure' | 'warning' | 'critical';
  activeThreats: number;
  recentAnomalies: number;
  secureEnclaveHealth: number;
  lastIncident: string;
  recommendations: string[];
  riskScore: number;
  trend?: 'improving' | 'stable' | 'declining';
  lastUpdated?: string;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  limit: number;
}

export interface ThreatDetectionResult {
  isThreat: boolean;
  riskScore: number;
  threatType?: string;
  details: {
    timestamp: string;
    data: any;
  };
}
