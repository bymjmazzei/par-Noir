import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { OAuthHandler } from './components/OAuthHandler'
import './index.css'
import './utils/testRunner.ts' // Import test runner for browser console access

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
    <App />
    <OAuthHandler />
  </React.StrictMode>,
)
