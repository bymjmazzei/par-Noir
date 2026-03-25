import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl } from '@par-noir/oauth-ui';
import { snapshotOAuthResumeSearchFromUrl } from './oauthResumeBootstrap';
import { initBrowserSentry } from './config/sentry';
import App from './App';
import './index.css';
import { UserStateProvider } from './contexts/UserStateContext';
import { ErrorBoundary } from './components/ErrorBoundary';

initBrowserSentry();

/** Opt-in: ?pn_debug_oauth=1 — then pnOAuthDebugCopy() or window.__PN_OAUTH_DEBUG__ (production strips console.*). */
initPnOAuthDebugFromUrl();
snapshotOAuthResumeSearchFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UserStateProvider>
        <App />
      </UserStateProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

