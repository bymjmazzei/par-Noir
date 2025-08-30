import { 
  Identity, 
  AuthRequest, 
  AuthResponse, 
  TokenInfo, 
  UserSession, 
  SDKConfig, 
  IdentityProvider,
  IdentityError,
  ErrorCodes,
  EventTypes,
  IdentityEvent,
  ComplianceData,
  DataCollectionRequest,
  DataCollectionResponse,
  StandardDataPointRequest,
  StandardDataPointResponse,
  DataPointProposalRequest,
  DataPointProposalResponse,
  VoteRequest,
  VoteResponse
} from './types';
import { StandardDataPoint, DataPointProposal } from './types/standardDataPoints';

import { ZKPGenerator, STANDARD_DATA_POINTS } from './types/standardDataPoints';

// Stub implementations for SDK compatibility
export interface SecureSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  data: any;
}

export interface TimestampedZKProof {
  proof: any;
  timestamp: string;
  signature: string;
}

export class MetadataValidator {
  async validate(metadata: any): Promise<boolean> {
    return true;
  }
}

export class SessionManager {
  async createSession(userId: string, data: any): Promise<SecureSession> {
    throw new Error('Not implemented');
  }
  
  async getSession(sessionId: string): Promise<SecureSession | null> {
    throw new Error('Not implemented');
  }
  
  async validateSession(sessionId: string): Promise<boolean> {
    throw new Error('Not implemented');
  }
}

export class ZKProofManager {
  async generateProof(data: any): Promise<TimestampedZKProof> {
    throw new Error('Not implemented');
  }
  
  async verifyProof(proof: TimestampedZKProof): Promise<boolean> {
    throw new Error('Not implemented');
  }
}

export class ThreatDetector {
  static recordEvent(event: any): void {
    // Stub implementation
  }
}

// Import storage implementations
import { IndexedDBStorage } from './IndexedDBStorage';
import { MemoryStorage } from './MemoryStorage';

// Storage interface
interface StorageInterface {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  length(): Promise<number>;
}

// License validation types
interface LicenseInfo {
  licenseKey: string;
  type: 'commercial' | 'enterprise';
  companyName: string;
  email: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'pending';
  identityHash?: string;
  identityName?: string;
}

interface CommercialUseOptions {
  commercialUse?: boolean;
  revenueGeneration?: boolean;
  paidService?: boolean;
  enterpriseFeatures?: boolean;
}

export class IdentitySDK {
  private config: SDKConfig;
  private storage: StorageInterface;
  private sessionManager: SessionManager;
  private metadataValidator: MetadataValidator;
  private zkProofManager: ZKProofManager;
  private threatDetector: ThreatDetector;
  private licenseKey: string | null = null;
  private licenseInfo: LicenseInfo | null = null;
  private session: UserSession | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  constructor(config: SDKConfig) {
    this.config = config;
    this.storage = config.storage === 'indexedDB' ? new IndexedDBStorage() : new MemoryStorage();
    this.sessionManager = new SessionManager();
    this.metadataValidator = new MetadataValidator();
    this.zkProofManager = new ZKProofManager();
    this.threatDetector = new ThreatDetector();
    
    // Load license from storage
    this.loadLicenseFromStorage();
  }

  private loadLicenseFromStorage(): void {
    try {
      // Load license from localStorage or environment
      this.licenseKey = localStorage.getItem('identity_protocol_license') || 
                       process.env.IDENTITY_PROTOCOL_LICENSE || 
                       null;
      
      if (this.licenseKey) {
        this.licenseInfo = this.parseLicenseKey(this.licenseKey);
      }
    } catch (error) {
      console.warn('Failed to load license:', error);
    }
  }

  private parseLicenseKey(licenseKey: string): LicenseInfo {
    // Simple parsing for demo - in production, validate with server
    const parts = licenseKey.split('_');
    const type = parts[0] === 'COM' ? 'commercial' : 'enterprise';
    const timestamp = parseInt(parts[1]);
    
    return {
      licenseKey,
      type,
      companyName: 'Demo Company', // In production, fetch from server
      email: 'demo@company.com', // In production, fetch from server
      issuedAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      status: 'active'
    };
  }

  private async validateLicenseWithServer(licenseKey: string, identityHash?: string): Promise<boolean> {
    try {
      // In production, validate with your server
      const response = await fetch('https://identityprotocol.com/api/validate-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          licenseKey,
          identityHash // Include identity hash for validation
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.valid === true) {
          // Store identity info for future use
          this.licenseInfo = {
            ...this.licenseInfo!,
            identityHash: result.identityHash,
            identityName: result.identityName
          };
          return true;
        }
      }
      
      return false;
    } catch (error) {
      // Fallback to local validation for offline use
      console.warn('Server validation failed, using local validation:', error);
      return this.parseLicenseKey(licenseKey).status === 'active';
    }
  }

  private isCommercialUse(platform: string, options?: CommercialUseOptions | DataCollectionRequest): boolean {
    // Detect commercial use patterns
    const commercialIndicators = [
      options && 'commercialUse' in options && options.commercialUse === true,
      options && 'revenueGeneration' in options && options.revenueGeneration === true,
      options && 'paidService' in options && options.paidService === true,
      options && 'enterpriseFeatures' in options && options.enterpriseFeatures === true,
      platform.includes('enterprise'),
      platform.includes('business'),
      platform.includes('corporate'),
      platform.includes('commercial'),
      platform.includes('paid'),
      platform.includes('premium')
    ];

    return commercialIndicators.some(indicator => indicator === true);
  }

  private async requireCommercialLicense(operation: string, identityHash?: string): Promise<void> {
    if (!this.licenseKey) {
      throw new Error(`Commercial license required for ${operation}. Please purchase a license at https://identityprotocol.com/license`);
    }
    
    // Validate license with server (including identity hash)
    const isValid = await this.validateLicenseWithServer(this.licenseKey, identityHash);
    if (!isValid) {
      throw new Error(`Invalid or expired license for ${operation}. Please renew at https://identityprotocol.com/license`);
    }
  }

  // Set license key (for dashboard integration)
  setLicenseKey(licenseKey: string): void {
    this.licenseKey = licenseKey;
    this.licenseInfo = this.parseLicenseKey(licenseKey);
    localStorage.setItem('identity_protocol_license', licenseKey);
  }

  // Get current license info
  getLicenseInfo(): LicenseInfo | null {
    return this.licenseInfo;
  }

  // Check if commercial license is active
  hasCommercialLicense(): boolean {
    return this.licenseKey !== null && this.licenseInfo?.status === 'active';
  }

  // Get current identity hash for license validation
  private async getCurrentIdentityHash(): Promise<string | undefined> {
    try {
      // Try to get current identity from storage
      const currentIdentity = await this.storage.getItem('current_identity');
      if (currentIdentity) {
        // Generate hash of current identity
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(currentIdentity));
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
      return undefined;
    } catch (error) {
      console.warn('Failed to get current identity hash:', error);
      return undefined;
    }
  }

  /**
   * Start authentication flow (OAuth-like) with enhanced security
   */
  async authenticate(platform: string, options?: {
    scope?: string[];
    state?: string;
    nonce?: string;
    responseType?: 'code' | 'token' | 'id_token';
  } & CommercialUseOptions): Promise<AuthResponse> {
    // Check if this is commercial use
    if (this.isCommercialUse(platform, options)) {
      // Get current identity hash if available
      const currentIdentityHash = await this.getCurrentIdentityHash();
      await this.requireCommercialLicense('authentication', currentIdentityHash);
    }

    // Record security event
    ThreatDetector.recordEvent({
      eventType: 'authentication_started',
      userId: 'anonymous',
      dashboardId: this.config.dashboardId || 'unknown',
      details: { platform, options },
      riskLevel: 'low'
    });
    try {
      this.emit(EventTypes.AUTH_STARTED, { platform, options });

      const provider = this.getProvider(platform);
      const authRequest: AuthRequest = {
        clientId: provider.config.clientId,
        redirectUri: provider.config.redirectUri,
        scope: options?.scope || provider.config.scopes,
        state: options?.state || this.generateState(),
        nonce: options?.nonce || this.generateNonce(),
        responseType: options?.responseType || 'code'
      };

      // Build authorization URL
      const authUrl = this.buildAuthUrl(provider, authRequest);
      
      // Store auth state for verification
      this.storeAuthState(authRequest);

      // Redirect to authorization endpoint
      window.location.href = authUrl;

      // Return a placeholder response since we're redirecting
      return {
        code: undefined,
        accessToken: undefined,
        idToken: undefined,
        tokenType: 'Bearer',
        expiresIn: 0,
        scope: [],
        state: authRequest.state
      };

    } catch (error) {
      const identityError = this.createError(ErrorCodes.SERVER_ERROR, error);
      this.emit(EventTypes.AUTH_ERROR, identityError);
      throw identityError;
    }
  }

  /**
   * Handle authentication callback
   */
  async handleCallback(url: string): Promise<UserSession> {
    try {
      const params = new URLSearchParams(url.split('?')[1] || '');
      const code = params.get('code');
      const state = params.get('state');
      const error = params.get('error');

      if (error) {
        throw new Error(`Authentication failed: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Verify state parameter
      const storedState = await this.getStoredAuthState();
      if (state !== storedState) {
        throw new Error('State parameter mismatch');
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(code);
      
      // Get user information
      const identity = await this.getUserInfo(tokens.accessToken);
      
      // Create session
      this.session = {
        identity,
        tokens,
        platform: this.config.identityProvider.name,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };

      // Store session
      this.storeSession(this.session);

      this.emit(EventTypes.AUTH_SUCCESS, this.session);
      return this.session;

    } catch (error) {
      const identityError = this.createError(ErrorCodes.SERVER_ERROR, error);
      this.emit(EventTypes.AUTH_ERROR, identityError);
      throw identityError;
    }
  }

  /**
   * Get current user session
   */
  async getCurrentSession(): Promise<UserSession | null> {
    if (!this.session) {
      this.session = await this.getStoredSession();
    }
    return this.session;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session) return false;

    // Check if token is expired
    const expiryTime = new Date(session.tokens.expiresIn * 1000);
    const now = new Date();
    
    if (now >= expiryTime) {
      await this.logout();
      return false;
    }

    return true;
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<TokenInfo> {
    const session = await this.getCurrentSession();
    if (!session?.tokens.refreshToken) {
      throw this.createError(ErrorCodes.INVALID_TOKEN, 'No refresh token available');
    }

    try {
      const provider = this.config.identityProvider;
      const response = await fetch(provider.config.endpoints.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.tokens.refreshToken,
          client_id: provider.config.clientId,
          ...(provider.config.clientSecret && {
            client_secret: provider.config.clientSecret
          })
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const newTokens: TokenInfo = await response.json();
      
      // Update session
      if (this.session) {
        this.session.tokens = newTokens;
        this.session.lastActive = new Date().toISOString();
        this.storeSession(this.session);
      }

      this.emit(EventTypes.TOKEN_REFRESH, newTokens);
      return newTokens;

    } catch (error) {
      const identityError = this.createError(ErrorCodes.INVALID_TOKEN, error);
      this.emit(EventTypes.TOKEN_EXPIRED, identityError);
      throw identityError;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      const session = await this.getCurrentSession();
      if (session?.tokens.accessToken) {
        // Revoke token if endpoint is available
        const provider = this.config.identityProvider;
        if (provider.config.endpoints.revocation) {
          await fetch(provider.config.endpoints.revocation, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: session.tokens.accessToken,
              client_id: provider.config.clientId,
              ...(provider.config.clientSecret && {
                client_secret: provider.config.clientSecret
              })
            })
          });
        }
      }

      // Clear session
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();

      this.emit(EventTypes.LOGOUT);

    } catch (error) {
      // Silently handle logout errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      // Still clear local session even if server logout fails
      this.session = null;
      this.clearStoredSession();
      this.clearStoredAuthState();
    }
  }

  /**
   * Get compliance data for platform
   */
  getComplianceData(platform: string): ComplianceData {
    // This would typically come from the platform's configuration
    return {
      platform,
      requiredFields: ['email', 'displayName'],
      optionalFields: ['phone', 'address', 'dateOfBirth'],
      dataRetention: {
        period: 365, // days
        purpose: 'Account management and service provision'
      },
      consentRequired: true
    };
  }

  /**
   * Request additional data collection from user using standardized data points
   */
  async requestDataCollection(request: DataCollectionRequest): Promise<DataCollectionResponse> {
    // Validate commercial license for data collection
    if (this.isCommercialUse(request.platform, request)) {
      const currentIdentityHash = await this.getCurrentIdentityHash();
      await this.requireCommercialLicense('data collection', currentIdentityHash);
    }

    // Validate requested data points
    const invalidDataPoints = request.dataPoints.filter(dp => !STANDARD_DATA_POINTS[dp]);
    if (invalidDataPoints.length > 0) {
      throw new Error(`Invalid data points: ${invalidDataPoints.join(', ')}`);
    }

    return new Promise((resolve, reject) => {
      // This would typically show a modal or redirect to a data collection form
      const event = new CustomEvent('identity:dataCollection', {
        detail: { request, resolve, reject }
      });
      window.dispatchEvent(event);
    });
  }

  /**
   * Request a single standard data point
   */
  async requestStandardDataPoint(request: StandardDataPointRequest): Promise<StandardDataPointResponse> {
    // Validate data point exists
    const dataPoint = STANDARD_DATA_POINTS[request.dataPointId];
    if (!dataPoint) {
      throw new Error(`Unknown data point: ${request.dataPointId}`);
    }

    return new Promise((resolve, reject) => {
      const event = new CustomEvent('identity:standardDataPoint', {
        detail: { request, dataPoint, resolve, reject }
      });
      window.dispatchEvent(event);
    });
  }

  /**
   * Propose a new standard data point
   */
  async proposeDataPoint(proposal: DataPointProposalRequest): Promise<DataPointProposalResponse> {
    try {
      // Validate proposal
      if (!proposal.name || !proposal.description || !proposal.useCase) {
        return { success: false, error: 'Missing required fields' };
      }

      // Check if data point already exists
      const existingDataPoint = Object.values(STANDARD_DATA_POINTS).find(
        dp => dp.name.toLowerCase() === proposal.name.toLowerCase()
      );
      if (existingDataPoint) {
        return { success: false, error: 'Data point already exists' };
      }

      // Submit proposal
      const result = await ZKPGenerator.proposeDataPoint({
        name: proposal.name,
        description: proposal.description,
        category: proposal.category,
        dataType: proposal.dataType,
        requiredFields: proposal.requiredFields,
        optionalFields: proposal.optionalFields,
        validation: proposal.validation,
        examples: proposal.examples,
        useCase: proposal.useCase,
        proposedBy: proposal.proposedBy
      });
      
      if (result.success) {
        return { success: true, proposalId: result.proposalId };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to propose data point' 
      };
    }
  }

  /**
   * Vote on a data point proposal
   */
  async voteOnProposal(request: VoteRequest): Promise<VoteResponse> {
    try {
      const result = await ZKPGenerator.voteOnProposal(
        request.proposalId, 
        request.voterId, 
        request.vote
      );
      
      return { success: result.success, error: result.error };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to vote on proposal' 
      };
    }
  }

  /**
   * Get pending data point proposals
   */
  getPendingProposals(): DataPointProposal[] {
    return ZKPGenerator.getPendingProposals();
  }

  /**
   * Get proposal by ID
   */
  getProposal(proposalId: string): DataPointProposal | undefined {
    return ZKPGenerator.getProposal(proposalId);
  }

  /**
   * Get available standard data points
   */
  getAvailableDataPoints(): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS);
  }

  /**
   * Get data points by category
   */
  getDataPointsByCategory(category: string): StandardDataPoint[] {
    return Object.values(STANDARD_DATA_POINTS).filter(dp => dp.category === category);
  }

  // Event handling
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // Silently handle event listener errors in production
          if (process.env.NODE_ENV === 'development') {
            // Development logging only
          }
        }
      });
    }
  }

  // Helper methods
  private getProvider(platform: string): IdentityProvider {
    // For now, return the configured provider
    // In the future, this could support multiple providers
    return this.config.identityProvider;
  }

  private buildAuthUrl(provider: IdentityProvider, request: AuthRequest): string {
    const params = new URLSearchParams({
      client_id: request.clientId,
      redirect_uri: request.redirectUri,
      scope: request.scope.join(' '),
      response_type: request.responseType,
      state: request.state!,
      ...(request.nonce && { nonce: request.nonce })
    });

    return `${provider.config.endpoints.authorization}?${params.toString()}`;
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenInfo> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: provider.config.redirectUri,
        client_id: provider.config.clientId,
        ...(provider.config.clientSecret && {
          client_secret: provider.config.clientSecret
        })
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  private async getUserInfo(accessToken: string): Promise<Identity> {
    const provider = this.config.identityProvider;
    const response = await fetch(provider.config.endpoints.userInfo, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return response.json();
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2);
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2);
  }

  private createError(code: string, error: any): IdentityError {
    return {
      name: 'IdentityError',
      message: error.message || 'Unknown error',
      code,
      details: error
    };
  }

  // Storage methods
  private storeAuthState(request: AuthRequest): void {
    if (this.storage) {
      this.storage.setItem('identity_auth_state', request.state!);
    }
  }

  private async getStoredAuthState(): Promise<string | null> {
    return await this.storage?.getItem('identity_auth_state') || null;
  }

  private clearStoredAuthState(): void {
    this.storage?.removeItem('identity_auth_state');
  }

  private storeSession(session: UserSession): void {
    if (this.storage) {
      this.storage.setItem('identity_session', JSON.stringify(session));
    }
  }

  private async getStoredSession(): Promise<UserSession | null> {
    const stored = await this.storage?.getItem('identity_session');
    return stored ? JSON.parse(stored) : null;
  }

  private clearStoredSession(): void {
    this.storage?.removeItem('identity_session');
  }
} 