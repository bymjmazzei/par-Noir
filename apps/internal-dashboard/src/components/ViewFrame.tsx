import type { ReactNode } from 'react';
import type { DashboardData, TimeWindow, TopLevelView } from '../types';
import { exportViewAsCsv, exportViewAsJson } from '../services/exportService';

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
        <div className="kpi-card">
          <span className="kpi-label">API status</span>
          <strong>{data.health.status}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Error rate</span>
          <strong>{fmtPct(errorRate)}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Net fund (recent)</span>
          <strong>{fmtCents(net)}</strong>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Critical anomalies</span>
          <strong>{data.anomalies.filter((a) => a.severity === 'critical').length}</strong>
        </div>
      </div>
      {children}
    </section>
  );
}
