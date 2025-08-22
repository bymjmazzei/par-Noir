import React, { useState } from 'react';
import { IdentityCrypto } from '../utils/crypto';
import SimpleStorage from '../utils/simpleStorage';

interface UnifiedAuthProps {
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: Error) => void;
  onCreateId?: () => void;
  onImportId?: () => void;
}

export const UnifiedAuth: React.FC<UnifiedAuthProps> = ({
  onAuthSuccess,
  onAuthError,
  onCreateId,
  onImportId
}) => {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !passcode.trim()) {
      setError(new Error('Please enter both username and passcode.'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use simple storage
      const storage = SimpleStorage.getInstance();
      const identities = await storage.getIdentities();
      
      // Find matching identity
      for (const identity of identities) {
        try {
          const decryptedIdentity = await IdentityCrypto.authenticateIdentity(
            identity.encryptedData, 
            passcode, 
            username
          );
          
          if (decryptedIdentity.pnName === username) {
            // Found matching identity
            const session = await IdentityCrypto.decryptIdentity(
              identity.publicKey, 
              passcode
            );
            
            if (session) {
              // Update last accessed time
              await storage.updateNickname(identity.id, identity.nickname);
              
              onAuthSuccess?.(session);
              return;
            }
          }
        } catch (error) {
          // Continue to next identity
          continue;
        }
      }
      
      // No matching identity found
      setError(new Error('Invalid username or passcode.'));
      onAuthError?.(new Error('Authentication failed'));
      
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error instanceof Error ? error : new Error('Authentication failed'));
      onAuthError?.(error instanceof Error ? error : new Error('Authentication failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
        <p className="text-gray-600">Sign in to your identity</p>
      </div>

      <form onSubmit={handleAuthenticate} className="space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your username"
            required
          />
        </div>

        <div>
          <label htmlFor="passcode" className="block text-sm font-medium text-gray-700 mb-1">
            Passcode
          </label>
          <input
            type="password"
            id="passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your passcode"
            required
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm">
            {error.message}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-600 mb-4">Don&apos;t have an identity?</p>
        <div className="space-y-2">
          <button
            onClick={onCreateId}
            className="w-full bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Create New Identity
          </button>
          <button
            onClick={onImportId}
            className="w-full bg-gray-500 text-white py-2 px-4 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Import Identity
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedAuth; 