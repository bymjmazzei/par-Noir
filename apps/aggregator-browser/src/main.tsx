import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { UserStateProvider } from './contexts/UserStateContext';
import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <UserStateProvider>
        <App />
      </UserStateProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

