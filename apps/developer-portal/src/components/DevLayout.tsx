import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { UnlockButton, LockButton } from '@par-noir/oauth-ui';
import { usePortal } from '../context/PortalContext';
import { fetchPlatformAccess } from '../services/platformApi';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `dev-nav-link${isActive ? ' dev-nav-link--active' : ''}`;

export function DevLayout() {
  const {
    loadingSession,
    signedIn,
    user,
    error,
    setError,
    handleBeforeUnlock,
    onPopupResult,
    signOut,
    apiEndpoint,
    clientId
  } = usePortal();

  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setIsOperator(false);
      return;
    }
    void fetchPlatformAccess().then(({ isOperator: op }) => setIsOperator(op));
  }, [signedIn]);

  return (
    <div className="dev-root">
      <header className="dev-header">
        <div className="dev-header-inner">
          <img className="dev-logo" src="/branding/Par-Noir-Logo-White.png" alt="par Noir" />
          <div className="dev-header-text">
            <p className="dev-title">Developer console</p>
            <p className="dev-sub">Build on par Noir — OAuth, API keys, data points, docs</p>
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
                  refreshToken={sessionStorage.getItem('dev_portal_refresh_token')}
                  apiEndpoint={apiEndpoint}
                  className="dev-btn dev-btn--ghost dev-btn--inline-icon"
                >
                  Lock
                </LockButton>
              </>
            ) : (
              <UnlockButton
                forceRedirect
                config={{
                  clientId,
                  apiEndpoint,
                  redirectUri: `${window.location.origin}/oauth-callback.html`,
                  scope: ['openid', 'profile']
                }}
                onBeforeNavigate={handleBeforeUnlock}
                onPopupResult={onPopupResult}
                onPopupFlowFailed={(msg) => setError(msg)}
                iconOnly
                className="dev-btn dev-btn-unlock dev-btn--header-unlock"
              />
            )}
          </div>
        </div>
        <nav className="dev-nav" aria-label="Developer portal sections">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/credentials" className={navLinkClass}>
            Credentials
          </NavLink>
          <NavLink to="/data-points" className={navLinkClass}>
            Data points
          </NavLink>
          <NavLink to="/docs" className={navLinkClass}>
            Guides
          </NavLink>
          <NavLink to="/integrate" className={navLinkClass}>
            Layer 5
          </NavLink>
          <NavLink to="/api-reference" className={navLinkClass}>
            API reference
          </NavLink>
          <NavLink to="/proposals" className={navLinkClass}>
            Proposals
          </NavLink>
          {isOperator && (
            <NavLink to="/platform" className={navLinkClass}>
              Platform
            </NavLink>
          )}
        </nav>
      </header>

      {error && (
        <div className="dev-main" style={{ paddingTop: 0 }}>
          <div className="dev-alert dev-alert--error">{error}</div>
        </div>
      )}

      <Outlet />

      <footer className="dev-foot dev-foot--layout">
        <p>
          API base: <span className="dev-api-pill">{apiEndpoint}</span>
        </p>
        <p className="dev-foot-note">
          Repository: <code>docs/developer/PN_OAUTH_INTEGRATION.md</code>. Never expose <code>ADMIN_API_KEY</code> in
          client code.
        </p>
      </footer>
    </div>
  );
}
