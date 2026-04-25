import type { DashboardData, TimeWindow } from '../types';
import { ViewFrame } from './ViewFrame';
import { criticalCountKpiClass, cx } from '../statusUi';

type Props = {
  data: DashboardData;
  window: TimeWindow;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InvestorViewPanel({ data, window }: Props) {
  const gross = data.periods.reduce((acc, p) => acc + p.gCents, 0);
  const net = data.periods.reduce((acc, p) => acc + p.rCents, 0);
  const payoutAvailable = Number(data.monetizationStatus?.creatorFundPayoutAvailableCents ?? 0);
  const payoutHold = Number(data.monetizationStatus?.creatorFundPayoutInHoldCents ?? 0);
  const payoutPaid = Number(data.monetizationStatus?.creatorFundPaidOutCents ?? 0);

  return (
    <ViewFrame view="investor" title="Investor View" window={window} data={data}>
      <div className="kpi-grid">
        <div className="kpi-card kpi-card--neutral">
          <span className="kpi-label">Gross fund (recent)</span>
          <strong>{money(gross)}</strong>
        </div>
        <div className="kpi-card kpi-card--neutral">
          <span className="kpi-label">Net fund (recent)</span>
          <strong>{money(net)}</strong>
        </div>
        <div className="kpi-card kpi-card--neutral">
          <span className="kpi-label">Payout available</span>
          <strong>{money(payoutAvailable)}</strong>
        </div>
        <div className={cx('kpi-card', payoutHold > 0 ? 'kpi-card--warn' : 'kpi-card--ok')}>
          <span className="kpi-label">Payout in hold</span>
          <strong>{money(payoutHold)}</strong>
        </div>
        <div className={cx('kpi-card', payoutPaid > 0 ? 'kpi-card--ok' : 'kpi-card--neutral')}>
          <span className="kpi-label">Payout paid</span>
          <strong>{money(payoutPaid)}</strong>
        </div>
        <div className={cx('kpi-card', criticalCountKpiClass(data.anomalies.filter((a) => a.severity === 'critical').length))}>
          <span className="kpi-label">Critical anomalies</span>
          <strong>{data.anomalies.filter((a) => a.severity === 'critical').length}</strong>
        </div>
      </div>
    </ViewFrame>
  );
}
