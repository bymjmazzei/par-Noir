import { API_ENDPOINT } from '../config/api';
import type { AllocationSummary, AuditAnomaly, DashboardData, PeriodSummary, ProbeResult } from '../types';

type Credentials = {
  bearerToken: string;
  adminApiKey: string;
};

async function requestJson(
  path: string,
  creds: Credentials,
  opts?: { admin?: boolean; auth?: boolean }
): Promise<{ ok: boolean; status: number | null; data: any; latencyMs: number; error?: string }> {
  const url = `${API_ENDPOINT}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.auth && creds.bearerToken.trim()) {
    headers.Authorization = `Bearer ${creds.bearerToken.trim()}`;
  }
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
  const healthRes = await requestJson('/health', creds);
  const readyRes = await requestJson('/health/ready', creds);
  const statusRes = await requestJson('/api/status', creds);
  const monetizationRes = await requestJson('/api/monetization/status', creds, { auth: true });
  const periodsRes = await requestJson('/api/creator-fund/periods/recent?limit=8', creds, { auth: true });
  const auditRes = await requestJson('/api/admin/audit-events?limit=100', creds, { admin: true });

  const healthProbes = [
    toProbe('/health', healthRes),
    toProbe('/health/ready', readyRes),
    toProbe('/api/status', statusRes)
  ];

  const moduleProbeDefs: Array<{ bucket: string; path: string; auth?: boolean; admin?: boolean }> = [
    { bucket: 'identity', path: '/api/monetization/status', auth: true },
    { bucket: 'content_social', path: '/api/feeds' },
    { bucket: 'messaging', path: '/api/messages', auth: true },
    { bucket: 'monetization', path: '/api/creator-fund/periods/recent?limit=4', auth: true },
    { bucket: 'security', path: '/api/admin/audit-events?limit=20', admin: true }
  ];

  const moduleProbes: Record<string, ProbeResult[]> = {};
  for (const def of moduleProbeDefs) {
    const out = await requestJson(def.path, creds, { auth: def.auth, admin: def.admin });
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
    monetizationStatus: monetizationRes.ok && monetizationRes.data && typeof monetizationRes.data === 'object'
      ? (monetizationRes.data as Record<string, unknown>)
      : null,
    periods,
    allocationByPeriod,
    auditEvents: Array.isArray(auditRes.data?.events) ? (auditRes.data.events as Array<Record<string, unknown>>) : [],
    anomalies
  };
}
