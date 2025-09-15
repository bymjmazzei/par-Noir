export interface SecurityMonitorConfig {
  enabled: boolean;
  quantumResistant: any; // QuantumResistantConfig
  hsm: any; // HSMConfig
  threatDetection: any; // ThreatDetectionConfig
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

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  component: 'quantum' | 'hsm' | 'threat' | 'monitor';
  message: string;
  details?: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityAlert {
  id: string;
  timestamp: string;
  type: 'security' | 'performance' | 'availability' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  component: string;
  resolved: boolean;
  resolutionTime?: string;
  details?: any;
}

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  errors: string[];
  warnings: string[];
  metrics: Record<string, any>;
}

export interface SecurityRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'configuration' | 'upgrade' | 'maintenance' | 'security';
  title: string;
  description: string;
  action: string;
  impact: string;
  estimatedTime: string;
  implemented: boolean;
  implementedAt?: string;
}

export interface MonitoringConfig {
  healthCheckInterval: number;
  metricsCollectionInterval: number;
  alertThresholds: {
    responseTime: number;
    errorRate: number;
    uptime: number;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxEventsPerHour: number;
  maxAlertsPerHour: number;
}

export interface SecurityUpgradePath {
  from: string;
  to: string;
  steps: string[];
  requirements: string[];
  estimatedTime: string;
  risk: 'low' | 'medium' | 'high';
  rollbackPlan: string;
}
