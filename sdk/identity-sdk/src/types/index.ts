import { StandardDataPoint, ZKPProof, DataPointProposal } from './standardDataPoints';

// Core Identity Types
export interface Identity {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'suspended';
  metadata: Record<string, any>;
  privateKey?: CryptoKey;
}

// Authentication Types
export interface AuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  responseType: 'code' | 'token' | 'id_token';
  responseMode?: 'query' | 'fragment' | 'form_post';
}

export interface AuthResponse {
  code?: string;
  accessToken?: string;
  idToken?: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
  state?: string;
}

export interface TokenInfo {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
  refreshToken?: string;
}

// Cross-Platform Types
export interface PlatformConfig {
  name: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  endpoints: {
    authorization: string;
    token: string;
    userInfo: string;
    revocation?: string;
  };
}

export interface IdentityProvider {
  name: string;
  type: 'oauth2' | 'oidc' | 'custom';
  config: PlatformConfig;
  metadata: Record<string, any>;
}

// SDK Configuration
export interface SDKConfig {
  identityProvider: IdentityProvider;
  storage?: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'memory';
  autoRefresh?: boolean;
  tokenExpiryBuffer?: number; // seconds before expiry to refresh
  debug?: boolean;
  dashboardId?: string;
}

// User Session
export interface UserSession {
  identity: Identity;
  tokens: TokenInfo;
  platform: string;
  createdAt: string;
  lastActive: string;
}

// Error Types
export interface IdentityError extends Error {
  code: string;
  status?: number;
  details?: Record<string, any>;
}

export enum ErrorCodes {
  INVALID_CLIENT = 'invalid_client',
  INVALID_REQUEST = 'invalid_request',
  INVALID_SCOPE = 'invalid_scope',
  INVALID_TOKEN = 'invalid_token',
  UNAUTHORIZED_CLIENT = 'unauthorized_client',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  ACCESS_DENIED = 'access_denied',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
  NETWORK_ERROR = 'network_error',
  STORAGE_ERROR = 'storage_error',
  CRYPTO_ERROR = 'crypto_error'
}

// Event Types
export interface IdentityEvent {
  type: string;
  timestamp: string;
  data?: any;
}

export enum EventTypes {
  AUTH_STARTED = 'auth_started',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',
  TOKEN_REFRESH = 'token_refresh',
  TOKEN_EXPIRED = 'token_expired',
  SESSION_EXPIRED = 'session_expired',
  LOGOUT = 'logout'
}

// Compliance and Data Collection
export interface ComplianceData {
  platform: string;
  requiredFields: string[];
  optionalFields: string[];
  dataRetention: {
    period: number; // days
    purpose: string;
  };
  consentRequired: boolean;
}

export interface DataCollectionRequest {
  platform: string;
  dataPoints: string[]; // Array of standard data point IDs
  verificationLevel?: 'basic' | 'enhanced' | 'verified';
  expirationDays?: number;
  consentText: string;
  dataUsage: string;
  purpose: string;
}

export interface DataCollectionResponse {
  success: boolean;
  proofs: ZKPProof[];
  dataPoints: string[];
  timestamp: string;
  expiresAt?: string;
}

export interface StandardDataPointRequest {
  dataPointId: string;
  platform: string;
  purpose: string;
  verificationLevel?: 'basic' | 'enhanced' | 'verified';
  expirationDays?: number;
}

export interface StandardDataPointResponse {
  success: boolean;
  proof: ZKPProof;
  dataPoint: StandardDataPoint;
}

export interface DataPointProposalRequest {
  name: string;
  description: string;
  category: 'identity' | 'verification' | 'preferences' | 'compliance' | 'location';
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
  requiredFields: string[];
  optionalFields?: string[];
  validation?: any;
  examples: string[];
  useCase: string;
  proposedBy: string;
}

export interface DataPointProposalResponse {
  success: boolean;
  proposalId?: string;
  error?: string;
}

export interface VoteRequest {
  proposalId: string;
  voterId: string;
  vote: 'upvote' | 'downvote';
}

export interface VoteResponse {
  success: boolean;
  error?: string;
} 