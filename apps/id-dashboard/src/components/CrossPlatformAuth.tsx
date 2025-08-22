import React, { useState } from 'react';

interface CrossPlatformAuthProps {
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: Error) => void;
  availableIds?: Array<{
    id: string;
    username: string;
    displayName?: string;
    email?: string;
    status: string;
  }>;
  onCreateId?: () => void;
  onImportId?: () => void;
}

export const CrossPlatformAuth: React.FC<CrossPlatformAuthProps> = ({
  onAuthSuccess,
  onAuthError,
  availableIds = [],
  onCreateId,
  onImportId
}) => {
  const [platform, setPlatform] = useState('identity-protocol');
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleAuthenticate = async () => {
    if (!selectedId) {
      const err = new Error('Please select an ID to authenticate with');
      setError(err);
      onAuthError?.(err);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simulate OAuth-like authentication with local ID
      const selectedIdentity = availableIds.find(id => id.id === selectedId);
      
      if (!selectedIdentity) {
        throw new Error('Selected ID not found');
      }

      // Create a session object similar to OAuth
      const session = {
        identity: {
          id: selectedIdentity.id,
          username: selectedIdentity.username,
          displayName: selectedIdentity.displayName || selectedIdentity.username,
          email: selectedIdentity.email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: selectedIdentity.status,
          metadata: {}
        },
        tokens: {
          accessToken: `mock_token_${Date.now()}`,
          tokenType: 'Bearer',
          expiresIn: 3600,
          scope: ['openid', 'profile', 'email'],
          refreshToken: `mock_refresh_${Date.now()}`
        },
        platform: platform,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      onAuthSuccess?.(session);
    } catch (err) {
      const error = err as Error;
      setError(error);
      onAuthError?.(error);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Cross-Platform Authentication
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      <div className="space-y-4">
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
            <option value="google">Google</option>
            <option value="github">GitHub</option>
            <option value="facebook">Facebook</option>
            <option value="custom">Custom Platform</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Your ID
          </label>
          {availableIds.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-md">
              <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm mb-3">No IDs available</p>
              <p className="text-gray-400 text-xs mb-4">Create an ID or import an existing one to get started</p>
              
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={onCreateId}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create ID
                </button>
                <button
                  onClick={onImportId}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Import ID
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose an ID...</option>
                {availableIds.map((id) => (
                  <option key={id.id} value={id.id}>
                    {id.displayName || id.username} ({id.id})
                  </option>
                ))}
              </select>
              
              <div className="flex space-x-2 text-xs">
                <button
                  onClick={onCreateId}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Create new ID
                </button>
                <span className="text-gray-400">•</span>
                <button
                  onClick={onImportId}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Import existing ID
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800">
            <strong>How it works:</strong> This simulates OAuth-like authentication using your local IDs. 
            Select an ID from your device to authenticate with the chosen platform.
          </p>
        </div>

        <button
          onClick={handleAuthenticate}
          disabled={isLoading || !selectedId}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Authenticating...' : `Sign in with ${platform}`}
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-2">For Developers</h4>
        <div className="bg-gray-50 rounded-md p-3">
          <p className="text-xs text-gray-600 mb-2">
            To integrate this SDK into your application:
          </p>
          <pre className="text-xs text-gray-800 bg-gray-100 p-2 rounded overflow-x-auto">
{`import { createIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

const config = createSimpleConfig(
  'your-client-id',
  'https://your-app.com/callback',
  { scopes: ['openid', 'profile', 'email'] }
);

const sdk = createIdentitySDK(config);
await sdk.authenticate('identity-protocol');`}
          </pre>
        </div>
      </div>
    </div>
  );
}; 