import type { DashboardData } from '../types';
import { cx } from '../statusUi';

export function AuditCenterPanel({ data }: { data: DashboardData }) {
  const crit = data.anomalies.filter((a) => a.severity === 'critical').length;
  return (
    <section className="panel">
      <h3>Audit Center</h3>
      <p>
        Audit events loaded:{' '}
        <span className={data.auditEvents.length > 0 ? 'text-ok' : 'text-muted-soft'}>{data.auditEvents.length}</span>
      </p>
      <p>
        Anomalies loaded:{' '}
        <span className={crit > 0 ? 'text-bad' : data.anomalies.length > 0 ? 'text-warn' : 'text-ok'}>
          {data.anomalies.length}
        </span>
      </p>
      <div
        className={cx(
          'diag-strip',
          crit > 0 ? 'diag-strip--bad' : data.anomalies.length > 0 ? 'diag-strip--warn' : 'diag-strip--ok'
        )}
      >
        {crit > 0
          ? 'Critical anomalies present in engine output.'
          : data.anomalies.length > 0
            ? 'Warnings only — review founder / financials views.'
            : 'No anomalies in current snapshot.'}
      </div>
    </section>
  );
}
