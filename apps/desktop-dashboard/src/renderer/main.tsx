import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Reuse the production Tailwind bundle from the dashboard build so the storage
// experience looks identical in the desktop shell.
import '../../../id-dashboard/dist/assets/index-Cymp9X78.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

