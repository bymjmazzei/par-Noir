export interface ThreatDetectionConfig {
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high';
  monitoringInterval: number;
  maxEventsPerHour: number;
  alertThreshold: number;
  autoBlock: boolean;
  logLevel: 'info' | 'warn' | 'error';
}

export interface SecurityEvent {
  id: string;
  type: 'authentication' | 'authorization' | 'data_access' | 'system' | 'network' | 'behavioral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  userId?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  riskScore: number;
  action?: 'blocked' | 'flagged' | 'monitored' | 'allowed';
}

export interface BehavioralProfile {
  userId: string;
  deviceId: string;
  typingPattern: number[];
  mouseMovement: number[];
  sessionDuration: number;
  loginTimes: string[];
  locations: string[];
  riskScore: number;
  lastUpdated: string;
}

export interface ThreatAlert {
  id: string;
  eventId: string;
  type: 'suspicious_activity' | 'potential_breach' | 'anomaly_detected' | 'rate_limit_exceeded';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  actionTaken?: string;
}
