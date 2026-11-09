import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bindPushTapHandler } from './nativePush';

bindPushTapHandler();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
