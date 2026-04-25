import type { ApiMeta, DashboardData, TimeWindow, TopLevelView } from '../types';

function toIsoStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function metaFor(view: TopLevelView, window: TimeWindow): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    window,
    apiEndpoint: import.meta.env.VITE_API_ENDPOINT || 'http://127.0.0.1:3001',
    completeness: {
      status: 'complete',
      missingEndpoints: [],
      missingMetrics: [],
      notes: [`exported_view:${view}`]
    }
  };
}

function downloadBlob(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return 'key,value\n';
  const keys = Array.from(rows.reduce((acc, row) => {
    Object.keys(row).forEach((k) => acc.add(k));
    return acc;
  }, new Set<string>()));
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  };
  const header = keys.join(',');
  const body = rows.map((row) => keys.map((k) => esc(row[k])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function buildExportPayload(view: TopLevelView, data: DashboardData, window: TimeWindow): Record<string, unknown> {
  const kpis: Record<string, unknown> = {
    api_health_success_rate_5m: ratio(data.health.probes.filter((p) => p.endpoint === '/health' && p.ok).length, data.health.probes.filter((p) => p.endpoint === '/health').length),
    api_ready_success_rate_5m: ratio(data.health.probes.filter((p) => p.endpoint === '/health/ready' && p.ok).length, data.health.probes.filter((p) => p.endpoint === '/health/ready').length),
    api_error_rate: ratio(
      [...data.health.probes, ...Object.values(data.moduleProbes).flat()].filter((p) => !p.ok).length,
      [...data.health.probes, ...Object.values(data.moduleProbes).flat()].length
    ),
    integrity_anomaly_count: data.anomalies.length,
    integrity_critical_count: data.anomalies.filter((a) => a.severity === 'critical').length,
    fund_gross_cents_recent: sum(data.periods.map((p) => p.gCents)),
    fund_opex_cents_recent: sum(data.periods.map((p) => p.eCents)),
    fund_net_cents_recent: sum(data.periods.map((p) => p.rCents)),
    fund_bounty_verified_cents_recent: sum(data.periods.map((p) => p.bountyVerifiedCents)),
    fund_bounty_unverified_cents_recent: sum(data.periods.map((p) => p.bountyUnverifiedCents)),
    payout_available_cents: Number(data.monetizationStatus?.creatorFundPayoutAvailableCents ?? 0),
    payout_in_hold_cents: Number(data.monetizationStatus?.creatorFundPayoutInHoldCents ?? 0),
    payout_paid_cents: Number(data.monetizationStatus?.creatorFundPaidOutCents ?? 0),
    verified_and_maintenance_active_count: Number(data.monetizationStatus?.eligibleForFundAccrual ? 1 : 0)
  };

  const base = {
    meta: metaFor(view, window),
    kpis,
    sourceMap: {
      health: ['/health', '/health/ready', '/api/status'],
      monetization: ['/api/monetization/status', '/api/creator-fund/periods/recent'],
      audits: ['/api/admin/audit-events']
    }
  };

  if (view === 'health') {
    return { ...base, endpointHealthRows: [...data.health.probes, ...Object.values(data.moduleProbes).flat()] };
  }
  if (view === 'security') {
    const permissionFailures = Object.values(data.moduleProbes).flat().filter((p) => p.status === 401 || p.status === 403);
    return { ...base, permissionFailures, riskEvents: data.auditEvents.slice(0, 50) };
  }
  if (view === 'financials') {
    return { ...base, periods: data.periods, allocationSummary: Object.values(data.allocationByPeriod) };
  }
  if (view === 'investor') {
    return {
      ...base,
      highlights: [
        { label: 'Uptime Sec', value: data.health.processUptimeSec ?? 0, trend: 'n/a', status: data.health.status },
        { label: 'Net Fund (cents)', value: kpis.fund_net_cents_recent, trend: 'n/a', status: 'ok' },
        { label: 'Critical Anomalies', value: kpis.integrity_critical_count, trend: 'n/a', status: 'watch' }
      ],
      riskSummary: summarizeRisk(data.anomalies)
    };
  }
  if (view === 'founder') {
    return { ...base, topRisks: data.anomalies.slice(0, 20) };
  }
  return base;
}

function summarizeRisk(anomalies: DashboardData['anomalies']): Array<{ severity: string; count: number }> {
  const by = new Map<string, number>();
  for (const a of anomalies) by.set(a.severity, (by.get(a.severity) || 0) + 1);
  return [...by.entries()].map(([severity, count]) => ({ severity, count }));
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function ratio(num: number, den: number): number {
  if (!den || den <= 0) return 0;
  return Number((num / den).toFixed(4));
}

export function exportViewAsJson(view: TopLevelView, window: TimeWindow, data: DashboardData): void {
  const payload = buildExportPayload(view, data, window);
  const filename = `parnoir-${view}-${window}-${toIsoStamp(new Date())}.json`;
  downloadBlob(filename, JSON.stringify(payload, null, 2), 'application/json');
}

export function exportViewAsCsv(view: TopLevelView, window: TimeWindow, data: DashboardData): void {
  const payload = buildExportPayload(view, data, window);
  const metaRows: Array<Record<string, unknown>> = [{ section: 'meta', ...((payload.meta as Record<string, unknown>) || {}) }];
  const kpiRows: Array<Record<string, unknown>> = Object.entries((payload.kpis as Record<string, unknown>) || {}).map(([k, v]) => ({
    section: 'kpi',
    key: k,
    value: v
  }));
  const rows = [...metaRows, ...kpiRows];
  const filename = `parnoir-${view}-${window}-${toIsoStamp(new Date())}.csv`;
  downloadBlob(filename, toCsv(rows), 'text/csv');
}
