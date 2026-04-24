import React from 'react';
import ReactDOM from 'react-dom/client';
import { initPnOAuthDebugFromUrl } from '@par-noir/oauth-ui';
import App from './App';
import './index.css';

initPnOAuthDebugFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
