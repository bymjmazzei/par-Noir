import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';
import { probeRowClass } from '../statusUi';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

export function HealthViewPanel({ data, window }: Props) {
  const rows = [...data.health.probes, ...Object.values(data.moduleProbes).flat()];
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
    </ViewFrame>
  );
}
