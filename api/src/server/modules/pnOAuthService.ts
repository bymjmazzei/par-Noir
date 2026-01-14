/**
 * pN OAuth Service
 * Implements OAuth 2.0 authorization code flow for pN identity authentication
 * Similar to Google OAuth but uses pN identity files and passcodes
 */

import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  did: string; // User's DID
  publicKey?: string; // Public key from identity file (needed for file decryption)
  pnIdentifier?: string; // pN identifier (derived client-side, never derived from secrets on server)
  // SECURITY: pN name and passcode are NEVER stored - they're secrets
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

// In-memory storage for authorization codes and access tokens (short-lived)
const authorizationCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, TokenPayload>();
// Map of recently exchanged codes to their tokens (for idempotency - prevents duplicate exchange errors)
const codeToTokenMap = new Map<string, { token: AccessToken; expiresAt: number }>();
// Note: refreshTokens are now stored in PostgreSQL database for persistence

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
  
  // Clean expired code-to-token mappings (for idempotency)
  for (const [code, exchange] of codeToTokenMap.entries()) {
    if (exchange.expiresAt < now) {
      codeToTokenMap.delete(code);
    }
  }
  
  // Clean expired refresh tokens from database (async, don't wait)
  PNOAuthService.cleanupExpiredRefreshTokens().catch(err => {
    console.error('[OAuth] Error in scheduled refresh token cleanup:', err);
  });
}, 5 * 60 * 1000);

export class PNOAuthService {
  private static readonly CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes
  private static readonly ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  private static readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
  private static readonly TOKEN_SECRET = process.env.PN_OAUTH_SECRET || crypto.randomBytes(32).toString('hex');

  /**
   * Generate authorization code
   * 
   * SECURITY: Accepts pnIdentifier directly from client (derived client-side).
   * Never stores pnName or passcode - they're secrets.
   */
  static generateAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    state?: string;
    nonce?: string;
    did: string;
    publicKey?: string; // Public key from identity file (needed for file decryption)
    pnIdentifier?: string; // pN identifier (derived client-side, never derived from secrets)
    // SECURITY: pN name and passcode are NEVER accepted or stored - they're secrets
  }): string {
    const code = crypto.randomBytes(32).toString('hex');
    
    // Normalize redirect URI (remove trailing slash) for consistent comparison
    const normalizedRedirectUri = params.redirectUri.replace(/\/$/, '');
    
    console.log('[OAuth] Generating authorization code:');
    console.log('  Client ID:', params.clientId);
    console.log('  Redirect URI (normalized):', normalizedRedirectUri);
    console.log('  DID:', params.did);
    console.log('  pN Identifier:', params.pnIdentifier || 'not provided');
    
    authorizationCodes.set(code, {
      code,
      clientId: params.clientId,
      redirectUri: normalizedRedirectUri,
      scope: params.scope,
      state: params.state,
      nonce: params.nonce,
      did: params.did,
      publicKey: params.publicKey, // Store public key for file decryption
      pnIdentifier: params.pnIdentifier, // Store pN identifier directly (derived client-side)
      // SECURITY: pN name and passcode are NEVER stored - they're secrets
      expiresAt: Date.now() + this.CODE_EXPIRY
    });

    return code;
  }

  /**
   * Exchange authorization code for access token
   * Idempotent: if code was already exchanged, returns the same token
   */
  static async exchangeCodeForToken(params: {
    code: string;
    clientId: string;
    redirectUri: string;
  }): Promise<AccessToken | null> {
    // Check if this code was already exchanged (idempotency)
    const existingExchange = codeToTokenMap.get(params.code);
    if (existingExchange && existingExchange.expiresAt > Date.now()) {
      console.log('[OAuth] Code already exchanged, returning cached token (idempotent)');
      return existingExchange.token;
    }
    
    const authCode = authorizationCodes.get(params.code);
    
    if (!authCode) {
      // Code not found - might have been already used
      // Check if it was recently exchanged (within last 30 seconds)
      if (existingExchange) {
        console.log('[OAuth] Code was already exchanged, returning cached token');
        return existingExchange.token;
      }
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
    // SECURITY: Use pnIdentifier directly from authorization code (derived client-side)
    const accessToken = await this.generateAccessToken({
      did: authCode.did,
      publicKey: authCode.publicKey, // Pass publicKey for file decryption
      pnIdentifier: authCode.pnIdentifier, // Use pN identifier directly (derived client-side)
      clientId: params.clientId,
      scope: authCode.scope
    });

    // Generate refresh token (now async - stores in database)
    const refreshToken = await this.generateRefreshToken({
      did: authCode.did,
      publicKey: authCode.publicKey, // Include publicKey for file decryption
      pnIdentifier: authCode.pnIdentifier, // Use pN identifier directly (derived client-side)
      clientId: params.clientId,
      scope: authCode.scope
    });

    const tokenResponse: AccessToken = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
      refresh_token: refreshToken,
      scope: authCode.scope.join(' ')
    };

    // Store the exchange result for idempotency (keep for 30 seconds)
    codeToTokenMap.set(params.code, {
      token: tokenResponse,
      expiresAt: Date.now() + 30 * 1000 // 30 seconds
    });

    // Clean up old entries from codeToTokenMap
    for (const [code, exchange] of codeToTokenMap.entries()) {
      if (exchange.expiresAt < Date.now()) {
        codeToTokenMap.delete(code);
      }
    }

    return tokenResponse;
  }

  /**
   * @deprecated This method is deprecated and should not be used.
   * SECURITY: Clients should derive pN identifier client-side and send it directly.
   * This method is kept only for backward compatibility with old clients.
   * 
   * Derive pN identifier using VolumeIdGenerator (STANDARDIZED METHOD)
   * 
   * STANDARDIZED FORMULA (used everywhere):
   *   1. Combine: `${pnName}:${passcode}:${publicKey}`
   *   2. Hash: SHA256(combined string)
   *   3. Extract: First 12 characters of hex representation
   *   4. Format: `pn-{12-char-hex-hash}`
   * 
   * Falls back to old method (did:publicKey) if pnName/passcode not available
   */
  private static async derivePnIdentifier(
    did: string, 
    publicKey?: string, 
    pnName?: string, 
    passcode?: string
  ): Promise<string | undefined> {
    try {
      if (!did) {
        console.error('[OAuth] No DID provided for pN identifier derivation');
        return undefined;
      }
      
      // Use provided publicKey if available, otherwise extract from DID
      const publicKeyToUse = publicKey || (did.startsWith('did:key:') ? did.substring(8) : undefined);
      
      if (!publicKeyToUse) {
        console.error('[OAuth] No publicKey available for pN identifier derivation');
        return undefined;
      }
      
      // CRITICAL: Use VolumeIdGenerator method if pnName and passcode are available
      // This matches the dashboard's VolumeIdGenerator.generateVolumeId()
      if (pnName && passcode) {
        // STANDARDIZED: Combine credentials in exact order: pnName:passcode:publicKey
        const combined = `${pnName}:${passcode}:${publicKeyToUse}`;
        
        // STANDARDIZED: Hash using SHA-256 (UTF-8 encoding)
        const utf8Bytes = Buffer.from(combined, 'utf8');
        const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
        
        // STANDARDIZED: Convert to hex and take first 12 characters
        const shortHash = hash.substring(0, 12);
        
        // STANDARDIZED: Format: pn-{12-char-hex}
        const pnIdentifier = `pn-${shortHash}`;
        
        console.log('[OAuth] pN identifier derivation (VolumeIdGenerator):');
        console.log('  pnName:', pnName);
        console.log('  PublicKey:', publicKeyToUse.substring(0, 50) + '...');
        console.log('  Combined:', `${pnName}:***:${publicKeyToUse.substring(0, 20)}...`);
        console.log('  Hash:', hash);
        console.log('  pN Identifier:', pnIdentifier);
        
        return pnIdentifier;
      }
      
      // FALLBACK: Old method (did:publicKey) for backward compatibility
      // This is used when pnName/passcode are not available (e.g., refresh token flow)
      const combined = `${did}:${publicKeyToUse}`;
      const utf8Bytes = Buffer.from(combined, 'utf8');
      const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
      const shortHash = hash.substring(0, 12);
      const pnIdentifier = `pn-${shortHash}`; // Add prefix for consistency
      
      console.log('[OAuth] pN identifier derivation (fallback - did:publicKey):');
      console.log('  DID:', did);
      console.log('  PublicKey:', publicKeyToUse.substring(0, 50) + '...');
      console.log('  Combined:', combined);
      console.log('  Hash:', hash);
      console.log('  pN Identifier:', pnIdentifier);
      
      return pnIdentifier;
    } catch (error) {
      console.error('[OAuth] Failed to derive pN identifier:', error);
      return undefined;
    }
  }

  /**
   * Generate access token
   * 
   * SECURITY: Accepts pnIdentifier directly (derived client-side).
   * Never derives from secrets - pnName and passcode are never accepted.
   */
  private static async generateAccessToken(params: { 
    did: string; 
    publicKey?: string; 
    pnIdentifier?: string; // pN identifier (derived client-side)
    clientId: string; 
    scope: string[] 
  }): Promise<string> {
    // Use provided pN identifier (derived client-side)
    // SECURITY: Never derive from secrets - pnName and passcode are never accepted
    const pnIdentifier = params.pnIdentifier;
    
    if (!pnIdentifier) {
      console.warn('[OAuth] No pN identifier provided - token will not include pnIdentifier');
    }
    
    const payload: TokenPayload = {
      did: params.did,
      // SECURITY: pN name is NEVER stored - it's a secret
      pnIdentifier, // Use pN identifier directly (derived client-side)
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
   * Generate refresh token and store in database
   * 
   * SECURITY: Accepts pnIdentifier directly (derived client-side).
   * Never derives from secrets - pnName and passcode are never accepted.
   */
  private static async generateRefreshToken(params: { 
    did: string; 
    publicKey?: string; 
    pnIdentifier?: string; // pN identifier (derived client-side)
    clientId: string; 
    scope: string[] 
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);
    
    // Use provided pN identifier (derived client-side)
    // SECURITY: Never derive from secrets - pnName and passcode are never accepted
    const pnIdentifier = params.pnIdentifier;
    
    const db = getDatabasePool();
    try {
      await db.query(
        `INSERT INTO oauth_refresh_tokens (refresh_token, did, pn_identifier, public_key, client_id, scope, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (refresh_token) 
         DO UPDATE SET 
           did = $2,
           pn_identifier = $3,
           public_key = $4,
           client_id = $5,
           scope = $6,
           expires_at = $7`,
        [token, params.did, pnIdentifier, params.publicKey, params.clientId, params.scope, expiresAt]
      );
    } catch (error) {
      console.error('[OAuth] Failed to store refresh token in database:', error);
      throw new Error('Failed to generate refresh token');
    }
    
    return token;
  }

  /**
   * Refresh access token using refresh token (from database)
   */
  static async refreshAccessToken(refreshToken: string, clientId: string): Promise<AccessToken | null> {
    const db = getDatabasePool();
    
    try {
      // Query refresh token from database
      const result = await db.query(
        `SELECT did, pn_identifier, client_id, scope, expires_at 
         FROM oauth_refresh_tokens 
         WHERE refresh_token = $1`,
        [refreshToken]
      );

      if (result.rows.length === 0) {
        console.warn('[OAuth] Refresh token not found in database');
        return null;
      }

      const tokenData = result.rows[0];

      // Check if token is expired
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt.getTime() < Date.now()) {
        console.warn('[OAuth] Refresh token has expired');
        // Clean up expired token
        await db.query('DELETE FROM oauth_refresh_tokens WHERE refresh_token = $1', [refreshToken]);
        return null;
      }

      // Verify client ID matches
      if (tokenData.client_id !== clientId) {
        console.warn('[OAuth] Client ID mismatch for refresh token');
        return null;
      }

      // Generate new access token
      // Use stored pN identifier from refresh token if available
      const accessToken = await this.generateAccessToken({
        did: tokenData.did,
        publicKey: undefined, // Refresh tokens don't store publicKey, but we store pn_identifier
        pnIdentifier: tokenData.pn_identifier, // Use stored pN identifier from refresh token
        clientId: clientId,
        scope: tokenData.scope || []
      });

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
        refresh_token: refreshToken, // Return same refresh token
        scope: (tokenData.scope || []).join(' ')
      };
    } catch (error) {
      console.error('[OAuth] Error refreshing access token:', error);
      return null;
    }
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
   * Revoke refresh token (remove from database)
   */
  static async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(
        'DELETE FROM oauth_refresh_tokens WHERE refresh_token = $1',
        [refreshToken]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('[OAuth] Error revoking refresh token:', error);
      return false;
    }
  }

  /**
   * Clean up expired refresh tokens (should be called periodically)
   */
  static async cleanupExpiredRefreshTokens(): Promise<number> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(
        'DELETE FROM oauth_refresh_tokens WHERE expires_at < NOW()'
      );
      const deletedCount = result.rowCount ?? 0;
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired refresh token(s)`);
      }
      return deletedCount;
    } catch (error) {
      console.error('[OAuth] Error cleaning up expired refresh tokens:', error);
      return 0;
    }
  }

  /**
   * Revoke access token
   */
  static revokeAccessToken(accessToken: string): boolean {
    return accessTokens.delete(accessToken);
  }
}

