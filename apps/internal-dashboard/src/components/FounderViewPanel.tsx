import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

export function FounderViewPanel({ data, window }: Props) {
  return (
    <ViewFrame view="founder" title="Founder View" window={window} data={data}>
      <div className="table-wrap">
        <h3>Top Risks</h3>
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Category</th>
              <th>Title</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {data.anomalies.slice(0, 12).map((a) => (
              <tr key={a.id}>
                <td>{a.severity}</td>
                <td>{a.category}</td>
                <td>{a.title}</td>
                <td>{new Date(a.detectedAt).toLocaleString()}</td>
              </tr>
            ))}
            {data.anomalies.length === 0 && (
              <tr>
                <td colSpan={4}>No active anomalies.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ViewFrame>
  );
}
