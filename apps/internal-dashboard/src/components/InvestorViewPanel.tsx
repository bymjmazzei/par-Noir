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
  const social = data.socialMetrics;
  const rel = data.analyticsV2?.reliability;
  const funnel = data.analyticsV2?.funnel;

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
        {social && (
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Social reach (total views)</span>
            <strong>{social.totalViews}</strong>
          </div>
        )}
        {social && (
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">User base (verified / total)</span>
            <strong>{social.verifiedUsers} / {social.totalUsers}</strong>
          </div>
        )}
        {social && (
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Content inventory (posts)</span>
            <strong>{social.totalPosts}</strong>
          </div>
        )}
        {rel && (
          <div className={cx('kpi-card', rel.apiSuccessRate >= 0.98 ? 'kpi-card--ok' : rel.apiSuccessRate >= 0.95 ? 'kpi-card--warn' : 'kpi-card--bad')}>
            <span className="kpi-label">API success rate (24h)</span>
            <strong>{(rel.apiSuccessRate * 100).toFixed(2)}%</strong>
          </div>
        )}
        {funnel && (
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Largest funnel drop</span>
            <strong>{funnel.biggestDropStep ?? 'n/a'}</strong>
          </div>
        )}
      </div>
      {rel && (
        <p className="text-muted-soft">User impact summary: {rel.userImpactSummary}</p>
      )}
    </ViewFrame>
  );
}
