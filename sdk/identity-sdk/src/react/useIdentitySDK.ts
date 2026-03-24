import { useState, useEffect, useCallback, useRef } from 'react';
import { IdentitySDK } from '../IdentitySDK';
import type { SDKConfig, UserSession, AuthCallbackResult } from '../types';
import { EventTypes } from '../types';

function identityEventName(type: EventTypes): string {
  return `identity:${type}`;
}

export const useIdentitySDK = (config: SDKConfig) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sdkRef = useRef<IdentitySDK | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sdk = new IdentitySDK(config);
    sdkRef.current = sdk;

    const onAuthSuccess = (e: Event) => {
      const detail = (e as CustomEvent<UserSession>).detail;
      if (detail) {
        setSession(detail);
        setIsAuthenticated(true);
        setError(null);
      }
    };

    const onAuthError = (e: Event) => {
      const detail = (e as CustomEvent<Error>).detail;
      setError(detail instanceof Error ? detail : new Error('Authentication error'));
      setIsAuthenticated(false);
    };

    const onLogout = () => {
      setSession(null);
      setIsAuthenticated(false);
      setError(null);
    };

    const onTokenExpired = () => {
      setSession(null);
      setIsAuthenticated(false);
    };

    window.addEventListener(identityEventName(EventTypes.AUTH_SUCCESS), onAuthSuccess);
    window.addEventListener(identityEventName(EventTypes.AUTH_ERROR), onAuthError);
    window.addEventListener(identityEventName(EventTypes.LOGOUT), onLogout);
    window.addEventListener(identityEventName(EventTypes.TOKEN_EXPIRED), onTokenExpired);

    const current = sdk.getCurrentSession();
    if (current && sdk.isSessionValid()) {
      setSession(current);
      setIsAuthenticated(true);
    }

    return () => {
      window.removeEventListener(identityEventName(EventTypes.AUTH_SUCCESS), onAuthSuccess);
      window.removeEventListener(identityEventName(EventTypes.AUTH_ERROR), onAuthError);
      window.removeEventListener(identityEventName(EventTypes.LOGOUT), onLogout);
      window.removeEventListener(identityEventName(EventTypes.TOKEN_EXPIRED), onTokenExpired);
      sdkRef.current = null;
    };
  }, [config]);

  const initializeAuth = useCallback(async () => {
    if (!sdkRef.current) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      return await sdkRef.current.initializeAuth();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('initializeAuth failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleAuthCallback = useCallback(async (url: string): Promise<AuthCallbackResult | undefined> => {
    if (!sdkRef.current) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await sdkRef.current.handleAuthCallback(url);
      if (result.success && result.session) {
        setSession(result.session);
        setIsAuthenticated(true);
      } else if (!result.success) {
        setError(new Error(result.error));
        setIsAuthenticated(false);
      }
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('handleAuthCallback failed'));
      setIsAuthenticated(false);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (!sdkRef.current) {
      return;
    }
    setIsLoading(true);
    try {
      await sdkRef.current.logout();
      setSession(null);
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('logout failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!sdkRef.current) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await sdkRef.current.refreshSessionIfNeeded();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('refresh failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCurrentSession = useCallback((): UserSession | null => {
    return sdkRef.current?.getCurrentSession() ?? null;
  }, []);

  const checkAuthentication = useCallback((): boolean => {
    return sdkRef.current?.isSessionValid() ?? false;
  }, []);

  return {
    session,
    isAuthenticated,
    isLoading,
    error,
    initializeAuth,
    handleAuthCallback,
    logout,
    refreshSession,
    getCurrentSession,
    checkAuthentication,
    sdk: sdkRef.current
  };
};
