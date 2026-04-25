import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';
import { probeRowClass } from '../statusUi';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

export function HealthViewPanel({ data, window }: Props) {
  const rows = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
  const weekly = data.analyticsV2?.cohorts.weekly ?? [];
  return (
    <ViewFrame view="health" title="Health View" window={window} data={data}>
      <div className="table-wrap">
        <h3>Endpoint Health</h3>
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.endpoint}-${r.timestamp}`} className={probeRowClass(r.ok)}>
                <td>{r.endpoint}</td>
                <td>
                  {r.ok ? (
                    <span className="pill pill--ok">ok</span>
                  ) : (
                    <span className="pill pill--bad">fail ({r.status ?? 'network'})</span>
                  )}
                </td>
                <td>{r.latencyMs} ms</td>
                <td>{new Date(r.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weekly.length > 0 && (
        <div className="table-wrap">
          <h3>Weekly Retention Cohorts</h3>
          <table>
            <thead>
              <tr>
                <th>Cohort Week</th>
                <th>Size</th>
                <th>D1</th>
                <th>D7</th>
                <th>D30</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((c) => (
                <tr key={c.cohortWeek}>
                  <td>{new Date(c.cohortWeek).toLocaleDateString()}</td>
                  <td>{c.size}</td>
                  <td>{(c.d1 * 100).toFixed(1)}%</td>
                  <td>{(c.d7 * 100).toFixed(1)}%</td>
                  <td>{(c.d30 * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ViewFrame>
  );
}
