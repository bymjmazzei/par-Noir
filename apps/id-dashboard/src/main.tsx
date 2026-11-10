import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import sqlJsWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { setSqlJsWasmUrl } from '@par-noir/device-cloud-credentials'
import './utils/testRunner.ts' // Import test runner for browser console access

setSqlJsWasmUrl(sqlJsWasmUrl)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
