import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { OAuthHandler } from './components/OAuthHandler'
import './index.css'
import './utils/testRunner.ts' // Import test runner for browser console access

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <OAuthHandler />
  </React.StrictMode>,
)
