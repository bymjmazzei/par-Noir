/**
 * pN OAuth Service
 * Implements OAuth 2.0 authorization code flow for pN identity authentication
 * Similar to Google OAuth but uses pN identity files and passcodes
 */

import crypto from 'crypto';

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  did: string; // User's DID
  // pN name is NOT stored here - it's a secret and should never be stored
  expiresAt: number; // Timestamp
}

export interface AccessToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // seconds
  refresh_token?: string;
  scope?: string;
}

export interface TokenPayload {
  did: string;
  // pN name is NOT stored here - it's a secret and should never be stored
  pnIdentifier?: string; // pN identifier (e.g., "83c1db813607") derived from DID + publicKey
  clientId: string;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
}

// In-memory storage (in production, use Redis or database)
const authorizationCodes = new Map<string, AuthorizationCode>();
const refreshTokens = new Map<string, { did: string; clientId: string; scope: string[] }>();
const accessTokens = new Map<string, TokenPayload>();

// Cleanup expired codes/tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  
  // Clean expired authorization codes
  for (const [code, authCode] of authorizationCodes.entries()) {
    if (authCode.expiresAt < now) {
      authorizationCodes.delete(code);
    }
  }
  
  // Clean expired access tokens
  for (const [token, payload] of accessTokens.entries()) {
    if (payload.expiresAt < now) {
      accessTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

export class PNOAuthService {
  private static readonly CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes
  private static readonly ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  private static readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
  private static readonly TOKEN_SECRET = process.env.PN_OAUTH_SECRET || crypto.randomBytes(32).toString('hex');

  /**
   * Generate authorization code
   */
  static generateAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    state?: string;
    nonce?: string;
    did: string;
    // Note: pN name is NOT accepted here - it's a secret and should never be stored
  }): string {
    const code = crypto.randomBytes(32).toString('hex');
    
    // Normalize redirect URI (remove trailing slash) for consistent comparison
    const normalizedRedirectUri = params.redirectUri.replace(/\/$/, '');
    
    console.log('[OAuth] Generating authorization code:');
    console.log('  Client ID:', params.clientId);
    console.log('  Redirect URI (normalized):', normalizedRedirectUri);
    console.log('  DID:', params.did);
    
    authorizationCodes.set(code, {
      code,
      clientId: params.clientId,
      redirectUri: normalizedRedirectUri,
      scope: params.scope,
      state: params.state,
      nonce: params.nonce,
      did: params.did,
      // pN name is NOT stored - it's a secret
      expiresAt: Date.now() + this.CODE_EXPIRY
    });

    return code;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(params: {
    code: string;
    clientId: string;
    redirectUri: string;
  }): Promise<AccessToken | null> {
    const authCode = authorizationCodes.get(params.code);
    
    if (!authCode) {
      console.error('[OAuth] Code not found:', params.code.substring(0, 20) + '...');
      return null;
    }

    // Verify code hasn't expired
    if (authCode.expiresAt < Date.now()) {
      console.error('[OAuth] Code expired. ExpiresAt:', new Date(authCode.expiresAt).toISOString(), 'Now:', new Date().toISOString());
      authorizationCodes.delete(params.code);
      return null;
    }

    // Normalize redirect URIs for comparison (remove trailing slashes)
    const storedRedirectUri = authCode.redirectUri.replace(/\/$/, '');
    const providedRedirectUri = params.redirectUri.replace(/\/$/, '');
    
    console.log('[OAuth] Comparing redirect URIs:');
    console.log('  Stored:', storedRedirectUri);
    console.log('  Provided:', providedRedirectUri);
    console.log('  Match:', storedRedirectUri === providedRedirectUri);
    console.log('  Client ID match:', authCode.clientId === params.clientId);

    // Verify client ID and redirect URI match
    if (authCode.clientId !== params.clientId || storedRedirectUri !== providedRedirectUri) {
      console.error('[OAuth] Redirect URI or Client ID mismatch');
      return null;
    }

    // Remove used authorization code (one-time use)
    authorizationCodes.delete(params.code);

    // Generate access token
    // Note: pN name is NOT included - it's a secret
    const accessToken = await this.generateAccessToken({
      did: authCode.did,
      clientId: params.clientId,
      scope: authCode.scope
    });

    // Generate refresh token
    const refreshToken = this.generateRefreshToken({
      did: authCode.did,
      clientId: params.clientId,
      scope: authCode.scope
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
      refresh_token: refreshToken,
      scope: authCode.scope.join(' ')
    };
  }

  /**
   * Derive pN identifier from DID (same method as dashboard)
   * Standard: Combine DID + publicKey, SHA-256 hash, take first 12 hex chars
   */
  private static async derivePnIdentifier(did: string): Promise<string | undefined> {
    try {
      if (!did || !did.startsWith('did:key:')) {
        return undefined;
      }
      // Extract public key part (after did:key:)
      const publicKeyPart = did.substring(8); // Remove "did:key:" prefix
      // Combine DID + publicKey (same as dashboard does)
      const combined = `${did}:${publicKeyPart}`;
      // Generate SHA-256 hash and take first 12 hex characters
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(combined).digest('hex');
      return hash.substring(0, 12);
    } catch (error) {
      console.warn('[OAuth] Failed to derive pN identifier:', error);
      return undefined;
    }
  }

  /**
   * Generate access token
   */
  private static async generateAccessToken(params: { did: string; clientId: string; scope: string[] }): Promise<string> {
    // Derive pN identifier from DID
    const pnIdentifier = await this.derivePnIdentifier(params.did);
    
    const payload: TokenPayload = {
      did: params.did,
      // pN name is NOT stored - it's a secret
      pnIdentifier, // Store derived pN identifier
      clientId: params.clientId,
      scope: params.scope,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.ACCESS_TOKEN_EXPIRY
    };

    // Create JWT-like token (simplified - in production use proper JWT library)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.TOKEN_SECRET)
      .update(`${header}.${payloadB64}`)
      .digest('base64url');

    const token = `${header}.${payloadB64}.${signature}`;
    
    // Store token payload for validation
    accessTokens.set(token, payload);

    return token;
  }

  /**
   * Generate refresh token
   */
  private static generateRefreshToken(params: { did: string; clientId: string; scope: string[] }): string {
    const token = crypto.randomBytes(32).toString('hex');
    
    refreshTokens.set(token, {
      did: params.did,
      clientId: params.clientId,
      scope: params.scope
    });

    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  static refreshAccessToken(refreshToken: string, clientId: string): AccessToken | null {
    const tokenData = refreshTokens.get(refreshToken);
    
    if (!tokenData) {
      return null;
    }

    // Verify client ID matches
    if (tokenData.clientId !== clientId) {
      return null;
    }

    // Generate new access token
    const accessToken = this.generateAccessToken({
      did: tokenData.did,
      clientId: clientId,
      scope: tokenData.scope
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
      refresh_token: refreshToken, // Return same refresh token
      scope: tokenData.scope.join(' ')
    };
  }

  /**
   * Validate access token
   */
  static validateAccessToken(token: string): TokenPayload | null {
    // Check in-memory cache first
    const cached = accessTokens.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    // Validate JWT-like token
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [headerB64, payloadB64, signature] = parts;
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.TOKEN_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      // Parse payload
      const payload: TokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

      // Check expiration
      if (payload.expiresAt < Date.now()) {
        return null;
      }

      // Cache for faster lookup
      accessTokens.set(token, payload);

      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Revoke refresh token
   */
  static revokeRefreshToken(refreshToken: string): boolean {
    return refreshTokens.delete(refreshToken);
  }

  /**
   * Revoke access token
   */
  static revokeAccessToken(accessToken: string): boolean {
    return accessTokens.delete(accessToken);
  }
}

