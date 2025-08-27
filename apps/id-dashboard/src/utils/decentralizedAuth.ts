/**
 * Decentralized Authentication Manager for Frontend
 * 
 * Manages authentication state and provides a clean interface for DID-based authentication
 */

import React from 'react';

// Mock types and interfaces
export interface Identity {
  id: string;
  name: string;
  did: string;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
  username?: string;
  deviceId?: string;
  permissions?: string[];
  metadata?: {
    displayName?: string;
    [key: string]: any;
  };
}

export interface AuthenticationResult {
  success: boolean;
  session?: AuthSession;
  error?: string;
}

export interface UserInfo {
  did: string;
  name: string;
  email?: string;
  avatar?: string;
  permissions: string[];
  verified?: boolean;
}

export interface AuthSession {
  did: string;
  authenticatedAt: string;
  expiresAt: string;
  deviceId: string;
  permissions: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  currentIdentity?: Identity;
  session?: AuthSession;
  userInfo?: UserInfo;
  isLoading: boolean;
  error?: string;
}

// Mock SDK class
class DecentralizedAuthSDK {
  constructor(config: any) {
    console.log('Mock SDK initialized with config:', config);
  }

  async validateSession(did: string): Promise<boolean> {
    // Mock validation - always return true for demo
    return true;
  }

  async getUserInfo(did: string): Promise<UserInfo> {
    return {
      did,
      name: 'Demo User',
      permissions: ['read', 'write']
    };
  }

  async authenticate(identity: Identity): Promise<AuthenticationResult> {
    const session: AuthSession = {
      did: identity.did,
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      deviceId: 'demo-device',
      permissions: ['read', 'write']
    };

    return {
      success: true,
      session
    };
  }

  async logout(): Promise<void> {
    // Mock logout
    console.log('Mock logout called');
  }
}

export class DecentralizedAuthManager {
  private sdk: DecentralizedAuthSDK;
  private authState: AuthState;
  private listeners: Set<(state: AuthState) => void> = new Set();
  private sessionCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.sdk = new DecentralizedAuthSDK({
      apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:3001',
      enableWebSocket: true,
      retryAttempts: 3
    });

    this.authState = {
      isAuthenticated: false,
      isLoading: false
    };

    this.initializeFromStorage();
    this.startSessionMonitoring();
  }

  /**
   * Initialize authentication state from local storage
   */
  private initializeFromStorage(): void {
    try {
      const storedSession = localStorage.getItem('auth_session');
      const storedIdentity = localStorage.getItem('current_identity');

      if (storedSession && storedIdentity) {
        const session = JSON.parse(storedSession);
        const identity = JSON.parse(storedIdentity);

        this.authState = {
          isAuthenticated: false, // Will be validated
          currentIdentity: identity,
          session: session,
          isLoading: true
        };

        // Validate session in background
        this.validateStoredSession();
      }
    } catch (error) {
      console.warn('Failed to initialize auth state from storage:', error);
      this.clearStoredAuth();
    }
  }

  /**
   * Validate stored session with server
   */
  private async validateStoredSession(): Promise<void> {
    if (!this.authState.session?.did) {
      this.updateAuthState({ isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const isValid = await this.sdk.validateSession(this.authState.session.did);
      
      if (isValid) {
        // Get fresh user info
        const userInfo = await this.sdk.getUserInfo(this.authState.session.did);
        
        this.updateAuthState({
          isAuthenticated: true,
          isLoading: false,
          userInfo
        });
      } else {
        // Session expired, clear it
        this.clearStoredAuth();
        this.updateAuthState({ isAuthenticated: false, isLoading: false });
      }
    } catch (error) {
      console.error('Session validation failed:', error);
      this.clearStoredAuth();
      this.updateAuthState({ 
        isAuthenticated: false, 
        isLoading: false, 
        error: 'Session validation failed' 
      });
    }
  }

  /**
   * Start monitoring session validity
   */
  private startSessionMonitoring(): void {
    this.sessionCheckInterval = setInterval(() => {
      if (this.authState.isAuthenticated && this.authState.session) {
        const now = Date.now();
        const expiresAt = new Date(this.authState.session.expiresAt).getTime();
        
        if (now >= expiresAt) {
          console.log('Session expired, logging out');
          this.logout();
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Update authentication state and notify listeners
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...updates };
    
    // Store in localStorage
    if (this.authState.session) {
      localStorage.setItem('auth_session', JSON.stringify(this.authState.session));
    }
    if (this.authState.currentIdentity) {
      localStorage.setItem('current_identity', JSON.stringify(this.authState.currentIdentity));
    }
    
    // Notify listeners
    this.listeners.forEach(listener => listener(this.authState));
  }

  /**
   * Clear stored authentication data
   */
  private clearStoredAuth(): void {
    localStorage.removeItem('auth_session');
    localStorage.removeItem('current_identity');
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Subscribe to authentication state changes
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Authenticate with an identity
   */
  async authenticate(identity: Identity): Promise<boolean> {
    this.updateAuthState({ isLoading: true, error: undefined });

    try {
      const result = await this.sdk.authenticate(identity);
      
      if (result.success && result.session) {
        this.updateAuthState({
          isAuthenticated: true,
          currentIdentity: identity,
          session: result.session,
          isLoading: false
        });
        return true;
      } else {
        this.updateAuthState({
          isAuthenticated: false,
          isLoading: false,
          error: result.error || 'Authentication failed'
        });
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      this.updateAuthState({
        isAuthenticated: false,
        isLoading: false,
        error: 'Authentication failed'
      });
      return false;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await this.sdk.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearStoredAuth();
      this.updateAuthState({
        isAuthenticated: false,
        currentIdentity: undefined,
        session: undefined,
        userInfo: undefined,
        isLoading: false,
        error: undefined
      });
    }
  }

  /**
   * Refresh user information
   */
  async refreshUserInfo(): Promise<void> {
    if (!this.authState.session?.did) return;

    try {
      const userInfo = await this.sdk.getUserInfo(this.authState.session.did);
      this.updateAuthState({ userInfo });
    } catch (error) {
      console.error('Failed to refresh user info:', error);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    this.listeners.clear();
  }
}

// Create singleton instance
export const decentralizedAuthManager = new DecentralizedAuthManager();

// React hooks for use in components
export const useDecentralizedAuth = () => {
  const [authState, setAuthState] = React.useState<AuthState>(decentralizedAuthManager.getAuthState());

  React.useEffect(() => {
    const unsubscribe = decentralizedAuthManager.subscribe(setAuthState);
    return unsubscribe;
  }, []);

  const authenticate = React.useCallback(async (identity: Identity) => {
    return await decentralizedAuthManager.authenticate(identity);
  }, []);

  const logout = React.useCallback(async () => {
    await decentralizedAuthManager.logout();
  }, []);

  const refreshUserInfo = React.useCallback(async () => {
    await decentralizedAuthManager.refreshUserInfo();
  }, []);

  return {
    ...authState,
    authenticate,
    logout,
    refreshUserInfo,
    getCurrentIdentity: () => authState.currentIdentity,
    getUserInfo: () => authState.userInfo
  };
};

