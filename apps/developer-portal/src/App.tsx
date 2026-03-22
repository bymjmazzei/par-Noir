import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { UnlockButton, LockButton } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from './config/api';
import { PN_CLIENT_ID } from './config/client';

const STORAGE_ACCESS = 'dev_portal_access_token';
const STORAGE_REFRESH = 'dev_portal_refresh_token';
const STORAGE_OAUTH_CTX = 'dev_portal_oauth';

function FieldHelp({ children }: { children: ReactNode }) {
  return <span className="dev-help">{children}</span>;
}

function getAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const t = sessionStorage.getItem(STORAGE_ACCESS);
  return t && t.trim() ? t.trim() : null;
}

function clearSession(): void {
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
  sessionStorage.removeItem(STORAGE_OAUTH_CTX);
}

interface UserInfo {
  sub?: string;
  did?: string;
  pn_identifier?: string;
  nickname?: string;
}

interface KeyRow {
  id: string;
  pnId: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

interface OAuthClientRow {
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes?: string[];
  ownerPnId?: string;
  isActive: boolean;
}

export function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<UserInfo | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [oauthClients, setOauthClients] = useState<OAuthClientRow[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ocClientId, setOcClientId] = useState('');
  const [ocName, setOcName] = useState('');
  const [ocDescription, setOcDescription] = useState('');
  const [ocRedirectUris, setOcRedirectUris] = useState('https://localhost/oauth-callback.html');
  const [ocScopes, setOcScopes] = useState('openid profile');
  const [akScopes, setAkScopes] = useState('oauth,data_points,content');

  const authHeaders = useCallback((): HeadersInit => {
    const t = getAccessToken();
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (t) {
      (h as Record<string, string>)['Authorization'] = `Bearer ${t}`;
    }
    return h;
  }, []);

  const refreshDashboard = useCallback(async () => {
    const t = getAccessToken();
    if (!t) {
      setUser(null);
      setKeys([]);
      setOauthClients([]);
      setToken(null);
      return;
    }
    setToken(t);
    try {
      const [uRes, kRes, cRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/oauth/userinfo`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API_ENDPOINT}/api/developer/api-keys`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API_ENDPOINT}/api/developer/oauth-clients`, { headers: { Authorization: `Bearer ${t}` } })
      ]);
      if (uRes.status === 401) {
        clearSession();
        setUser(null);
        setKeys([]);
        setOauthClients([]);
        setToken(null);
        return;
      }
      if (uRes.ok) {
        setUser((await uRes.json()) as UserInfo);
      } else {
        setUser(null);
      }
      if (kRes.ok) {
        const kd = (await kRes.json()) as { keys?: KeyRow[] };
        setKeys(Array.isArray(kd.keys) ? kd.keys : []);
      } else {
        setKeys([]);
      }
      if (cRes.ok) {
        const cd = (await cRes.json()) as { clients?: OAuthClientRow[] };
        setOauthClients(Array.isArray(cd.clients) ? cd.clients : []);
      } else {
        setOauthClients([]);
      }
    } catch {
      setUser(null);
      setKeys([]);
      setOauthClients([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qErr = params.get('error');
    if (qErr) {
      setError(decodeURIComponent(qErr.replace(/\+/g, ' ')));
      window.history.replaceState({}, '', window.location.pathname);
    }
    (async () => {
      setLoadingSession(true);
      await refreshDashboard();
      setLoadingSession(false);
    })();
  }, [refreshDashboard]);

  const handleBeforeUnlock = (state: string, nonce: string) => {
    setError(null);
    setMessage(null);
    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    sessionStorage.setItem(
      STORAGE_OAUTH_CTX,
      JSON.stringify({ api: API_ENDPOINT, clientId: PN_CLIENT_ID, state, nonce, redirectUri })
    );
  };

  const signOut = async () => {
    const refresh = sessionStorage.getItem(STORAGE_REFRESH);
    if (refresh) {
      try {
        await fetch(`${API_ENDPOINT}/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: refresh, token_type_hint: 'refresh_token' })
        });
      } catch {
        /* best-effort */
      }
    }
    clearSession();
    setToken(null);
    setUser(null);
    setKeys([]);
    setOauthClients([]);
    setMessage(null);
  };

  const registerOAuthClient = async () => {
    setError(null);
    setMessage(null);
    const t = getAccessToken();
    if (!t) {
      setError('Unlock your pN first (use Unlock pN above).');
      return;
    }
    const redirectUris = ocRedirectUris
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const scopes = ocScopes.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/developer/oauth-clients`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          clientId: ocClientId.trim(),
          name: ocName.trim(),
          description: ocDescription.trim() || undefined,
          redirectUris,
          scopes: scopes.length ? scopes : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(
        `OAuth client registered: ${data.clientId}. Use that value as client id in your app (see PN_OAUTH_INTEGRATION.md).`
      );
      await refreshDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const createApiKey = async () => {
    setError(null);
    setMessage(null);
    const t = getAccessToken();
    if (!t) {
      setError('Unlock your pN first (use Unlock pN above).');
      return;
    }
    const scopes = akScopes.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_ENDPOINT}/api/developer/api-keys`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          scopes: scopes.length ? scopes : undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error_description || data.error || res.statusText);
        return;
      }
      setMessage(
        `API key created — copy it now; it won’t be shown again.\n\n${data.apiKey}\n\nSend this value as header X-Api-Key when your backend calls /api/v1/... on par Noir.`
      );
      await refreshDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  const signedIn = Boolean(token) && !loadingSession;

  return (
    <div className="dev-root">
      <header className="dev-header">
        <div className="dev-header-inner">
          <img className="dev-logo" src="/branding/Par-Noir-Logo-White.png" alt="par Noir" />
          <div className="dev-header-text">
            <p className="dev-title">Developer console</p>
            <p className="dev-sub">Unlock your pN to register integrations and API access</p>
          </div>
          <div className="dev-header-actions">
            {loadingSession ? (
              <span className="dev-muted">Loading…</span>
            ) : signedIn ? (
              <>
                <span className="dev-user-pill" title={user?.did}>
                  Unlocked
                  {user?.pn_identifier || user?.sub ? ` · ${user.pn_identifier || user.sub}` : ''}
                </span>
                <LockButton
                  onLock={signOut}
                  refreshToken={sessionStorage.getItem(STORAGE_REFRESH)}
                  apiEndpoint={API_ENDPOINT}
                  className="dev-btn dev-btn--ghost dev-btn--inline-icon"
                  children="Lock"
                />
              </>
            ) : (
              <UnlockButton
                config={{
                  clientId: PN_CLIENT_ID,
                  apiEndpoint: API_ENDPOINT,
                  redirectUri: `${window.location.origin}/oauth-callback.html`,
                  scope: ['openid', 'profile'],
                }}
                onBeforeNavigate={handleBeforeUnlock}
                iconOnly
                className="dev-btn dev-btn-unlock dev-btn--header-unlock"
              />
            )}
          </div>
        </div>
      </header>

      <main className="dev-main">
        <section className="dev-intro" aria-labelledby="intro-heading">
          <h2 id="intro-heading" className="dev-intro-title">
            What this page is for
          </h2>
          <p>
            If you’re building a <strong>website or product</strong> that should talk to par Noir (for example letting your
            users unlock their pN or calling par Noir’s HTTP API), this console registers that product after you{' '}
            <strong>unlock your pN</strong> — the same OAuth flow as any other third-party app. No admin password is used in
            the browser.
          </p>
          <p>
            There are <strong>two different things</strong> below, for two different jobs:
          </p>
          <ul>
            <li>
              <strong>OAuth for your app</strong> — Registers your product so it can run the unlock / authorize flow and
              defines which return URLs are allowed afterward.
            </li>
            <li>
              <strong>Backend API key</strong> — A secret your <em>server</em> sends when it calls{' '}
              <code>/api/v1/...</code>. Keys you create here are always tied to <strong>the pN you unlocked here</strong>.
            </li>
          </ul>
          <p>
            <strong>Typical order:</strong> (1) Unlock pN. (2) Register the OAuth client for your app. (3) Create an API key
            for server-to-server calls (scoped to that identity).
          </p>
        </section>

        <p className="dev-lead">
          API base URL: <span className="dev-api-pill">{API_ENDPOINT}</span>
        </p>

        {!signedIn && !loadingSession && (
          <section className="dev-unlock-hero" aria-labelledby="unlock-cta-heading">
            <h2 id="unlock-cta-heading" className="dev-unlock-hero-title">
              Unlock pN to continue
            </h2>
            <p className="dev-unlock-hero-desc">
              Opens the secure par Noir authorize page (identity file + passcode). When you’re done, you’ll return here with
              a session — same flow as the browser and other third-party apps.
            </p>
            <UnlockButton
              config={{
                clientId: PN_CLIENT_ID,
                apiEndpoint: API_ENDPOINT,
                redirectUri: `${window.location.origin}/oauth-callback.html`,
                scope: ['openid', 'profile'],
              }}
              onBeforeNavigate={handleBeforeUnlock}
              className="dev-btn dev-btn-unlock dev-btn-unlock--large"
              children="Unlock pN"
            />
          </section>
        )}

        {error && <div className="dev-alert dev-alert--error">{error}</div>}
        {message && <div className="dev-alert dev-alert--success">{message}</div>}

        {signedIn && (
          <>
            {(keys.length > 0 || oauthClients.length > 0) && (
              <section className="dev-summary" aria-labelledby="summary-heading">
                <h2 id="summary-heading" className="dev-section-label">
                  Your registrations
                </h2>
                {oauthClients.length > 0 && (
                  <div className="dev-summary-block">
                    <h3>OAuth clients</h3>
                    <ul className="dev-summary-list">
                      {oauthClients.map((c) => (
                        <li key={c.clientId}>
                          <code>{c.clientId}</code> — {c.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {keys.length > 0 && (
                  <div className="dev-summary-block">
                    <h3>API keys</h3>
                    <ul className="dev-summary-list">
                      {keys.map((k) => (
                        <li key={k.id}>
                          <code>{k.id.slice(0, 8)}…</code>
                          {k.isActive ? '' : ' (inactive)'} · scopes: {k.scopes.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            <div className="dev-grid">
              <section className="dev-card" aria-labelledby="oauth-heading">
                <h2 id="oauth-heading">OAuth client (your app)</h2>
                <p className="dev-card-desc">
                  Use when your product lets people <strong>unlock their pN</strong> (or connect their identity). You get a{' '}
                  <strong>client id</strong> for your app. Redirect URLs must match your real URLs exactly.
                </p>
                <div className="dev-field">
                  <label htmlFor="oc-client-id">Client id</label>
                  <input
                    id="oc-client-id"
                    className="dev-input"
                    value={ocClientId}
                    onChange={(e) => setOcClientId(e.target.value)}
                    placeholder="e.g. my-company-web"
                  />
                  <FieldHelp>Lowercase letters, digits, hyphens. Reserved: browser-app, prism-app, developer-portal.</FieldHelp>
                </div>
                <div className="dev-field">
                  <label htmlFor="oc-name">Display name</label>
                  <input
                    id="oc-name"
                    className="dev-input"
                    value={ocName}
                    onChange={(e) => setOcName(e.target.value)}
                    placeholder="e.g. My Company Dashboard"
                  />
                  <FieldHelp>Shown on consent screens when users authorize your app.</FieldHelp>
                </div>
                <div className="dev-field">
                  <label htmlFor="oc-desc">Description (optional)</label>
                  <input
                    id="oc-desc"
                    className="dev-input"
                    value={ocDescription}
                    onChange={(e) => setOcDescription(e.target.value)}
                    placeholder="Internal note what this app is"
                  />
                </div>
                <div className="dev-field">
                  <label htmlFor="oc-redirect">Allowed return URLs after unlock / authorize</label>
                  <textarea
                    id="oc-redirect"
                    className="dev-textarea"
                    value={ocRedirectUris}
                    onChange={(e) => setOcRedirectUris(e.target.value)}
                  />
                  <FieldHelp>One URL per line. Must match redirects in your app exactly.</FieldHelp>
                </div>
                <div className="dev-field">
                  <label htmlFor="oc-scopes">Permission labels (scopes)</label>
                  <input
                    id="oc-scopes"
                    className="dev-input"
                    value={ocScopes}
                    onChange={(e) => setOcScopes(e.target.value)}
                  />
                  <FieldHelp>
                    Space-separated. Most apps: <code>openid profile</code>.
                  </FieldHelp>
                </div>
                <button type="button" className="dev-btn" onClick={registerOAuthClient}>
                  Save OAuth client
                </button>
              </section>

              <section className="dev-card" aria-labelledby="apikey-heading">
                <h2 id="apikey-heading">Backend API key</h2>
                <p className="dev-card-desc">
                  For <strong>your server</strong> calling <code>/api/v1/...</code>. The key is created for the pN you
                  unlocked in this session — you do not enter a separate id.
                </p>
                <div className="dev-field">
                  <label htmlFor="ak-scopes">Which API areas this key may use</label>
                  <input
                    id="ak-scopes"
                    className="dev-input"
                    value={akScopes}
                    onChange={(e) => setAkScopes(e.target.value)}
                  />
                  <FieldHelp>Comma-separated. Tighten in production if you can.</FieldHelp>
                </div>
                <button type="button" className="dev-btn" onClick={createApiKey}>
                  Create API key
                </button>
              </section>
            </div>
          </>
        )}

        <footer className="dev-foot">
          Integration guide: <code>docs/developer/PN_OAUTH_INTEGRATION.md</code> in the par Noir repository. Server operators
          can still use <code>ADMIN_API_KEY</code> for break-glass admin routes — never expose it in this UI.
        </footer>
      </main>
    </div>
  );
}
