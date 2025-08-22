import React, { useState } from 'react';
import { useIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

function App() {
  const [clientId, setClientId] = useState('test-client-id');
  const [redirectUri, setRedirectUri] = useState(process.env.REACT_APP_REDIRECT_URI || 'https://yourdomain.com/callback');
  const [platform, setPlatform] = useState('identity-protocol');
  const [logs, setLogs] = useState<string[]>([]);

  const config = createSimpleConfig(
    clientId,
    redirectUri,
    {
      scopes: ['openid', 'profile', 'email'],
      storage: 'localStorage',
      autoRefresh: true,
      debug: true
    }
  );

  const {
    session,
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    handleCallback,
    logout,
    sdk
  } = useIdentitySDK(config);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleAuthenticate = async () => {
    try {
      addLog(`Starting authentication for platform: ${platform}`);
      await authenticate(platform);
    } catch (err) {
      addLog(`Authentication error: ${err}`);
    }
  };

  const handleLogout = async () => {
    try {
      addLog('Logging out...');
      await logout();
      addLog('Logout successful');
    } catch (err) {
      addLog(`Logout error: ${err}`);
    }
  };

  // Handle callback from OAuth flow
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (code && state) {
      addLog('Received OAuth callback, handling...');
      handleCallback(window.location.href).then(() => {
        addLog('Authentication callback handled successfully');
      }).catch(err => {
        addLog(`Callback error: ${err}`);
      });
    } else if (error) {
      addLog(`OAuth error: ${error}`);
    }
  }, [handleCallback]);

  // Set up event listeners
  React.useEffect(() => {
    if (sdk) {
      sdk.on('auth_started', () => addLog('Auth started'));
      sdk.on('auth_success', (session) => addLog(`Auth success: ${session.identity.username}`));
      sdk.on('auth_error', (error) => addLog(`Auth error: ${error.message}`));
      sdk.on('logout', () => addLog('Logout event'));
      sdk.on('token_refresh', () => addLog('Token refreshed'));
      sdk.on('token_expired', () => addLog('Token expired'));
    }
  }, [sdk]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Identity Protocol SDK Test App
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Redirect URI
                </label>
                <input
                  type="text"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="identity-protocol">Identity Protocol</option>
                  <option value="test-platform">Test Platform</option>
                  <option value="demo-platform">Demo Platform</option>
                </select>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleAuthenticate}
                  disabled={isLoading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Authenticating...' : `Sign in with ${platform}`}
                </button>
              </div>
            </div>
          </div>

          {/* Session Panel */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Session Status
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error.message}</p>
              </div>
            )}

            {isAuthenticated && session ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {session.identity.displayName?.[0] || session.identity.username[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {session.identity.displayName || session.identity.username}
                    </p>
                    <p className="text-sm text-gray-500">{session.identity.email}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Platform:</span> {session.platform}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Session ID:</span> {session.identity.id}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Last Active:</span>{' '}
                    {new Date(session.lastActive).toLocaleString()}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {isLoading ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Not authenticated</p>
              </div>
            )}
          </div>
        </div>

        {/* Logs Panel */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Event Logs
          </h2>
          <div className="bg-gray-100 rounded-md p-4 h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">No events yet</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-sm font-mono text-gray-700">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setLogs([])}
            className="mt-2 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Clear Logs
          </button>
        </div>

        {/* SDK Info */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            SDK Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Authentication Status:</strong> {isAuthenticated ? 'Authenticated' : 'Not authenticated'}</p>
              <p><strong>Loading State:</strong> {isLoading ? 'Loading' : 'Idle'}</p>
              <p><strong>Session:</strong> {session ? 'Active' : 'None'}</p>
            </div>
            <div>
              <p><strong>Client ID:</strong> {clientId}</p>
              <p><strong>Redirect URI:</strong> {redirectUri}</p>
              <p><strong>Platform:</strong> {platform}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 