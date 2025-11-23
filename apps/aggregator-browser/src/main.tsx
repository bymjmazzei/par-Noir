import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { UserStateProvider } from './contexts/UserStateContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize PDF.js worker globally once at app startup
(async () => {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch (err) {
    console.warn('Failed to initialize PDF.js worker:', err);
  }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UserStateProvider>
        <App />
      </UserStateProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

