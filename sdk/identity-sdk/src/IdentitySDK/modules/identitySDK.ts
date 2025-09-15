import { cryptoWorkerManager } from './cryptoWorkerManager';
import { 
  Identity, 
  AuthRequest, 
  AuthResponse, 
  UserSession, 
  SDKConfig, 
  IdentityProvider,
  IdentityError,
  ErrorCo,
  EventTypes,
  IdentityEvent,
  AccessRequestResponse,
  EcosystemDataResponse
} from '../types';
import { AuthenticationManager } from './authenticationManager';
import { ZKPManager } from './zkpManager';
import { DataCollectionManager } from './dataCollectionManager';
import { SDK_DEFAULTS, ERROR_MESSAGES } from '../constants/sdkConstants';

export class IdentitySDK {
  private config: SDKConfig;
  private storage: any;
  private authenticationManager: AuthenticationManager;
  private zkpManager: ZKPManager;
  private dataCollectionManager: DataCollectionManager;
  private session: UserSession | null = null;

  constructor(config: SDKConfig, storage?: any) {
    this.config = config;
    this.storage = storage;
    
    // Initialize managers
    this.authenticationManager = new AuthenticationManager(config, storage);
    this.zkpManager = new ZKPManager();
    this.dataCollectionManager = new DataCollectionManager();
    
    // Load stored session
    this.loadStoredSession();
  }

  /**
   * Initialize authentication flow
   */
  async initializeAuth(): Promise<AuthRequest> {
    return this.authenticationManager.initializeAuth();
  }

  /**
   * Handle authentication callback
   */
  async handleAuthCallback(url: string): Promise<AuthResponse> {
    const response = await this.authenticationManager.handleAuthCallback(url);
    
    if (response.success && response.session) {
      this.session = response.session;
      this.emit(EventTypes.LOGIN, response.session);
    }
    
    return response;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.authenticationManager.logout();
    this.session = null;
    this.emit(EventTypes.LOGOUT);
  }

  /**
   * Get current session
   */
  getCurrentSession(): UserSession | null {
    return this.authenticationManager.getCurrentSession();
  }

  /**
   * Check if session is valid
   */
  isSessionValid(): boolean {
    return this.authenticationManager.isSessionValid();
  }

  /**
   * Refresh session if needed
   */
  async refreshSessionIfNeeded(): Promise<boolean> {
    return this.authenticationManager.refreshSessionIfNeeded();
  }

  /**
   * Get compliance data for platform
   */
  getComplianceData(platform: string) {
    return this.dataCollectionManager.getComplianceData(platform);
  }

  /**
   * Request additional data collection from user
   */
  async requestDataCollection(request: any): Promise<any> {
    return this.dataCollectionManager.requestDataCollection(request);
  }

  /**
   * Request a single standard data point
   */
  async requestStandardDataPoint(request: any): Promise<any> {
    return this.dataCollectionManager.requestStandardDataPoint(request);
  }

  /**
   * Propose a new standard data point
   */
  async proposeDataPoint(proposal: any): Promise<any> {
    return this.dataCollectionManager.proposeDataPoint(proposal);
  }

  /**
   * Vote on a data point proposal
   */
  async voteOnProposal(vote: any): Promise<any> {
    return this.dataCollectionManager.voteOnProposal(vote);
  }

  /**
   * Generate zero-knowledge proof
   */
  async generateProof(type: string, data: any): Promise<any> {
    switch (type) {
      case 'schnorr':
        return this.zkpManager.generateSchnorrProof(data.privateKey);
      case 'pedersen':
        return this.zkpManager.generatePedersenProof(data.publicPNId);
      default:
        throw new Error(`Unknown proof type: ${type}`);
    }
  }

  /**
   * Verify zero-knowledge proof
   */
  async verifyProof(proof: any, type: string): Promise<boolean> {
    return this.zkpManager.verifyProof(proof, type);
  }

  /**
   * Generate data point access proof
   */
  async generateDataPointProof(dataPointId: string, userId: string): Promise<any> {
    return this.zkpManager.generateDataPointProof(dataPointId, userId);
  }

  /**
   * Generate ownership proof
   */
  async generateOwnershipProof(data: any): Promise<any> {
    return this.zkpManager.generateOwnershipProof(data);
  }

  /**
   * Get available standard data points
   */
  getAvailableDataPoints(): Record<string, any> {
    return this.dataCollectionManager.getAvailableDataPoints();
  }

  /**
   * Validate data point request
   */
  validateDataPointRequest(dataPointId: string): boolean {
    return this.dataCollectionManager.validateDataPointRequest(dataPointId);
  }

  /**
   * Get data point metadata
   */
  getDataPointMetadata(dataPointId: string): any {
    return this.dataCollectionManager.getDataPointMetadata(dataPointId);
  }

  /**
   * Emit event
   */
  private emit(eventType: string, data?: any): void {
    const event = new CustomEvent(`identity:${eventType}`, { detail: data });
    window.dispatchEvent(event);
  }

  /**
   * Load stored session
   */
  private async loadStoredSession(): Promise<void> {
    try {
      const storedSession = await this.authenticationManager.getCurrentSession();
      if (storedSession && this.authenticationManager.isSessionValid()) {
        this.session = storedSession;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        // Failed to load stored session
      }
    }
  }

  /**
   * Get authentication manager
   */
  getAuthenticationManager(): AuthenticationManager {
    return this.authenticationManager;
  }

  /**
   * Get ZKP manager
   */
  getZKPManager(): ZKPManager {
    return this.zkpManager;
  }

  /**
   * Get data collection manager
   */
  getDataCollectionManager(): DataCollectionManager {
    return this.dataCollectionManager;
  }
}
