import { useState, useEffect, useCallback, useRef } from 'react';
import { IdentitySDK, SDKConfig, UserSession, EventTypes } from '../index';

export const useIdentitySDK = (config: SDKConfig) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sdkRef = useRef<IdentitySDK | null>(null);

  // Initialize SDK
  useEffect(() => {
    if (!sdkRef.current) {
      sdkRef.current = new IdentitySDK(config);
      
      // Set up event listeners
      sdkRef.current.on(EventTypes.AUTH_SUCCESS, (session: UserSession) => {
        setSession(session);
        setIsAuthenticated(true);
        setError(null);
      });

      sdkRef.current.on(EventTypes.AUTH_ERROR, (error: Error) => {
        setError(error);
        setIsAuthenticated(false);
      });

      sdkRef.current.on(EventTypes.LOGOUT, () => {
        setSession(null);
        setIsAuthenticated(false);
        setError(null);
      });

      sdkRef.current.on(EventTypes.TOKEN_EXPIRED, () => {
        setSession(null);
        setIsAuthenticated(false);
      });

      // Check for existing session
      const currentSession = sdkRef.current.getCurrentSession();
      if (currentSession) {
        setSession(currentSession);
        setIsAuthenticated(sdkRef.current.isAuthenticated());
      }
    }
  }, [config]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sdkRef.current) {
        // Remove event listeners
        sdkRef.current.off(EventTypes.AUTH_SUCCESS, () => {});
        sdkRef.current.off(EventTypes.AUTH_ERROR, () => {});
        sdkRef.current.off(EventTypes.LOGOUT, () => {});
        sdkRef.current.off(EventTypes.TOKEN_EXPIRED, () => {});
      }
    };
  }, []);

  // Authentication methods
  const authenticate = useCallback(async (platform: string, options?: {
    scope?: string[];
    state?: string;
    nonce?: string;
    responseType?: 'code' | 'token' | 'id_token';
  }) => {
    if (!sdkRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await sdkRef.current.authenticate(platform, options);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (url: string) => {
    if (!sdkRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const newSession = await sdkRef.current.handleCallback(url);
      setSession(newSession);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err as Error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (!sdkRef.current) return;
    
    setIsLoading(true);
    
    try {
      await sdkRef.current.logout();
      setSession(null);
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!sdkRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await sdkRef.current.refreshToken();
      // Session will be updated via event listener
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Utility methods
  const getCurrentSession = useCallback(() => {
    return sdkRef.current?.getCurrentSession() || null;
  }, []);

  const checkAuthentication = useCallback(() => {
    return sdkRef.current?.isAuthenticated() || false;
  }, []);

  return {
    // State
    session,
    isAuthenticated,
    isLoading,
    error,
    
    // Methods
    authenticate,
    handleCallback,
    logout,
    refreshToken,
    getCurrentSession,
    checkAuthentication,
    
    // SDK instance (for advanced usage)
    sdk: sdkRef.current
  };
}; 