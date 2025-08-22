import React, { useState, useEffect } from 'react';
import { CheckCircle, Shield } from 'lucide-react';
import { IdentityCore } from '@identity-protocol/identity-core';

interface ZKAuthProps {
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: Error) => void;
}

export const ZKAuth: React.FC<ZKAuthProps> = ({
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
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Privacy-Protected Authentication</h2>
        <p className="text-gray-600">Your data stays private while proving your identity</p>
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
          Authentication successful with privacy protection
        </p>
        </div>
      )}

      {/* Initialization */}
      {!isInitialized && (
        <div className="mb-6">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Setup Privacy Protection</h3>
            <p className="text-sm text-gray-500 mt-1">This enables secure, private authentication</p>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Security Password
              </label>
              <input
                type="password"
                value={syncPassword}
                onChange={(e) => setSyncPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your security password"
              />
            </div>
            <button
              onClick={initializeSystem}
              disabled={!syncPassword || isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Setting up...' : 'Enable Privacy Protection'}
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
            <p className="text-sm text-gray-500 mt-1">Your privacy protection is active</p>
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
              'Sign In with Privacy Protection'
            )}
          </button>
        </div>
      )}

      {/* Privacy Features Info */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Privacy Features Active
        </h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Zero-Knowledge Proofs:</strong> Prove your identity without revealing data</li>
          <li>• <strong>Selective Disclosure:</strong> Share only what&apos;s necessary</li>
          <li>• <strong>End-to-End Encryption:</strong> Your data is always encrypted</li>
          <li>• <strong>No Data Storage:</strong> We never store your personal information</li>
        </ul>
      </div>
    </div>
  );
}; 