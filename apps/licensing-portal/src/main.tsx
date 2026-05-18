import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl, snapshotOAuthResumeSearchFromUrl } from '@par-noir/oauth-ui';
import App from './App';
import './index.css';

initPnOAuthDebugFromUrl();
snapshotOAuthResumeSearchFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
