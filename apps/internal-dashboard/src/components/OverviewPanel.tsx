import type { DashboardData } from '../types';
import { cx, ecosystemRollup } from '../statusUi';

export function OverviewPanel({ data }: { data: DashboardData }) {
  const rollup = ecosystemRollup(data, false);
  const statusClass =
    rollup === 'ok' ? 'text-ok' : rollup === 'warn' ? 'text-warn' : 'text-bad';
  return (
    <section className="panel">
      <h3>Overview</h3>
      <p>
        API status: <span className={statusClass}>{data.health.status}</span>
      </p>
      <p className="text-muted-soft">Process uptime: {data.health.processUptimeSec ?? 0}s</p>
      <p>
        Anomalies:{' '}
        <span className={data.anomalies.length === 0 ? 'text-ok' : 'text-warn'}>{data.anomalies.length}</span>
      </p>
      <div
        className={cx(
          'diag-strip',
          rollup === 'ok' ? 'diag-strip--ok' : rollup === 'warn' ? 'diag-strip--warn' : 'diag-strip--bad'
        )}
      >
        {rollup === 'ok' && 'Rollup: no probe failures or tracked anomalies.'}
        {rollup === 'warn' && 'Rollup: warnings present (review anomalies or ingestion).'}
        {rollup === 'bad' && 'Rollup: failing probes or critical anomalies — investigate.'}
      </div>
    </section>
  );
}
