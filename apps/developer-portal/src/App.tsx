import { useState } from 'react';
import { API_ENDPOINT } from './config/api';

export function App() {
  const [adminKey, setAdminKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ocClientId, setOcClientId] = useState('');
  const [ocName, setOcName] = useState('');
  const [ocDescription, setOcDescription] = useState('');
  const [ocRedirectUris, setOcRedirectUris] = useState('https://localhost/oauth-callback.html');
  const [ocScopes, setOcScopes] = useState('openid profile');

  const [akPnId, setAkPnId] = useState('');
  const [akScopes, setAkScopes] = useState('oauth,data_points,content');

  const headers = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (adminKey.trim()) {
      (h as Record<string, string>)['X-Admin-Key'] = adminKey.trim();
    }
    return h;
  };

  const registerOAuthClient = async () => {
    setError(null);
    setMessage(null);
    const redirectUris = ocRedirectUris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const scopes = ocScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/oauth/clients`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          clientId: ocClientId.trim(),
          name: ocName.trim(),
          description: ocDescription.trim() || undefined,
          redirectUris,
          scopes
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(`OAuth client registered: ${data.clientId}. Use this client_id in your app (see PN_OAUTH_INTEGRATION.md).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const createApiKey = async () => {
    setError(null);
    setMessage(null);
    const scopes = akScopes.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/admin/api-keys`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          pnId: akPnId.trim(),
          scopes: scopes.length ? scopes : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(
        `API key created (copy now; not shown again):\n\n${data.apiKey}\n\nUse as X-Api-Key for /api/v1/* (see docs).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>par Noir — Developer</h1>
      <p style={styles.muted}>
        Register OAuth clients and issue API keys. Requires <code>ADMIN_API_KEY</code> on the API (header{' '}
        <code>X-Admin-Key</code>). Production: <a href="https://developers.parnoir.com">developers.parnoir.com</a> once
        hosted. API: <code>{API_ENDPOINT}</code>
      </p>

      <label style={styles.label}>
        Admin key (X-Admin-Key)
        <input
          type="password"
          style={styles.input}
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="From server ADMIN_API_KEY"
          autoComplete="off"
        />
      </label>

      {error && <div style={styles.error}>{error}</div>}
      {message && <pre style={styles.success}>{message}</pre>}

      <section style={styles.card}>
        <h2>Register OAuth client</h2>
        <label style={styles.label}>
          clientId
          <input style={styles.input} value={ocClientId} onChange={(e) => setOcClientId(e.target.value)} />
        </label>
        <label style={styles.label}>
          name
          <input style={styles.input} value={ocName} onChange={(e) => setOcName(e.target.value)} />
        </label>
        <label style={styles.label}>
          description
          <input style={styles.input} value={ocDescription} onChange={(e) => setOcDescription(e.target.value)} />
        </label>
        <label style={styles.label}>
          redirect URIs (one per line)
          <textarea style={{ ...styles.input, minHeight: 80 }} value={ocRedirectUris} onChange={(e) => setOcRedirectUris(e.target.value)} />
        </label>
        <label style={styles.label}>
          scopes (space-separated)
          <input style={styles.input} value={ocScopes} onChange={(e) => setOcScopes(e.target.value)} />
        </label>
        <button type="button" style={styles.button} onClick={registerOAuthClient}>
          POST /oauth/clients
        </button>
      </section>

      <section style={styles.card}>
        <h2>Issue API key</h2>
        <label style={styles.label}>
          pnId (pN identifier the key is bound to)
          <input style={styles.input} value={akPnId} onChange={(e) => setAkPnId(e.target.value)} />
        </label>
        <label style={styles.label}>
          scopes (comma-separated, optional)
          <input style={styles.input} value={akScopes} onChange={(e) => setAkScopes(e.target.value)} />
        </label>
        <button type="button" style={styles.button} onClick={createApiKey}>
          POST /api/admin/api-keys
        </button>
      </section>

      <p style={styles.muted}>
        Integration guide: repo <code>docs/developer/PN_OAUTH_INTEGRATION.md</code>
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 560,
    margin: '0 auto',
    padding: 24,
    color: '#e5e5e5',
    background: '#0a0a0a',
    minHeight: '100vh'
  },
  h1: { fontSize: 22, marginBottom: 8 },
  muted: { color: '#888', fontSize: 13, lineHeight: 1.5 },
  label: { display: 'block', marginTop: 12, fontSize: 13 },
  input: {
    display: 'block',
    width: '100%',
    marginTop: 4,
    padding: 8,
    borderRadius: 6,
    border: '1px solid #333',
    background: '#111',
    color: '#eee',
    boxSizing: 'border-box'
  },
  button: {
    marginTop: 16,
    padding: '10px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600
  },
  card: {
    marginTop: 24,
    padding: 16,
    border: '1px solid #222',
    borderRadius: 8,
    background: '#111'
  },
  error: {
    marginTop: 12,
    padding: 12,
    background: '#3f1d1d',
    color: '#fca5a5',
    borderRadius: 6,
    fontSize: 14
  },
  success: {
    marginTop: 12,
    padding: 12,
    background: '#142e1f',
    color: '#86efac',
    borderRadius: 6,
    fontSize: 13,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all'
  }
};
