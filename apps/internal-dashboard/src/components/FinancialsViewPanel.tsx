import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function FinancialsViewPanel({ data, window }: Props) {
  return (
    <ViewFrame view="financials" title="Financials View" window={window} data={data}>
      <div className="split-grid">
        <div className="table-wrap">
          <h3>Recent Fund Periods</h3>
          <table>
            <thead>
              <tr>
                <th>End</th>
                <th>G</th>
                <th>E</th>
                <th>R</th>
                <th>90 / 10</th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.periodEnd).toLocaleDateString()}</td>
                  <td>{money(p.gCents)}</td>
                  <td>{money(p.eCents)}</td>
                  <td>{money(p.rCents)}</td>
                  <td>{money(p.bountyVerifiedCents)} / {money(p.bountyUnverifiedCents)}</td>
                </tr>
              ))}
              {data.periods.length === 0 && (
                <tr><td colSpan={5}>No periods available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <h3>Allocation Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Rows</th>
                <th>Total Allocated</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(data.allocationByPeriod).map((a) => (
                <tr key={a.periodId}>
                  <td>{a.periodId.slice(0, 8)}...</td>
                  <td>{a.allocationRows}</td>
                  <td>{money(a.totalAllocationCents)}</td>
                  <td>{a.anomalyFlags.join(', ') || 'none'}</td>
                </tr>
              ))}
              {Object.keys(data.allocationByPeriod).length === 0 && (
                <tr><td colSpan={4}>No allocation summaries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ViewFrame>
  );
}
