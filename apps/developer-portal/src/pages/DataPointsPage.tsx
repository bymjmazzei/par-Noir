import { useEffect, useMemo, useState } from 'react';
import { API_ENDPOINT } from '../config/api';

interface PublicPoint {
  id: string;
  name: string;
  description: string;
  category: string;
  dataType: string;
  zkpType: string;
  defaultPrivacy: string;
  requiredFields?: string[];
  optionalFields?: string[];
  examples: string[];
  validation?: { pattern?: string; required?: boolean };
}

export function DataPointsPage() {
  const [points, setPoints] = useState<PublicPoint[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_ENDPOINT}/api/v1/standard-data-points`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((data as { error_description?: string }).error_description || 'Failed to load catalog');
        }
        if (!cancelled) {
          setPoints(Array.isArray((data as { dataPoints?: unknown }).dataPoints) ? (data as { dataPoints: PublicPoint[] }).dataPoints : []);
          setCategories(
            typeof (data as { categories?: unknown }).categories === 'object' && (data as { categories: Record<string, string> }).categories
              ? (data as { categories: Record<string, string> }).categories
              : {}
          );
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Load failed');
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return points.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (!term) return true;
      return (
        p.id.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.zkpType.toLowerCase().includes(term)
      );
    });
  }, [points, q, cat]);

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <main className="dev-main">
      <section className="dev-intro">
        <h2 className="dev-intro-title">Standard data points</h2>
        <p>
          Public catalog from <code>GET /api/v1/standard-data-points</code> (no auth). Integrators request proofs via user
          consent and OAuth; see Guides and Layer 5.
        </p>
      </section>

      {loading && <p className="dev-muted">Loading catalog…</p>}
      {loadError && <div className="dev-alert dev-alert--error">{loadError}</div>}

      {!loading && !loadError && (
        <>
          <div className="dev-field dev-field--inline">
            <label htmlFor="dp-search">Search</label>
            <input
              id="dp-search"
              className="dev-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="id, name, zkp type…"
            />
          </div>
          <div className="dev-field dev-field--inline">
            <label htmlFor="dp-cat">Category</label>
            <select id="dp-cat" className="dev-input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All</option>
              {Object.keys(categories).map((k) => (
                <option key={k} value={k}>
                  {categories[k]}
                </option>
              ))}
            </select>
          </div>

          <p className="dev-muted" style={{ marginTop: '0.5rem' }}>
            {filtered.length} of {points.length} points
          </p>

          <ul className="dev-dp-list">
            {filtered.map((p) => (
              <li key={p.id} className="dev-dp-card">
                <button
                  type="button"
                  className="dev-dp-head"
                  onClick={() => setExpanded((x) => (x === p.id ? null : p.id))}
                >
                  <span>
                    <code>{p.id}</code> — {p.name}
                  </span>
                  <span className="dev-muted">{p.category}</span>
                </button>
                {expanded === p.id && (
                  <div className="dev-dp-body">
                    <p>{p.description}</p>
                    <p className="dev-muted">
                      ZKP: <code>{p.zkpType}</code> · type: <code>{p.dataType}</code> · privacy: {p.defaultPrivacy}
                    </p>
                    {p.requiredFields && p.requiredFields.length > 0 && (
                      <p>
                        Required fields:{' '}
                        {p.requiredFields.map((f) => (
                          <code key={f} style={{ marginRight: 6 }}>
                            {f}
                          </code>
                        ))}
                      </p>
                    )}
                    {p.optionalFields && p.optionalFields.length > 0 && (
                      <p className="dev-muted">Optional: {p.optionalFields.join(', ')}</p>
                    )}
                    {p.validation?.pattern && (
                      <p className="dev-muted">
                        Pattern: <code>{p.validation.pattern}</code>
                      </p>
                    )}
                    <p>Examples: {p.examples.join('; ')}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
