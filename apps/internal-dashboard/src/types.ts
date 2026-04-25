export type TimeWindow = '1h' | '24h' | '7d' | '30d' | 'custom';
export type Severity = 'info' | 'warning' | 'critical';
export type TopLevelView = 'founder' | 'health' | 'security' | 'financials' | 'investor';

export interface ProbeResult {
  endpoint: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  timestamp: string;
  error?: string;
}

export interface ApiMeta {
  generatedAt: string;
  window: TimeWindow;
  apiEndpoint: string;
  completeness: {
    status: 'complete' | 'partial' | 'unavailable';
    missingEndpoints: string[];
    missingMetrics: string[];
    notes: string[];
  };
}

export interface AuditAnomaly {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detectedAt: string;
  source: string;
}

export interface PeriodSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodTz?: string | null;
  gCents: number;
  eCents: number;
  rCents: number;
  bountyVerifiedCents: number;
  bountyUnverifiedCents: number;
}

export interface AllocationSummary {
  periodId: string;
  allocationRows: number;
  totalAllocationCents: number;
  anomalyFlags: string[];
}

export interface DashboardData {
  health: {
    processUptimeSec: number | null;
    status: string;
    ready: boolean | null;
    probes: ProbeResult[];
  };
  moduleProbes: Record<string, ProbeResult[]>;
  monetizationStatus: Record<string, unknown> | null;
  periods: PeriodSummary[];
  allocationByPeriod: Record<string, AllocationSummary>;
  auditEvents: Array<Record<string, unknown>>;
  anomalies: AuditAnomaly[];
  socialMetrics: {
    totalUsers: number;
    verifiedUsers: number;
    unverifiedUsers: number;
    totalPosts: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    postsByType: {
      text: number;
      media: number;
      poll: number;
      form: number;
      top: number;
      fileLinked: number;
    };
  } | null;
  socialMetricsStatus: string | null;
}
