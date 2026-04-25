import type { DashboardData } from '../types';

export function OverviewPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel">
      <h3>Overview</h3>
      <p>API status: {data.health.status}</p>
      <p>Process uptime: {data.health.processUptimeSec ?? 0}s</p>
      <p>Anomalies: {data.anomalies.length}</p>
    </section>
  );
}
