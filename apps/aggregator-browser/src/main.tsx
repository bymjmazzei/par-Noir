import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl } from '@par-noir/oauth-ui';
import { snapshotOAuthResumeSearchFromUrl } from './oauthResumeBootstrap';
import App from './App';
import './index.css';
import { UserStateProvider } from './contexts/UserStateContext';
import { ErrorBoundary } from './components/ErrorBoundary';

/** Opt-in: ?pn_debug_oauth=1 — read window.__PN_OAUTH_DEBUG__ in DevTools (production strips console.*). */
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

