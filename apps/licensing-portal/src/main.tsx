import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl, snapshotOAuthResumeSearchFromUrl } from '@par-noir/oauth-ui';
import App from './App';
import './index.css';

initPnOAuthDebugFromUrl();
snapshotOAuthResumeSearchFromUrl();

// StrictMode double-invokes effects; licensing has a simple mount path — avoid stuck Loading on resume races.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
