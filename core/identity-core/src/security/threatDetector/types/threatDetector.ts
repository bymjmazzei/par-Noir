export interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  userId: string;
  dashboardId: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high';
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface ThreatReport {
  threats: Threat[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  timestamp: string;
}

export interface Threat {
  type: 'low' | 'medium' | 'high';
  event: SecurityEvent;
  timestamp: string;
  confidence: number;
  description: string;
}

export interface ThreatPattern {
  pattern: RegExp;
  risk: 'low' | 'medium' | 'high';
  description: string;
  threshold: number;
}

export interface ThreatStats {
  totalThreats: number;
  threatsByLevel: Record<string, number>;
  threatsByType: Record<string, number>;
  averageConfidence: number;
  lastThreat: string;
  highRiskThreats: number;
  mediumRiskThreats: number;
  lowRiskThreats: number;
}
