import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './services/penMediaSetup';
import { bootstrapPenMediaBackend } from './services/penMediaNativeBackends';
import { isPenDesktop } from './services/penPlatform';
import { startLongTaskWatch } from './services/longTaskWatch';
import './index.css';

bootstrapPenMediaBackend();
startLongTaskWatch();

// Electron file:// + BrowserRouter rewrites the path off index.html, so relative
// assets (footer branding, chunks) 404. Hash keeps the document URL stable.
const Router = isPenDesktop() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
