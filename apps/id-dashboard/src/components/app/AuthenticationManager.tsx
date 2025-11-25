import React, { useState, useEffect, useCallback } from 'react';
import { AuthSession, EncryptedIdentity } from "../../utils/crypto";
import { SecureStorage } from "../../utils/storage";
import { SecureCredentialManager } from "../../utils/secureCredentialManager";
import { UnifiedAuth } from '../UnifiedAuth';
import { BiometricAuth } from "../../utils/biometric";
import { logger } from "../../utils/logger";
import { AutoLockManager } from "../../utils/security/autoLockManager";

interface AuthenticationManagerProps {
  onAuthenticationChange: (session: AuthSession | null) => void;
  onIdentityUnlock: (identity: EncryptedIdentity) => void;
}

export const AuthenticationManager: React.FC<AuthenticationManagerProps> = ({
  onAuthenticationChange,
  onIdentityUnlock
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLockManager, setAutoLockManager] = useState<AutoLockManager | null>(null);

  const storage = new SecureStorage();

  // Check authentication status on mount
  useEffect(() => {
    checkAuthenticationStatus();
  }, []);

  // Setup auto-lock manager when authenticated
  useEffect(() => {
    if (isAuthenticated && currentSession) {
      const manager = new AutoLockManager(() => {
        // Lock callback - clear session and require re-authentication
        handleLogout();
      });
      setAutoLockManager(manager);

      return () => {
        manager.destroy();
      };
    } else {
      if (autoLockManager) {
        autoLockManager.destroy();
        setAutoLockManager(null);
      }
    }
  }, [isAuthenticated, currentSession, handleLogout]);

  const checkAuthenticationStatus = useCallback(async () => {
    try {
      const session = await storage.getCurrentSession();
      if (session) {
        setIsAuthenticated(true);
        setCurrentSession(session);
        onAuthenticationChange(session);
      }
    } catch (error) {
      logger.error('Failed to check authentication status:', error);
    }
  }, [onAuthenticationChange]);

  const handleLogin = useCallback(async (credentials: any) => {
    setLoading(true);
    setError(null);
    
    try {
      // Handle login logic
      const session = await performLogin(credentials);
      setIsAuthenticated(true);
      setCurrentSession(session);
      onAuthenticationChange(session);
      // Auto-lock manager will be set up by useEffect when isAuthenticated changes
    } catch (error: any) {
      setError(error.message || 'Login failed');
      logger.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  }, [onAuthenticationChange]);

  const handleLogout = useCallback(async () => {
    try {
      await storage.clearExpiredSessions();
      setIsAuthenticated(false);
      setCurrentSession(null);
      onAuthenticationChange(null);
    } catch (error) {
      logger.error('Logout error:', error);
    }
  }, [onAuthenticationChange]);

  const handleBiometricAuth = useCallback(async (identityId?: string, passcode?: string) => {
    try {
      setLoading(true);
      setError(null);

      // Check if biometric is available
      const isAvailable = await BiometricAuth.isAvailable();
      
      if (!isAvailable) {
        setError('Biometric authentication is not available on this device');
        return;
      }

      // If identityId not provided, try to get it from stored identities
      let targetIdentityId = identityId;
      if (!targetIdentityId) {
        // Try to get the first identity with biometric credentials
        // This is a fallback - ideally identityId should be provided
        const { SimpleStorage } = await import('../../utils/simpleStorage');
        const simpleStorage = SimpleStorage.getInstance();
        const identities = await simpleStorage.getIdentities();
        
        // Find first identity with biometric credentials
        for (const identity of identities) {
          const creds = await BiometricAuth.getCredentials(identity.id);
          if (creds.length > 0) {
            targetIdentityId = identity.id;
            break;
          }
        }
      }

      if (!targetIdentityId) {
        setError('No identity found with biometric credentials. Please set up biometric authentication first.');
        return;
      }

      // Authenticate with biometric
      const result = await BiometricAuth.authenticate(targetIdentityId);
      
      if (result.success) {
        // Get the encrypted identity from SimpleStorage
        const { SimpleStorage } = await import('../../utils/simpleStorage');
        const { IdentityCrypto } = await import('../../utils/crypto');
        const simpleStorage = SimpleStorage.getInstance();
        const simpleIdentity = await simpleStorage.getIdentity(targetIdentityId);
        
        if (!simpleIdentity) {
          setError('Identity not found in storage');
          return;
        }

        // Get the encrypted identity data
        const encryptedIdentity = simpleIdentity.encryptedData;
        
        // If passcode not provided, prompt for it
        // Biometric auth proves identity ownership, but we still need passcode to decrypt
        if (!passcode) {
          setError('Please enter your passcode to complete authentication');
          return;
        }

        // Decrypt and authenticate the identity using the passcode
        // This will automatically store credentials in SecureCredentialManager
        const authSession = await IdentityCrypto.authenticateIdentity(
          encryptedIdentity,
          passcode,
          simpleIdentity.pnName
        );

        // Store the session (credentials are already in SecureCredentialManager)
        await storage.storeSession(authSession);
        
        // Set authenticated state
        setIsAuthenticated(true);
        setCurrentSession(authSession);
        onAuthenticationChange(authSession);
        
        // Update last accessed time
        await simpleStorage.updateIdentity({
          ...simpleIdentity,
          lastAccessed: new Date().toISOString()
        });
      } else if (result.fallbackToPasscode) {
        setError(result.error || 'Biometric authentication failed. Please use passcode.');
      } else {
        setError(result.error || 'Biometric authentication failed');
      }
    } catch (error: any) {
      logger.error('Biometric authentication error:', error);
      setError(error.message || 'Biometric authentication failed');
    } finally {
      setLoading(false);
    }
  }, [onAuthenticationChange, storage]);

  const performLogin = async (credentials: any): Promise<AuthSession> => {
    // Implement actual login logic here
    throw new Error('Login implementation required');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => setError(null)}
          className="mt-2 text-sm text-red-500 hover:text-red-700"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <UnifiedAuth
        onLogin={handleLogin}
        onBiometricAuth={handleBiometricAuth}
      />
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Authenticated</h2>
          <p className="text-sm text-gray-600">
            Welcome back, {(() => {
              // SECURITY: Get pnName from SecureCredentialManager (secrets), not from session
              const sessionId = currentSession?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              return credentials?.pnName || currentSession?.nickname || 'User';
            })()}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Logout
        </button>
      </div>
    </div>
  );
};
