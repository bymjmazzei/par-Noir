import type { ReactNode } from 'react';
import type { DashboardData, TimeWindow, TopLevelView } from '../types';
import { exportViewAsCsv, exportViewAsJson } from '../services/exportService';
import {
  apiStatusKpiClass,
  criticalCountKpiClass,
  cx,
  errorRateKpiClass,
  warningAnomalyCountClass
} from '../statusUi';

type Props = {
  view: TopLevelView;
  title: string;
  window: TimeWindow;
  data: DashboardData;
  children: ReactNode;
};

function fmtCents(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${(n / 100).toFixed(2)}`;
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '0.00%';
  return `${(v * 100).toFixed(2)}%`;
}

export function ViewFrame({ view, title, window, data, children }: Props) {
  const allProbes = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
  const success = allProbes.filter((p) => p.ok).length;
  const errorRate = allProbes.length > 0 ? (allProbes.length - success) / allProbes.length : 0;
  const net = data.periods.reduce((acc, p) => acc + p.rCents, 0);
  const probeBlockOk = allProbes.length === 0 || success === allProbes.length;
  const criticalCount = data.anomalies.filter((a) => a.severity === 'critical').length;

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        <div className="actions">
          <button onClick={() => exportViewAsCsv(view, window, data)}>Export CSV</button>
          <button onClick={() => exportViewAsJson(view, window, data)}>Export JSON</button>
        </div>
      </header>
      <div className="kpi-grid">
        <div className={cx('kpi-card', apiStatusKpiClass(data.health.status, data.health.ready, probeBlockOk))}>
          <span className="kpi-label">API status</span>
          <strong>{data.health.status}</strong>
        </div>
        <div className={cx('kpi-card', errorRateKpiClass(errorRate))}>
          <span className="kpi-label">Error rate</span>
          <strong>{fmtPct(errorRate)}</strong>
        </div>
        <div className="kpi-card kpi-card--neutral">
          <span className="kpi-label">Net fund (recent)</span>
          <strong>{fmtCents(net)}</strong>
        </div>
        <div className={cx('kpi-card', criticalCountKpiClass(criticalCount))}>
          <span className="kpi-label">Critical anomalies</span>
          <strong>{criticalCount}</strong>
        </div>
        <div className={cx('kpi-card', warningAnomalyCountClass(data.anomalies))}>
          <span className="kpi-label">Warning anomalies</span>
          <strong>{data.anomalies.filter((a) => a.severity === 'warning').length}</strong>
        </div>
      </div>
      {children}
    </section>
  );
}
