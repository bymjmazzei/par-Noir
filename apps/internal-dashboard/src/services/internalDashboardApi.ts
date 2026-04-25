import { API_ENDPOINT } from '../config/api';
import type { AllocationSummary, AuditAnomaly, DashboardData, PeriodSummary, ProbeResult } from '../types';

type Credentials = {
  adminApiKey: string;
};

let socialMetricsEndpointSupported = true;
let analyticsV2EndpointSupported = true;

async function requestJson(
  path: string,
  creds: Credentials,
  opts?: { admin?: boolean }
): Promise<{ ok: boolean; status: number | null; data: any; latencyMs: number; error?: string }> {
  const url = `${API_ENDPOINT}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.admin && creds.adminApiKey.trim()) {
    headers['X-Admin-Key'] = creds.adminApiKey.trim();
  }
  const start = performance.now();
  try {
    const res = await fetch(url, { headers });
    const latencyMs = Math.max(0, Math.round(performance.now() - start));
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, latencyMs };
  } catch (e) {
    const latencyMs = Math.max(0, Math.round(performance.now() - start));
    return { ok: false, status: null, data: null, latencyMs, error: e instanceof Error ? e.message : 'network_error' };
  }
}

function toProbe(endpoint: string, out: { ok: boolean; status: number | null; latencyMs: number; error?: string }): ProbeResult {
  return {
    endpoint,
    ok: out.ok,
    status: out.status,
    latencyMs: out.latencyMs,
    timestamp: new Date().toISOString(),
    error: out.error
  };
}

function periodFromRaw(raw: Record<string, unknown>): PeriodSummary {
  return {
    id: String(raw.id),
    periodStart: String(raw.periodStart ?? ''),
    periodEnd: String(raw.periodEnd ?? ''),
    periodTz: raw.periodTz != null ? String(raw.periodTz) : null,
    gCents: Number(raw.gCents ?? 0),
    eCents: Number(raw.eCents ?? 0),
    rCents: Number(raw.rCents ?? 0),
    bountyVerifiedCents: Number(raw.bountyVerifiedCents ?? 0),
    bountyUnverifiedCents: Number(raw.bountyUnverifiedCents ?? 0)
  };
}

function buildAnomalies(periods: PeriodSummary[], allocations: Record<string, AllocationSummary>, probes: ProbeResult[]): AuditAnomaly[] {
  const out: AuditAnomaly[] = [];
  for (const p of periods) {
    const a = allocations[p.id];
    const bounty = p.bountyVerifiedCents + p.bountyUnverifiedCents;
    if (bounty > 0 && (!a || a.allocationRows === 0)) {
      out.push({
        id: `alloc-empty-${p.id}`,
        severity: 'critical',
        category: 'financial',
        title: 'Closed period has bounty pool but zero allocation rows',
        detectedAt: new Date().toISOString(),
        source: '/api/creator-fund/periods/:periodId/allocations'
      });
    }
    if (p.gCents < p.eCents && p.rCents !== 0) {
      out.push({
        id: `r-mismatch-${p.id}`,
        severity: 'warning',
        category: 'financial',
        title: 'R should be zero when E exceeds G',
        detectedAt: new Date().toISOString(),
        source: '/api/creator-fund/periods/recent'
      });
    }
  }
  for (const pr of probes) {
    if (!pr.ok) {
      out.push({
        id: `probe-fail-${pr.endpoint}-${pr.timestamp}`,
        severity: pr.status === 401 || pr.status === 403 ? 'warning' : 'critical',
        category: 'technical',
        title: `Endpoint probe failed: ${pr.endpoint}`,
        detectedAt: pr.timestamp,
        source: pr.endpoint
      });
    }
  }
  return out;
}

export async function loadDashboardData(creds: Credentials): Promise<DashboardData> {
  if (!creds.adminApiKey.trim()) {
    throw new Error('Admin API key required');
  }
  const adminCheck = await requestJson('/api/admin/audit-events?limit=1', creds, { admin: true });
  if (!adminCheck.ok) {
    throw new Error(`Admin key rejected (status ${adminCheck.status ?? 'network'})`);
  }

  const healthRes = await requestJson('/health', creds);
  const readyRes = await requestJson('/health/ready', creds);
  const statusRes = await requestJson('/api/status', creds);
  const periodsRes = await requestJson('/api/admin/creator-fund/periods/recent?limit=8', creds, { admin: true });
  const auditRes = await requestJson('/api/admin/audit-events?limit=100', creds, { admin: true });
  const socialMetricsRes = socialMetricsEndpointSupported
    ? await requestJson('/api/admin/social/metrics', creds, { admin: true })
    : null;
  const analyticsV2Res = analyticsV2EndpointSupported
    ? await requestJson('/api/admin/dashboard/v2', creds, { admin: true })
    : null;
  if (socialMetricsRes?.status === 404) {
    socialMetricsEndpointSupported = false;
  }
  if (analyticsV2Res?.status === 404) {
    analyticsV2EndpointSupported = false;
  }

  const healthProbes = [
    toProbe('/health', healthRes),
    toProbe('/health/ready', readyRes),
    toProbe('/api/status', statusRes)
  ];

  const moduleProbeDefs: Array<{ bucket: string; path: string; admin?: boolean }> = [
    { bucket: 'identity', path: '/api/admin/audit-events?limit=5', admin: true },
    { bucket: 'content_social', path: '/api/feeds' },
    { bucket: 'messaging', path: '/api/status' },
    { bucket: 'monetization', path: '/api/admin/creator-fund/periods/recent?limit=4', admin: true },
    { bucket: 'security', path: '/api/admin/audit-events?limit=20', admin: true }
  ];

  const moduleProbes: Record<string, ProbeResult[]> = {};
  for (const def of moduleProbeDefs) {
    const out = await requestJson(def.path, creds, { admin: def.admin });
    const pr = toProbe(def.path, out);
    if (!moduleProbes[def.bucket]) moduleProbes[def.bucket] = [];
    moduleProbes[def.bucket].push(pr);
  }

  const periodsRaw = Array.isArray(periodsRes.data?.periods) ? (periodsRes.data.periods as Array<Record<string, unknown>>) : [];
  const periods = periodsRaw.map(periodFromRaw);

  const allocationByPeriod: Record<string, AllocationSummary> = {};
  for (const p of periods) {
    const allocRes = await requestJson(`/api/creator-fund/periods/${encodeURIComponent(p.id)}/allocations`, creds, { admin: true });
    const rows = Array.isArray(allocRes.data?.allocations) ? allocRes.data.allocations : [];
    const totalAllocationCents = rows.reduce((acc: number, row: any) => acc + Number(row?.allocationCents ?? row?.allocation_cents ?? 0), 0);
    const anomalyFlags: string[] = [];
    if (!allocRes.ok) anomalyFlags.push(`fetch_failed_${allocRes.status ?? 'network'}`);
    if (rows.length === 0 && p.bountyVerifiedCents + p.bountyUnverifiedCents > 0) anomalyFlags.push('missing_allocations_for_positive_bounty');
    allocationByPeriod[p.id] = {
      periodId: p.id,
      allocationRows: rows.length,
      totalAllocationCents,
      anomalyFlags
    };
  }

  const allProbes = [...healthProbes, ...Object.values(moduleProbes).flat()];
  const anomalies = buildAnomalies(periods, allocationByPeriod, allProbes);

  return {
    health: {
      processUptimeSec: Number(healthRes.data?.uptime ?? 0) || null,
      status: String(healthRes.data?.status ?? 'unknown'),
      ready: readyRes.ok ? true : null,
      probes: healthProbes
    },
    moduleProbes,
    monetizationStatus: null,
    periods,
    allocationByPeriod,
    auditEvents: Array.isArray(auditRes.data?.events) ? (auditRes.data.events as Array<Record<string, unknown>>) : [],
    anomalies,
    socialMetrics: socialMetricsRes?.ok
      ? {
          totalUsers: Number(socialMetricsRes.data?.totals?.users?.total ?? 0),
          verifiedUsers: Number(socialMetricsRes.data?.totals?.users?.verified ?? 0),
          unverifiedUsers: Number(socialMetricsRes.data?.totals?.users?.unverified ?? 0),
          totalPosts: Number(socialMetricsRes.data?.totals?.posts?.total ?? 0),
          totalViews: Number(socialMetricsRes.data?.totals?.engagement?.views ?? 0),
          totalLikes: Number(socialMetricsRes.data?.totals?.engagement?.likes ?? 0),
          totalComments: Number(socialMetricsRes.data?.totals?.engagement?.comments ?? 0),
          totalShares: Number(socialMetricsRes.data?.totals?.engagement?.shares ?? 0),
          postsByType: {
            text: Number(socialMetricsRes.data?.totals?.posts?.byType?.text ?? 0),
            media: Number(socialMetricsRes.data?.totals?.posts?.byType?.media ?? 0),
            poll: Number(socialMetricsRes.data?.totals?.posts?.byType?.poll ?? 0),
            form: Number(socialMetricsRes.data?.totals?.posts?.byType?.form ?? 0),
            top: Number(socialMetricsRes.data?.totals?.posts?.byType?.top ?? 0),
            fileLinked: Number(socialMetricsRes.data?.totals?.posts?.byType?.fileLinked ?? 0),
          },
        }
      : null,
    socialMetricsStatus:
      socialMetricsRes?.status === 404
        ? 'Social metrics disabled: connected API does not expose /api/admin/social/metrics yet.'
        : !socialMetricsEndpointSupported
          ? 'Social metrics disabled for this session (endpoint unsupported on connected API).'
          : null,
    analyticsV2: analyticsV2Res?.ok
      ? {
          metricVersion: String(analyticsV2Res.data?.metricVersion ?? 'v2'),
          generatedAt: String(analyticsV2Res.data?.generatedAt ?? new Date().toISOString()),
          dataLagSec: Number(analyticsV2Res.data?.dataLagSec ?? 0),
          completeness: {
            status: (analyticsV2Res.data?.completeness?.status as 'complete' | 'partial' | 'unavailable') ?? 'partial',
            missingEndpoints: Array.isArray(analyticsV2Res.data?.completeness?.missingEndpoints) ? analyticsV2Res.data.completeness.missingEndpoints.map(String) : [],
            missingMetrics: Array.isArray(analyticsV2Res.data?.completeness?.missingMetrics) ? analyticsV2Res.data.completeness.missingMetrics.map(String) : [],
            notes: Array.isArray(analyticsV2Res.data?.completeness?.notes) ? analyticsV2Res.data.completeness.notes.map(String) : [],
          },
          kpiRegistry: Array.isArray(analyticsV2Res.data?.kpiRegistry)
            ? analyticsV2Res.data.kpiRegistry.map((k: any) => ({
                id: String(k.id),
                label: String(k.label),
                owner: String(k.owner),
                formula: String(k.formula),
                source: Array.isArray(k.source) ? k.source.map(String) : [],
                freshnessSlaSec: Number(k.freshnessSlaSec ?? 3600),
                thresholds: {
                  goodGte: k.thresholds?.goodGte != null ? Number(k.thresholds.goodGte) : undefined,
                  warnGte: k.thresholds?.warnGte != null ? Number(k.thresholds.warnGte) : undefined,
                  badLt: k.thresholds?.badLt != null ? Number(k.thresholds.badLt) : undefined,
                },
                decisionPlaybook: String(k.decisionPlaybook ?? ''),
              }))
            : [],
          kpiValues: typeof analyticsV2Res.data?.kpiValues === 'object' && analyticsV2Res.data?.kpiValues
            ? Object.fromEntries(
                Object.entries(analyticsV2Res.data.kpiValues).map(([key, value]) => [
                  key,
                  {
                    value: Number((value as any)?.value ?? 0),
                    tone: (String((value as any)?.tone ?? 'neutral') as 'ok' | 'warn' | 'bad' | 'neutral'),
                    stale: Boolean((value as any)?.stale),
                    notes: (value as any)?.notes != null ? String((value as any).notes) : undefined,
                  },
                ]),
              )
            : {},
          funnel: {
            steps: Array.isArray(analyticsV2Res.data?.funnel?.steps)
              ? analyticsV2Res.data.funnel.steps.map((s: any) => ({
                  key: String(s.key),
                  label: String(s.label),
                  value: Number(s.value ?? 0),
                  conversionFromPrev: s.conversionFromPrev == null ? null : Number(s.conversionFromPrev),
                }))
              : [],
            biggestDropStep: analyticsV2Res.data?.funnel?.biggestDropStep != null ? String(analyticsV2Res.data.funnel.biggestDropStep) : null,
          },
          cohorts: {
            weekly: Array.isArray(analyticsV2Res.data?.cohorts?.weekly)
              ? analyticsV2Res.data.cohorts.weekly.map((c: any) => ({
                  cohortWeek: String(c.cohortWeek),
                  size: Number(c.size ?? 0),
                  d1: Number(c.d1 ?? 0),
                  d7: Number(c.d7 ?? 0),
                  d30: Number(c.d30 ?? 0),
                }))
              : [],
          },
          quality: {
            verifiedEngagementShare: Number(analyticsV2Res.data?.quality?.verifiedEngagementShare ?? 0),
            uniqueEngagerRatio: Number(analyticsV2Res.data?.quality?.uniqueEngagerRatio ?? 0),
            topCreatorShareViews: Number(analyticsV2Res.data?.quality?.topCreatorShareViews ?? 0),
            suspiciousEngagementRatio: Number(analyticsV2Res.data?.quality?.suspiciousEngagementRatio ?? 0),
            anomalyConfidenceScore: Number(analyticsV2Res.data?.quality?.anomalyConfidenceScore ?? 0),
          },
          economics: {
            payoutHoldRatio: Number(analyticsV2Res.data?.economics?.payoutHoldRatio ?? 0),
            medianAllocationCents: Number(analyticsV2Res.data?.economics?.medianAllocationCents ?? 0),
            p90AllocationCents: Number(analyticsV2Res.data?.economics?.p90AllocationCents ?? 0),
            allocationConcentrationTop10Share: Number(analyticsV2Res.data?.economics?.allocationConcentrationTop10Share ?? 0),
            netFundVolatility: Number(analyticsV2Res.data?.economics?.netFundVolatility ?? 0),
          },
          reliability: {
            apiSuccessRate: Number(analyticsV2Res.data?.reliability?.apiSuccessRate ?? 0),
            p95LatencyMs: Number(analyticsV2Res.data?.reliability?.p95LatencyMs ?? 0),
            p99LatencyMs: Number(analyticsV2Res.data?.reliability?.p99LatencyMs ?? 0),
            adminProbeFailureRate: Number(analyticsV2Res.data?.reliability?.adminProbeFailureRate ?? 0),
            incidentCount24h: Number(analyticsV2Res.data?.reliability?.incidentCount24h ?? 0),
            userImpactSummary: String(analyticsV2Res.data?.reliability?.userImpactSummary ?? 'n/a'),
          },
        }
      : null,
    analyticsV2Status:
      analyticsV2Res?.status === 404
        ? 'Dashboard V2 analytics disabled: connected API does not expose /api/admin/dashboard/v2 yet.'
        : !analyticsV2EndpointSupported
          ? 'Dashboard V2 analytics disabled for this session (endpoint unsupported on connected API).'
          : null,
  };
}
