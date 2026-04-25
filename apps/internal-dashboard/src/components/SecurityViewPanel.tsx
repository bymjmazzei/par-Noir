import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

export function SecurityViewPanel({ data, window }: Props) {
  const permissionFailures = Object.values(data.moduleProbes)
    .flat()
    .filter((p) => p.status === 401 || p.status === 403);

  return (
    <ViewFrame view="security" title="Security View" window={window} data={data}>
      <div className="split-grid">
        <div className="table-wrap">
          <h3>Permission Failures</h3>
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {permissionFailures.map((r) => (
                <tr key={`${r.endpoint}-${r.timestamp}`} className="tr-status-bad">
                  <td>{r.endpoint}</td>
                  <td>
                    <span className="pill pill--bad">{r.status}</span>
                  </td>
                  <td>{r.latencyMs} ms</td>
                </tr>
              ))}
              {permissionFailures.length === 0 && (
                <tr className="tr-status-ok">
                  <td colSpan={3}>
                    <span className="text-ok">No permission failures in current probe window.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <h3>Audit Risk Events</h3>
          <table>
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data.auditEvents.slice(0, 20).map((e, i) => (
                <tr key={`${String(e.event_type ?? 'event')}-${i}`}>
                  <td>{String(e.event_type ?? 'unknown')}</td>
                  <td>{String(e.timestamp ?? e.created_at ?? '')}</td>
                </tr>
              ))}
              {data.auditEvents.length === 0 && (
                <tr>
                  <td colSpan={2}>No audit events returned.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ViewFrame>
  );
}
