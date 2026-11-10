import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl } from '@par-noir/oauth-ui';
import { snapshotOAuthResumeSearchFromUrl } from './oauthResumeBootstrap';
import { sanitizeMessagingOAuthOnStartup } from './messagingStartupSanitize';
import { initBrowserSentry } from './config/sentry';
import App from './App';
import './index.css';
import sqlJsWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { setSqlJsWasmUrl } from '@par-noir/device-cloud-credentials';
import { UserStateProvider } from './contexts/UserStateContext';
import { SoftRefreshProvider } from './contexts/SoftRefreshContext';
import { RealtimeSyncProvider } from './contexts/RealtimeSyncContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';

setSqlJsWasmUrl(sqlJsWasmUrl);

initBrowserSentry();

/** Opt-in: ?pn_debug_oauth=1 — then pnOAuthDebugCopy() or window.__PN_OAUTH_DEBUG__ (production strips console.*). */
initPnOAuthDebugFromUrl();
snapshotOAuthResumeSearchFromUrl();
sanitizeMessagingOAuthOnStartup();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UserStateProvider>
        <SoftRefreshProvider>
          <RealtimeSyncProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </RealtimeSyncProvider>
        </SoftRefreshProvider>
      </UserStateProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

