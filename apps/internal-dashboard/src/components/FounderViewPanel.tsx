import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';
import { severityPillClass, severityRowClass } from '../statusUi';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

export function FounderViewPanel({ data, window }: Props) {
  const social = data.socialMetrics;
  return (
    <ViewFrame view="founder" title="Founder View" window={window} data={data}>
      {social && (
        <div className="kpi-grid">
          <div className="kpi-card kpi-card--neutral"><span className="kpi-label">Total users</span><strong>{social.totalUsers}</strong></div>
          <div className="kpi-card kpi-card--neutral"><span className="kpi-label">Verified users</span><strong>{social.verifiedUsers}</strong></div>
          <div className="kpi-card kpi-card--neutral"><span className="kpi-label">Unverified users</span><strong>{social.unverifiedUsers}</strong></div>
          <div className="kpi-card kpi-card--neutral"><span className="kpi-label">Total post volume</span><strong>{social.totalPosts}</strong></div>
          <div className="kpi-card kpi-card--neutral"><span className="kpi-label">Total views</span><strong>{social.totalViews}</strong></div>
        </div>
      )}
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
              <tr key={a.id} className={severityRowClass(a.severity)}>
                <td>
                  <span className={severityPillClass(a.severity)}>{a.severity}</span>
                </td>
                <td>{a.category}</td>
                <td>{a.title}</td>
                <td>{new Date(a.detectedAt).toLocaleString()}</td>
              </tr>
            ))}
            {data.anomalies.length === 0 && (
              <tr className="tr-status-ok">
                <td colSpan={4}>
                  <span className="text-ok">No active anomalies.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ViewFrame>
  );
}
