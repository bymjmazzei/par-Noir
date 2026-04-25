import type { DashboardData } from '../types';
import { cx, moduleProbeSummary } from '../statusUi';

export function ContentSocialPanel({ data }: { data: DashboardData }) {
  const probes = data.moduleProbes.content_social ?? [];
  const fail = probes.filter((p) => !p.ok).length;
  const { ok } = moduleProbeSummary(probes);
  const social = data.socialMetrics;
  return (
    <section className="panel">
      <h3>Content / Social Panel</h3>
      <p className="text-muted-soft">Probe count: {probes.length}</p>
      <p>
        Successes:{' '}
        <span className={fail === 0 ? 'text-ok' : 'text-warn'}>{probes.filter((p) => p.ok).length}</span>
      </p>
      <div
        className={cx(
          'diag-strip',
          probes.length === 0 ? 'diag-strip--warn' : ok ? 'diag-strip--ok' : 'diag-strip--bad'
        )}
      >
        {probes.length === 0 ? 'No probes for this bucket.' : ok ? 'Bucket healthy.' : 'Bucket has failing probes.'}
      </div>
      {social && (
        <div className="kpi-grid">
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Total posts</span>
            <strong>{social.totalPosts}</strong>
          </div>
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Total views</span>
            <strong>{social.totalViews}</strong>
          </div>
          <div className="kpi-card kpi-card--neutral">
            <span className="kpi-label">Users (verified / unverified)</span>
            <strong>{social.verifiedUsers} / {social.unverifiedUsers}</strong>
          </div>
        </div>
      )}
      {social && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Post Type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Text posts</td><td>{social.postsByType.text}</td></tr>
              <tr><td>Media posts</td><td>{social.postsByType.media}</td></tr>
              <tr><td>Poll posts</td><td>{social.postsByType.poll}</td></tr>
              <tr><td>Form posts</td><td>{social.postsByType.form}</td></tr>
              <tr><td>Top posts</td><td>{social.postsByType.top}</td></tr>
              <tr><td>File-linked posts</td><td>{social.postsByType.fileLinked}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
