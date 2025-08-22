/**
 * Decentralized Authentication Manager for Frontend
 * 
 * Manages authentication state and provides a clean interface for DID-based authentication
 */

import { DecentralizedAuthSDK, AuthenticationResult, UserInfo } from '../../../sdk/identity-sdk/src/DecentralizedAuthSDK';
import { Identity } from '../../../core/identity-core/src/types';

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
      console.warn('Session validation failed:', error);
      this.clearStoredAuth();
      this.updateAuthState({ isAuthenticated: false, isLoading: false });
    }
  }

  /**
   * Start monitoring session validity
   */
  private startSessionMonitoring(): void {
    // Check session every 5 minutes
    this.sessionCheckInterval = setInterval(() => {
      if (this.authState.isAuthenticated && this.authState.session?.did) {
        this.sdk.validateSession(this.authState.session.did).then(isValid => {
          if (!isValid) {
            this.handleSessionExpired();
          }
        });
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Handle session expiration
   */
  private handleSessionExpired(): void {
    console.log('Session expired, logging out');
    this.clearStoredAuth();
    this.updateAuthState({
      isAuthenticated: false,
      currentIdentity: undefined,
      session: undefined,
      userInfo: undefined,
      error: 'Session expired'
    });
  }

  /**
   * Authenticate with an identity
   */
  async authenticateWithIdentity(identity: Identity): Promise<boolean> {
    this.updateAuthState({ isLoading: true, error: undefined });

    try {
      const result = await this.sdk.authenticateWithRetry(identity);
      
      if (result.success && result.session) {
        // Store session and identity
        localStorage.setItem('auth_session', JSON.stringify(result.session));
        localStorage.setItem('current_identity', JSON.stringify(identity));

        // Get user info
        const userInfo = await this.sdk.getUserInfo(identity.id);

        this.updateAuthState({
          isAuthenticated: true,
          currentIdentity: identity,
          session: result.session,
          userInfo,
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
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      this.updateAuthState({
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage
      });
      return false;
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      if (this.authState.session?.did) {
        await this.sdk.logout(this.authState.session.did);
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      this.clearStoredAuth();
      this.updateAuthState({
        isAuthenticated: false,
        currentIdentity: undefined,
        session: undefined,
        userInfo: undefined,
        error: undefined
      });
    }
  }

  /**
   * Clear stored authentication data
   */
  private clearStoredAuth(): void {
    localStorage.removeItem('auth_session');
    localStorage.removeItem('current_identity');
  }

  /**
   * Update authentication state and notify listeners
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...updates };
    
    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.authState);
      } catch (error) {
        console.warn('Auth state listener error:', error);
      }
    });
  }

  /**
   * Subscribe to authentication state changes
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current state
    listener(this.authState);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  /**
   * Get current identity
   */
  getCurrentIdentity(): Identity | undefined {
    return this.authState.currentIdentity;
  }

  /**
   * Get current session
   */
  getCurrentSession(): AuthSession | undefined {
    return this.authState.session;
  }

  /**
   * Get user info
   */
  getUserInfo(): UserInfo | undefined {
    return this.authState.userInfo;
  }

  /**
   * Refresh user info
   */
  async refreshUserInfo(): Promise<void> {
    if (!this.authState.session?.did) {
      return;
    }

    try {
      const userInfo = await this.sdk.getUserInfo(this.authState.session.did);
      this.updateAuthState({ userInfo });
    } catch (error) {
      console.warn('Failed to refresh user info:', error);
    }
  }

  /**
   * Resolve a DID
   */
  async resolveDID(did: string): Promise<any> {
    return await this.sdk.resolveDID(did);
  }

  /**
   * Create authentication challenge (for advanced use cases)
   */
  async createChallenge(did: string): Promise<any> {
    return await this.sdk.createChallenge(did);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    
    this.listeners.clear();
    this.sdk.destroy();
  }
}

// Export singleton instance
export const decentralizedAuthManager = new DecentralizedAuthManager();

// React hook for using decentralized authentication
export const useDecentralizedAuth = () => {
  const [authState, setAuthState] = React.useState<AuthState>(decentralizedAuthManager.getAuthState());

  React.useEffect(() => {
    const unsubscribe = decentralizedAuthManager.subscribe(setAuthState);
    return unsubscribe;
  }, []);

  const authenticate = React.useCallback(async (identity: Identity) => {
    return await decentralizedAuthManager.authenticateWithIdentity(identity);
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
    getCurrentIdentity: decentralizedAuthManager.getCurrentIdentity.bind(decentralizedAuthManager),
    getCurrentSession: decentralizedAuthManager.getCurrentSession.bind(decentralizedAuthManager),
    getUserInfo: decentralizedAuthManager.getUserInfo.bind(decentralizedAuthManager),
    resolveDID: decentralizedAuthManager.resolveDID.bind(decentralizedAuthManager)
  };
};
