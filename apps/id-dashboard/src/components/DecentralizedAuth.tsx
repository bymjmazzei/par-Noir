import React, { useState, useEffect } from 'react';
import { useDecentralizedAuth, Identity } from '../utils/decentralizedAuth';

interface DecentralizedAuthProps {
  onAuthenticated?: (identity: Identity) => void;
  onError?: (error: string) => void;
}

export const DecentralizedAuth: React.FC<DecentralizedAuthProps> = ({
  onAuthenticated,
  onError
}) => {
  const {
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    logout,
    getCurrentIdentity,
    getUserInfo
  } = useDecentralizedAuth();

  const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);
  const [availableIdentities, setAvailableIdentities] = useState<Identity[]>([]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Load available identities from local storage
  useEffect(() => {
    const loadIdentities = () => {
      try {
        const storedIdentities = localStorage.getItem('identities');
        if (storedIdentities) {
          const identities = JSON.parse(storedIdentities);
          setAvailableIdentities(identities);
        }
      } catch (error) {
        console.warn('Failed to load identities:', error);
      }
    };

    loadIdentities();
  }, []);

  // Handle authentication success
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const currentIdentity = getCurrentIdentity();
      if (currentIdentity && onAuthenticated) {
        onAuthenticated(currentIdentity);
      }
    }
  }, [isAuthenticated, isLoading, getCurrentIdentity, onAuthenticated]);

  // Handle authentication error
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const handleAuthenticate = async () => {
    if (!selectedIdentity) {
      onError?.('Please select an identity to authenticate with');
      return;
    }

    setIsAuthenticating(true);
    try {
      const success = await authenticate(selectedIdentity);
      if (!success) {
        onError?.('Authentication failed. Please try again.');
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Logout failed');
    }
  };

  const userInfo = getUserInfo();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading authentication state...</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            🔐 Decentralized Authentication
          </h2>
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            Authenticated
          </span>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-700 mb-2">Current Identity</h3>
            <div className="text-sm text-gray-600">
              <p><strong>DID:</strong> {getCurrentIdentity()?.id}</p>
              <p><strong>Name:</strong> {userInfo?.name || 'Unknown'}</p>
              <p><strong>Email:</strong> {userInfo?.email || 'Not provided'}</p>
              <p><strong>Verified:</strong> {userInfo?.verified ? 'Yes' : 'No'}</p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-medium text-blue-700 mb-2">Session Information</h3>
            <div className="text-sm text-blue-600">
              <p><strong>Device ID:</strong> {getCurrentIdentity()?.deviceId || 'Unknown'}</p>
              <p><strong>Permissions:</strong> {getCurrentIdentity()?.permissions?.join(', ') || 'None'}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            🚪 Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          🔐 Decentralized Authentication
        </h2>
        <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
          Not Authenticated
        </span>
      </div>

      <div className="space-y-4">
        {availableIdentities.length === 0 ? (
          <div className="bg-yellow-50 rounded-lg p-4">
            <h3 className="font-medium text-yellow-700 mb-2">No Identities Available</h3>
            <p className="text-sm text-yellow-600">
              You need to create an identity first before you can authenticate.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Identity to Authenticate With
              </label>
              <select
                value={selectedIdentity?.id || ''}
                onChange={(e) => {
                  const identity = availableIdentities.find(id => id.id === e.target.value);
                  setSelectedIdentity(identity || null);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose an identity...</option>
                {availableIdentities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.metadata?.displayName || identity.username || identity.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-medium text-blue-700 mb-2">How Decentralized Authentication Works</h3>
              <div className="text-sm text-blue-600 space-y-1">
                <p>1. <strong>Challenge:</strong> Server creates a cryptographic challenge</p>
                <p>2. <strong>Sign:</strong> Your identity signs the challenge with its private key</p>
                <p>3. <strong>Verify:</strong> Server verifies the signature using your public key</p>
                <p>4. <strong>Session:</strong> No tokens needed - your DID serves as authentication</p>
              </div>
            </div>

            <button
              onClick={handleAuthenticate}
              disabled={!selectedIdentity || isAuthenticating}
              className={`w-full font-medium py-2 px-4 rounded-lg transition-colors ${
                !selectedIdentity || isAuthenticating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isAuthenticating ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                  Authenticating...
                </>
              ) : (
                '🔐 Authenticate with Selected Identity'
              )}
            </button>
          </>
        )}

        {error && (
          <div className="bg-red-50 rounded-lg p-4">
            <h3 className="font-medium text-red-700 mb-2">Authentication Error</h3>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DecentralizedAuth;
