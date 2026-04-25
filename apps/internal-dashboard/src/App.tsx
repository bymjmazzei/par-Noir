import { useEffect, useMemo, useState } from 'react';
import type { DashboardData, TimeWindow, TopLevelView } from './types';
import { loadDashboardData } from './services/internalDashboardApi';
import { loadQueryableErrors } from './services/sentryIngestion';
import { FounderViewPanel } from './components/FounderViewPanel';
import { HealthViewPanel } from './components/HealthViewPanel';
import { SecurityViewPanel } from './components/SecurityViewPanel';
import { FinancialsViewPanel } from './components/FinancialsViewPanel';
import { InvestorViewPanel } from './components/InvestorViewPanel';
import { OverviewPanel } from './components/OverviewPanel';
import { SystemPanel } from './components/SystemPanel';
import { IdentityPanel } from './components/IdentityPanel';
import { ContentSocialPanel } from './components/ContentSocialPanel';
import { MessagingPanel } from './components/MessagingPanel';
import { MonetizationPanel } from './components/MonetizationPanel';
import { AuditCenterPanel } from './components/AuditCenterPanel';

const VIEWS: Array<{ id: TopLevelView; label: string }> = [
  { id: 'founder', label: 'Founder' },
  { id: 'health', label: 'Health' },
  { id: 'security', label: 'Security' },
  { id: 'financials', label: 'Financials' },
  { id: 'investor', label: 'Investor' }
];

function emptyData(): DashboardData {
  return {
    health: { processUptimeSec: null, status: 'unknown', ready: null, probes: [] },
    moduleProbes: {},
    monetizationStatus: null,
    periods: [],
    allocationByPeriod: {},
    auditEvents: [],
    anomalies: []
  };
}

export function App() {
  const [view, setView] = useState<TopLevelView>('founder');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [adminApiKey, setAdminApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryableError, setQueryableError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>(emptyData());

  const credentials = useMemo(() => ({ adminApiKey }), [adminApiKey]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await loadDashboardData(credentials);
      const errRows = await loadQueryableErrors();
      if (errRows.enabled && errRows.error) {
        setQueryableError(errRows.error);
      } else {
        setQueryableError(null);
      }
      if (errRows.enabled && errRows.rows.length > 0) {
        out.auditEvents = [...errRows.rows.map((r) => ({ event_type: `queryable_${r.level}`, timestamp: r.timestamp, details: r.message })), ...out.auditEvents];
      }
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => {
      void refresh();
    }, 60000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderTopLevelView = () => {
    switch (view) {
      case 'founder':
        return <FounderViewPanel data={data} window={timeWindow} />;
      case 'health':
        return <HealthViewPanel data={data} window={timeWindow} />;
      case 'security':
        return <SecurityViewPanel data={data} window={timeWindow} />;
      case 'financials':
        return <FinancialsViewPanel data={data} window={timeWindow} />;
      case 'investor':
        return <InvestorViewPanel data={data} window={timeWindow} />;
      default:
        return null;
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>par Noir Internal Dashboard (Local)</h1>
        <div className="controls">
          <input
            type="password"
            placeholder="Admin API key (required to unlock)"
            value={adminApiKey}
            onChange={(e) => setAdminApiKey(e.target.value)}
          />
          <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}>
            <option value="1h">1h</option>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
          <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </header>

      {error && <p className="error-banner">Load error: {error}</p>}
      {queryableError && <p className="warn-banner">Queryable error ingestion issue: {queryableError}</p>}

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

      {renderTopLevelView()}

      <section className="panel">
        <h2>Module Diagnostic Panels</h2>
        <div className="diag-grid">
          <OverviewPanel data={data} />
          <SystemPanel data={data} />
          <IdentityPanel data={data} />
          <ContentSocialPanel data={data} />
          <MessagingPanel data={data} />
          <MonetizationPanel data={data} />
          <AuditCenterPanel data={data} />
        </div>
      </section>
    </main>
  );
}
