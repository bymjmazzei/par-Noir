import React, { useState, useEffect, useCallback } from 'react';
import { AuthSession, EncryptedIdentity } from "../../utils/crypto";
import { SecureStorage } from "../../utils/storage";
import { UnifiedAuth } from '../UnifiedAuth';
import { BiometricAuth } from "../../utils/biometric";
import { logger } from "../../utils/logger";

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

  const storage = new SecureStorage();

  // Check authentication status on mount
  useEffect(() => {
    checkAuthenticationStatus();
  }, []);

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

  const handleBiometricAuth = useCallback(async () => {
    try {
      const biometricAuth = new BiometricAuth();
      const isSupported = await biometricAuth.isSupported();
      
      if (isSupported) {
        const result = await biometricAuth.authenticate();
        if (result.success) {
          // Handle successful biometric authentication
          await checkAuthenticationStatus();
        }
      }
    } catch (error) {
      logger.error('Biometric authentication error:', error);
    }
  }, [checkAuthenticationStatus]);

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
            Welcome back, {currentSession?.pnName || 'User'}
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
