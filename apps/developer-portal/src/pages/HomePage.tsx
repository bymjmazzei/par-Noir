import { Link } from 'react-router-dom';
import { UnlockButton } from '@par-noir/oauth-ui';
import { usePortal } from '../context/PortalContext';

export function HomePage() {
  const {
    signedIn,
    loadingSession,
    message,
    setMessage,
    setError,
    handleBeforeUnlock,
    onPopupResult,
    apiEndpoint,
    clientId
  } = usePortal();

  return (
    <main className="dev-main">
      <section className="dev-intro" aria-labelledby="intro-heading">
        <h2 id="intro-heading" className="dev-intro-title">
          What this console is for
        </h2>
        <p>
          If you are building a product that talks to par Noir (user unlock, HTTP API, standard data points), use this site
          after you <strong>unlock your pN</strong> — the same OAuth flow as any third-party app.
        </p>
        <ul>
          <li>
            <Link to="/credentials">Credentials</Link> — register an OAuth client (may need operator approval) and create
            backend API keys; use Get started when Active.
          </li>
          <li>
            <Link to="/integrate">Layer 5</Link> — login, silo, ZKPs, messaging + feed iframes.
          </li>
          <li>
            <Link to="/data-points">Data points</Link> — catalog + consent vs API-key request lanes.
          </li>
          <li>
            <Link to="/docs">Guides</Link> — quickstart with <code>createPnIntegratorClient</code> and{' '}
            <code>npm install @identity-protocol/identity-sdk @par-noir/oauth-ui</code>.
          </li>
          <li>
            <Link to="/api-reference">API reference</Link> — OpenAPI (Redoc).
          </li>
          <li>
            <Link to="/proposals">Proposals</Link> — suggest new standard data points (requires unlock; not auto-catalog).
          </li>
        </ul>
      </section>

      <p className="dev-lead">
        API base URL: <span className="dev-api-pill">{apiEndpoint}</span>
      </p>

      {message && <div className="dev-alert dev-alert--success">{message}</div>}

      {!signedIn && !loadingSession && (
        <section className="dev-unlock-hero" aria-labelledby="unlock-cta-heading">
          <h2 id="unlock-cta-heading" className="dev-unlock-hero-title">
            Unlock pN to continue
          </h2>
          <p className="dev-unlock-hero-desc">
            Opens the par Noir authorize flow in this window. You will return here automatically when sign-in
            completes.
          </p>
          <UnlockButton
            forceRedirect
            config={{
              clientId,
              apiEndpoint,
              redirectUri: `${window.location.origin}/oauth-callback.html`,
              scope: ['openid', 'profile']
            }}
            onBeforeNavigate={(state, nonce) => {
              setError(null);
              setMessage(null);
              handleBeforeUnlock(state, nonce);
            }}
            onPopupResult={onPopupResult}
            onPopupFlowFailed={(msg) => setError(msg)}
            className="dev-btn dev-btn-unlock dev-btn-unlock--large"
          >
            Unlock pN
          </UnlockButton>
        </section>
      )}
    </main>
  );
}
