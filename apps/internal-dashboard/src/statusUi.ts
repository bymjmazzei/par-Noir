import type { AuditAnomaly, DashboardData, ProbeResult, Severity } from './types';

export type RollupTone = 'ok' | 'warn' | 'bad';

export function ecosystemRollup(data: DashboardData, queryableWarn: boolean): RollupTone {
  const allProbes = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
  if (allProbes.some((p) => !p.ok)) return 'bad';
  if (data.anomalies.some((a) => a.severity === 'critical')) return 'bad';
  if (data.anomalies.some((a) => a.severity === 'warning') || queryableWarn) return 'warn';
  return 'ok';
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** KPI strip on ViewFrame / Investor: API-reported status + probes. */
export function apiStatusKpiClass(status: string, ready: boolean | null, allProbesOk: boolean): string {
  if (!allProbesOk) return 'kpi-card--bad';
  if (ready === false) return 'kpi-card--warn';
  const s = status.toLowerCase();
  if (s === 'ok' || s === 'healthy' || s === 'up' || s === 'running' || s === 'live') return 'kpi-card--ok';
  if (s === 'unknown' || s === 'degraded' || s === '') return 'kpi-card--warn';
  return 'kpi-card--bad';
}

export function errorRateKpiClass(rate: number): string {
  if (rate <= 0) return 'kpi-card--ok';
  if (rate < 0.2) return 'kpi-card--warn';
  return 'kpi-card--bad';
}

export function criticalCountKpiClass(count: number): string {
  if (count <= 0) return 'kpi-card--ok';
  return 'kpi-card--bad';
}

export function warningAnomalyCountClass(anomalies: AuditAnomaly[]): string {
  const w = anomalies.filter((a) => a.severity === 'warning').length;
  if (w <= 0) return 'kpi-card--ok';
  return 'kpi-card--warn';
}

export function probeRowClass(ok: boolean): string {
  return ok ? 'tr-status-ok' : 'tr-status-bad';
}

export function severityRowClass(severity: Severity): string {
  if (severity === 'critical') return 'tr-status-bad';
  if (severity === 'warning') return 'tr-status-warn';
  return 'tr-status-info';
}

export function severityPillClass(severity: Severity): string {
  if (severity === 'critical') return 'pill pill--bad';
  if (severity === 'warning') return 'pill pill--warn';
  return 'pill pill--info';
}

export function allocationRowClass(flags: string[]): string {
  if (flags.length === 0) return 'tr-status-ok';
  if (flags.some((f) => f.startsWith('fetch_failed'))) return 'tr-status-bad';
  return 'tr-status-warn';
}

export function moduleProbeSummary(probes: ProbeResult[]): { ok: boolean; fail: number } {
  const fail = probes.filter((p) => !p.ok).length;
  return { ok: fail === 0, fail };
}

export function textToneClass(ok: boolean, unknown?: boolean): string {
  if (unknown) return 'text-warn';
  return ok ? 'text-ok' : 'text-bad';
}
