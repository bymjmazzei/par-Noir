import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { IdentityCore } from '@identity-protocol/identity-core';

interface DistributedAuthProps {
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: Error) => void;
}

export const DistributedAuth: React.FC<DistributedAuthProps> = ({
  onAuthSuccess,
  onAuthError
}) => {
  const [manager, setManager] = useState<IdentityCore | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncPassword, setSyncPassword] = useState('');
  const [did, setDid] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'idle' | 'authenticating' | 'success' | 'failed'>('idle');

  useEffect(() => {
    const initManager = async () => {
      try {
        const newManager = new IdentityCore({
          storageType: 'indexeddb',
          encryptionLevel: 'high',
          backupEnabled: false,
          biometricEnabled: false
        });
        setManager(newManager);
      } catch (error) {
        setError('Failed to initialize system');
      }
    };

    initManager();
  }, []);

  const initializeSystem = async () => {
    if (!manager || !syncPassword) return;

    try {
      setIsLoading(true);
      setError(null);

      await manager.initialize();
      setIsInitialized(true);

    } catch (error) {
      setError('Failed to initialize system');
      onAuthError?.(error instanceof Error ? error : new Error('Initialization failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const authenticate = async () => {
    if (!manager || !did) return;

    try {
      setIsLoading(true);
      setError(null);
      setAuthStatus('authenticating');

      // Use the correct authenticate method
      const session = await manager.authenticate({
        username: did,
        passcode: syncPassword
      });

      if (session) {
        setAuthStatus('success');
        onAuthSuccess?.(session);
        setError(null);
      } else {
        setAuthStatus('failed');
        setError('Authentication failed');
      }
    } catch (error) {
      setAuthStatus('failed');
      setError('Authentication failed');
      onAuthError?.(error instanceof Error ? error : new Error('Authentication failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Distributed Identity Authentication</h2>
        <p className="text-gray-600">Secure authentication across multiple devices and networks</p>
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {authStatus === 'success' && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Authentication successful across distributed network
        </p>
        </div>
      )}

      {/* Initialization */}
      {!isInitialized && (
        <div className="mb-6">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Setup Distributed Network</h3>
            <p className="text-sm text-gray-500 mt-1">Connect to the distributed identity network</p>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Network Password
              </label>
              <input
                type="password"
                value={syncPassword}
                onChange={(e) => setSyncPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your network password"
              />
            </div>
            <button
              onClick={initializeSystem}
              disabled={!syncPassword || isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : 'Connect to Network'}
            </button>
          </div>
        </div>
      )}

      {/* Authentication */}
      {isInitialized && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Ready to Authenticate</h3>
            <p className="text-sm text-gray-500 mt-1">Connected to distributed network</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Identity
            </label>
            <input
              type="text"
              value={did}
              onChange={(e) => setDid(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your identity (e.g., alice@example.com)"
            />
          </div>

          <button
            onClick={authenticate}
            disabled={!did || isLoading}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {authStatus === 'authenticating' ? 'Authenticating...' : 'Processing...'}
              </div>
            ) : (
              'Sign In with Distributed Identity'
            )}
          </button>
        </div>
      )}

      {/* Network Features Info */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">🌐 Distributed Network Features</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Multi-Device Sync:</strong> Access your identity from any device</li>
          <li>• <strong>Decentralized Storage:</strong> No single point of failure</li>
          <li>• <strong>Cross-Network:</strong> Works across IPFS and blockchain</li>
          <li>• <strong>Resilient:</strong> Continues working even if some nodes fail</li>
        </ul>
      </div>
    </div>
  );
}; 