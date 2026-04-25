import type { DashboardData } from '../types';

export function AuditCenterPanel({ data }: { data: DashboardData }) {
  return (
    <section className="panel">
      <h3>Audit Center</h3>
      <p>Audit events loaded: {data.auditEvents.length}</p>
      <p>Anomalies loaded: {data.anomalies.length}</p>
    </section>
  );
}
