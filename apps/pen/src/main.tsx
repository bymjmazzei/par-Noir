import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './services/penMediaSetup';
import { bootstrapPenMediaBackend } from './services/penMediaNativeBackends';
import { startLongTaskWatch } from './services/longTaskWatch';
import './index.css';

bootstrapPenMediaBackend();
startLongTaskWatch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
