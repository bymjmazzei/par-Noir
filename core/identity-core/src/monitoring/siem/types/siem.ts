// import { cryptoWorkerManager } from '../../../encryption/cryptoWorkerManager';
export interface SIEMConfig {
  provider: string;
  apiKey: string;
  endpoint: string;
  enabled: boolean;
  debug: boolean;
  alertThreshold: number;
  correlationWindow: number;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  source: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  eventType: string;
  description: string;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  source_ip?: string;
  tination_ip?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  metadata?: Record<string, any>;
  indicators?: SecurityIndicator[];
}

export interface SecurityIndicator {
  type: 'ip' | 'domain' | 'email' | 'hash' | 'url';
  value: string;
  confidence: number;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  source: string;
}

export interface SecurityAlert {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  category: string;
  source: string;
  events: SecurityEvent[];
  indicators: SecurityIndicator[];
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  assigned_to?: string;
  notes?: string[];
  metadata?: Record<string, any>;
}

export interface ThreatIntel {
  indicator: string;
  type: 'ip' | 'domain' | 'email' | 'hash' | 'url';
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  sources: string[];
  first_seen: number;
  last_seen: number;
  tags: string[];
  description?: string;
  mitigation?: string;
  references?: string[];
}

export interface SIEMStats {
  events: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
  };
  alerts: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  threats: {
    total: number;
    byLevel: Record<string, number>;
    byType: Record<string, number>;
  };
}

export interface SecurityEventContext {
  user?: {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
  };
  source_ip?: string;
  tination_ip?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  metadata?: Record<string, any>;
}

export interface AlertContext {
  assigned_to?: string;
  notes?: string[];
  metadata?: Record<string, any>;
  correlation_rules?: string[];
  false_positive_reason?: string;
}

export interface ThreatIntelContext {
  sources: string[];
  tags: string[];
  description?: string;
  mitigation?: string;
  references?: string[];
}

export interface CorrelationRule {
  id: string;
  name: string;
  description: string;
  conditions: CorrelationCondition[];
  actions: CorrelationAction[];
  enabled: boolean;
  priority: number;
}

export interface CorrelationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
  value: any;
  timeWindow?: number;
}

export interface CorrelationAction {
  type: 'create_alert' | 'update_alert' | 'send_notification' | 'block_ip' | 'quarantine_user';
  parameters: Record<string, any>;
}

export interface SecurityMetrics {
  eventsPerSecond: number;
  alertsPerHour: number;
  threatDetectionRate: number;
  falsePositiveRate: number;
  responseTime: number;
  uptime: number;
}
