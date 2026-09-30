/**
 * pN OAuth Service
 * Implements OAuth 2.0 authorization code flow for pN identity authentication
 * Similar to Google OAuth but uses pN identity files and passcodes
 */

import crypto from 'crypto';
import jwt, { JwtHeader, JwtPayload } from 'jsonwebtoken';
import {
  assertMlDsa65PublicKeyB64,
  deriveCanonicalPnIdentifier,
  deriveDidFromPublicKey,
  verifyOauthUnlockProof,
} from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { getDatabasePool } from '../utils/database';
import { isDidRevokedForNetwork, isPnRevokedForNetwork } from './identitySuccessionService';
import { appendSecurityAuditEvent } from './auditService';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { peekAuthCodeRecord, putAuthCodeRecord, putUnlockChallengeRecord, takeAuthCodeRecord, takeUnlockChallengeRecord } from './oauthAuthCodeStore';
import {
  readBrokerLaunched,
  storeBrokerLaunched,
  storeBrokerPendingRecord,
  takeBrokerPendingRecord,
} from './oauthBrokerPendingStore';

export class OauthUnlockProofError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus = 401) {
    super(message);
    this.name = 'OauthUnlockProofError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

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
  jti?: string;
  iss?: string;
  aud?: string;
  nbf?: number;
}

/**
 * Production sessions are RS256. Boot fails closed without a private key or KMS.
 * Dev and tests get an in-process keypair so HMAC is never a signing option.
 */
export function assertOauthSigningConfigured(
  env: NodeJS.ProcessEnv = process.env
): void {
  const isProd = (env.NODE_ENV || 'development') === 'production';
  const hasPem = Boolean(env.PN_OAUTH_PRIVATE_KEY_PEM?.trim());
  const hasKms = Boolean(env.PN_OAUTH_KMS_KEY_VERSION?.trim());
  if (isProd && !hasPem && !hasKms) {
    throw new Error(
      'PN_OAUTH_PRIVATE_KEY_PEM or PN_OAUTH_KMS_KEY_VERSION must be set in production'
    );
  }
}

function resolveOauthSigningKeys(): { privateKey: string; publicKey: string; kid: string } {
  assertOauthSigningConfigured();
  const configuredPrivate = process.env.PN_OAUTH_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n').trim() || '';
  const configuredPublic = process.env.PN_OAUTH_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n').trim() || '';
  const kms = process.env.PN_OAUTH_KMS_KEY_VERSION?.trim() || '';
  const kid = process.env.PN_OAUTH_KEY_ID || (kms ? 'kms' : 'rs256');

  if (configuredPrivate) {
    const publicKey =
      configuredPublic ||
      crypto.createPublicKey(configuredPrivate).export({ type: 'spki', format: 'pem' }).toString();
    return { privateKey: configuredPrivate, publicKey, kid };
  }

  if (kms) {
    if (!configuredPublic) {
      throw new Error('PN_OAUTH_PUBLIC_KEY_PEM must be set when signing with PN_OAUTH_KMS_KEY_VERSION');
    }
    return { privateKey: '', publicKey: configuredPublic, kid };
  }

  const generated = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    kid: 'dev-ephemeral-rs256',
  };
}

const oauthSigningKeys = resolveOauthSigningKeys();

interface RefreshTokenRecord {
  refresh_token: string;
  did: string;
  /** Not stored. Present only on rows written before the cache-join cut. */
  pn_identifier?: string | null;
  public_key?: string | null;
  client_id: string;
  scope: string[];
  expires_at: Date;
  family_id?: string;
  jti?: string;
  used_at?: Date | null;
  replaced_by?: string | null;
  revoked_at?: Date | null;
  reuse_detected_at?: Date | null;
}

// In-memory storage for access tokens (short-lived). Auth codes + broker pending
// use oauthAuthCodeStore / oauthBrokerPendingStore (Redis when REDIS_URL is set).
const accessTokens = new Map<string, TokenPayload>();
// Map of recently exchanged codes to their tokens (for idempotency - prevents duplicate exchange errors)
const codeToTokenMap = new Map<string, { token: AccessToken; expiresAt: number }>();
// Note: refreshTokens are now stored in PostgreSQL database for persistence

// Cleanup expired codes/tokens every 5 minutes
setInterval(() => {
  const now = Date.now();

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
  PNOAuthService.cleanupExpiredRefreshTokens().catch((err: unknown) => {
    safeLogger.error('[OAuth] Error in scheduled refresh token cleanup', {
      err: err instanceof Error ? err.message : String(err),
    });
  });
}, 5 * 60 * 1000);

export class PNOAuthService {
  private static readonly CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes
  private static readonly CHALLENGE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  /** Prefer-app broker handoff TTL (shorter than auth code). */
  private static readonly BROKER_PENDING_EXPIRY = 2 * 60 * 1000;
  private static readonly ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  private static readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days
  private static readonly TOKEN_ISSUER = process.env.PN_OAUTH_ISSUER || 'par-noir-api';
  private static readonly TOKEN_AUDIENCE = process.env.PN_OAUTH_AUDIENCE || 'par-noir-clients';
  private static readonly KMS_KEY_VERSION = process.env.PN_OAUTH_KMS_KEY_VERSION?.trim() || '';
  private static readonly JWT_KID = oauthSigningKeys.kid;
  private static readonly JWT_PRIVATE_KEY = oauthSigningKeys.privateKey;
  private static readonly JWT_PUBLIC_KEY = oauthSigningKeys.publicKey;

  private static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private static async signJwt(payload: Record<string, unknown>): Promise<string> {
    const header: JwtHeader = { alg: 'RS256', typ: 'JWT', kid: this.JWT_KID };
    if (this.KMS_KEY_VERSION) {
      return this.signJwtWithKms(payload, header);
    }

    if (!this.JWT_PRIVATE_KEY) {
      throw new Error('PN_OAUTH_PRIVATE_KEY_PEM is required for RS256');
    }
    return jwt.sign(payload, this.JWT_PRIVATE_KEY, { algorithm: 'RS256', header });
  }

  private static async signJwtWithKms(payload: Record<string, unknown>, header: JwtHeader): Promise<string> {
    const kmsKey = this.KMS_KEY_VERSION;
    if (!kmsKey) throw new Error('PN_OAUTH_KMS_KEY_VERSION not configured');
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const digest = crypto.createHash('sha256').update(signingInput).digest('base64');
    const { gcpKmsAsymmetricSignSha256Digest } = await import('../utils/gcpKmsAsymmetricSign');
    const sig = await gcpKmsAsymmetricSignSha256Digest(kmsKey, digest);
    return `${signingInput}.${Buffer.from(sig, 'base64').toString('base64url')}`;
  }

  static getJwks(): { keys: Array<Record<string, unknown>> } {
    if (!this.JWT_PUBLIC_KEY && !process.env.PN_OAUTH_JWKS_JSON) {
      return { keys: [] };
    }
    if (process.env.PN_OAUTH_JWKS_JSON) {
      try {
        const parsed = JSON.parse(process.env.PN_OAUTH_JWKS_JSON);
        if (parsed?.keys) return parsed;
      } catch {
        return { keys: [] };
      }
    }
    if (!this.JWT_PUBLIC_KEY) return { keys: [] };
    const x5c = Buffer.from(this.JWT_PUBLIC_KEY).toString('base64');
    return {
      keys: [
        {
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          kid: this.JWT_KID,
          x5c: [x5c],
        },
      ],
    };
  }

  /**
   * Issue a single-use unlock challenge bound to client_id + redirect_uri.
   */
  static async createUnlockChallenge(params: {
    clientId: string;
    redirectUri: string;
  }): Promise<{ challengeId: string; challenge: string; expiresAt: number }> {
    const challengeId = crypto.randomBytes(16).toString('hex');
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.CHALLENGE_EXPIRY;
    const normalizedRedirectUri = params.redirectUri.replace(/\/$/, '');
    await putUnlockChallengeRecord(
      {
        challengeId,
        challenge,
        clientId: params.clientId,
        redirectUri: normalizedRedirectUri,
        expiresAt,
      },
      this.CHALLENGE_EXPIRY
    );
    return { challengeId, challenge, expiresAt };
  }

  /**
   * Verify ML-DSA unlock proof, then mint an authorization code.
   * Identity (did / pnIdentifier) is derived from the verified public key only.
   */
  static async authenticateWithUnlockProof(params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    state?: string;
    nonce?: string;
    challengeId: string;
    publicKey: string;
    signature: string;
  }): Promise<{ code: string; did: string; pnIdentifier: string; publicKey: string }> {
    const normalizedRedirectUri = params.redirectUri.replace(/\/$/, '');
    const record = await takeUnlockChallengeRecord(params.challengeId);

    if (!record) {
      throw new OauthUnlockProofError(
        'invalid_challenge',
        'Unlock challenge is missing, expired, or already used'
      );
    }
    if (record.expiresAt < Date.now()) {
      throw new OauthUnlockProofError('invalid_challenge', 'Unlock challenge expired');
    }
    if (record.clientId !== params.clientId || record.redirectUri !== normalizedRedirectUri) {
      throw new OauthUnlockProofError(
        'invalid_challenge',
        'Unlock challenge does not match client_id or redirect_uri'
      );
    }
    if (!assertMlDsa65PublicKeyB64(params.publicKey)) {
      throw new OauthUnlockProofError(
        'invalid_public_key',
        'public_key must be a base64-encoded ML-DSA-65 public key',
        400
      );
    }

    const scopeStr = params.scope.join(' ');
    const ok = verifyOauthUnlockProof(
      params.signature,
      {
        challenge: record.challenge,
        clientId: params.clientId,
        redirectUri: normalizedRedirectUri,
        scope: scopeStr,
        state: params.state,
        nonce: params.nonce,
        publicKey: params.publicKey,
      },
      params.publicKey
    );
    if (!ok) {
      throw new OauthUnlockProofError(
        'invalid_proof',
        'Unlock proof signature verification failed'
      );
    }

    const did = deriveDidFromPublicKey(params.publicKey);
    const pnIdentifier = deriveCanonicalPnIdentifier(params.publicKey);
    const code = await this.generateAuthorizationCode({
      clientId: params.clientId,
      redirectUri: normalizedRedirectUri,
      scope: params.scope,
      state: params.state,
      nonce: params.nonce,
      did,
      publicKey: params.publicKey,
      pnIdentifier,
    });
    return { code, did, pnIdentifier, publicKey: params.publicKey };
  }

  /**
   * Internal mint after unlock proof.
   * Call sites outside this module must use authenticateWithUnlockProof —
   * never trust client-claimed identity alone.
   */
  static async generateAuthorizationCode(params: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    state?: string;
    nonce?: string;
    did: string;
    publicKey?: string;
    pnIdentifier?: string;
  }): Promise<string> {
    if (isPnRevokedForNetwork(params.pnIdentifier)) {
      const err = new Error('identity_superseded') as Error & { code: string };
      err.code = 'IDENTITY_SUPERSEDED';
      throw err;
    }
    if (isDidRevokedForNetwork(params.did)) {
      const err = new Error('identity_superseded') as Error & { code: string };
      err.code = 'IDENTITY_SUPERSEDED';
      throw err;
    }

    const code = crypto.randomBytes(32).toString('hex');

    // Normalize redirect URI (remove trailing slash) for consistent comparison
    const normalizedRedirectUri = params.redirectUri.replace(/\/$/, '');

    if (process.env.NODE_ENV === 'development') {
      safeLogger.info('[OAuth] Generating authorization code', {
        clientId: params.clientId,
        pnIdSuffix: params.pnIdentifier ? params.pnIdentifier.slice(-8) : 'none',
      });
    }

    await putAuthCodeRecord(
      {
        code,
        clientId: params.clientId,
        redirectUri: normalizedRedirectUri,
        scope: params.scope,
        state: params.state,
        nonce: params.nonce,
        did: params.did,
        publicKey: params.publicKey || '',
        pnIdentifier: params.pnIdentifier,
        expiresAt: Date.now() + this.CODE_EXPIRY,
      },
      this.CODE_EXPIRY
    );

    return code;
  }

  /**
   * Read a live authorization code without consuming it.
   *
   * The consent page needs to prove it just completed an unlock before the token
   * exchange has happened, so it presents the code it was handed. This must not
   * delete or mark the code: the real exchange still has to run afterwards.
   */
  static async peekAuthorizationCode(
    code: string,
    clientId: string
  ): Promise<{ pnIdentifier?: string; did: string; state?: string } | null> {
    const authCode = await peekAuthCodeRecord(code, clientId);
    if (!authCode) return null;
    return {
      pnIdentifier: authCode.pnIdentifier,
      did: authCode.did,
      state: authCode.state,
    };
  }

  /**
   * Store Unlock→browse prefer-app result for polling (HTTPS, all browsers).
   * Requires a live authorization code proving unlock just completed.
   */
  static async storeBrokerPending(params: {
    state: string;
    clientId: string;
    code: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const state = String(params.state || '').trim();
    if (!state || state.length < 8) return false;
    const peeked = await this.peekAuthorizationCode(params.code, params.clientId);
    if (!peeked) return false;
    if (peeked.state && peeked.state !== state) return false;
    await storeBrokerPendingRecord(
      state,
      {
        clientId: params.clientId,
        expiresAt: Date.now() + this.BROKER_PENDING_EXPIRY,
        payload: { ...params.payload },
      },
      this.BROKER_PENDING_EXPIRY
    );
    return true;
  }

  /**
   * Store access_denied (or other error) without an auth code.
   * Caller must supply the same high-entropy OAuth state the browse tab holds.
   */
  static async storeBrokerPendingError(params: {
    state: string;
    clientId: string;
    payload: Record<string, unknown>;
  }): Promise<boolean> {
    const state = String(params.state || '').trim();
    if (!state || state.length < 8) return false;
    if (!params.clientId) return false;
    await storeBrokerPendingRecord(
      state,
      {
        clientId: params.clientId,
        expiresAt: Date.now() + this.BROKER_PENDING_EXPIRY,
        payload: { ...params.payload },
      },
      this.BROKER_PENDING_EXPIRY
    );
    return true;
  }

  /** Unlock app opened the deep link. No authorization code yet. */
  static async storeBrokerLaunched(state: string, clientId: string): Promise<boolean> {
    const key = String(state || '').trim();
    const id = String(clientId || '').trim();
    if (!key || key.length < 8 || !id) return false;
    await storeBrokerLaunched(key, id, this.BROKER_PENDING_EXPIRY);
    return true;
  }

  static async readBrokerLaunched(state: string, clientId: string): Promise<boolean> {
    const key = String(state || '').trim();
    const id = String(clientId || '').trim();
    if (!key || !id) return false;
    return readBrokerLaunched(key, id);
  }

  /** One-shot take for browse poll. */
  static async takeBrokerPending(
    state: string,
    clientId: string
  ): Promise<Record<string, unknown> | null> {
    const key = String(state || '').trim();
    if (!key) return null;
    return takeBrokerPendingRecord(key, clientId);
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
      if (process.env.NODE_ENV === 'development') {
        safeLogger.info('[OAuth] Code already exchanged, returning cached token (idempotent)');
      }
      return existingExchange.token;
    }

    const authCode = await takeAuthCodeRecord(params.code);

    if (!authCode) {
      // Code not found - might have been already used
      // Check if it was recently exchanged (within last 30 seconds)
      if (existingExchange) {
        if (process.env.NODE_ENV === 'development') {
          safeLogger.info('[OAuth] Code was already exchanged, returning cached token');
        }
        return existingExchange.token;
      }
      safeLogger.warn('[OAuth] Code not found', { codePrefix: `${params.code.substring(0, 8)}...` });
      return null;
    }

    // Verify code hasn't expired
    if (authCode.expiresAt < Date.now()) {
      safeLogger.warn('[OAuth] Code expired', {
        expiresAt: new Date(authCode.expiresAt).toISOString(),
        now: new Date().toISOString(),
      });
      return null;
    }

    // Normalize redirect URIs for comparison (remove trailing slashes)
    const storedRedirectUri = authCode.redirectUri.replace(/\/$/, '');
    const providedRedirectUri = params.redirectUri.replace(/\/$/, '');

    if (process.env.NODE_ENV === 'development') {
      safeLogger.info('[OAuth] Comparing redirect URIs', {
        storedRedirectUri,
        providedRedirectUri,
        uriMatch: storedRedirectUri === providedRedirectUri,
        clientIdMatch: authCode.clientId === params.clientId,
      });
    }

    // Verify client ID and redirect URI match
    if (authCode.clientId !== params.clientId || storedRedirectUri !== providedRedirectUri) {
      safeLogger.warn('[OAuth] Redirect URI or Client ID mismatch');
      // put back — take already removed it
      const remaining = Math.max(1, authCode.expiresAt - Date.now());
      await putAuthCodeRecord(authCode, remaining);
      return null;
    }

    if (isPnRevokedForNetwork(authCode.pnIdentifier) || isDidRevokedForNetwork(authCode.did)) {
      return null;
    }

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
        safeLogger.warn('[OAuth] No DID provided for pN identifier derivation');
        return undefined;
      }
      
      // Use provided publicKey if available, otherwise extract from DID
      const publicKeyToUse = publicKey || (did.startsWith('did:key:') ? did.substring(8) : undefined);
      
      if (!publicKeyToUse) {
        safeLogger.warn('[OAuth] No publicKey available for pN identifier derivation');
        return undefined;
      }
      
      // Canonical id from publicKey (stable across passcode recovery)
      if (publicKeyToUse) {
        const utf8Bytes = Buffer.from(publicKeyToUse, 'utf8');
        const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
        const pnIdentifier = `pn-${hash.substring(0, 12)}`;
        if (process.env.NODE_ENV === 'development') {
          safeLogger.info('[OAuth] pN identifier derived (canonical publicKey)', { pnIdentifier });
        }
        return pnIdentifier;
      }

      // Legacy: pnName:passcode:publicKey (migration lookup only)
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
        
        if (process.env.NODE_ENV === 'development') {
          safeLogger.info('[OAuth] pN identifier derived (VolumeIdGenerator)', { pnIdentifier });
        }
        
        return pnIdentifier;
      }
      
      // FALLBACK: Old method (did:publicKey) for backward compatibility
      // This is used when pnName/passcode are not available (e.g., refresh token flow)
      const combined = `${did}:${publicKeyToUse}`;
      const utf8Bytes = Buffer.from(combined, 'utf8');
      const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
      const shortHash = hash.substring(0, 12);
      const pnIdentifier = `pn-${shortHash}`; // Add prefix for consistency
      
      if (process.env.NODE_ENV === 'development') {
        safeLogger.info('[OAuth] pN identifier derived (fallback)', { pnIdentifier });
      }
      
      return pnIdentifier;
    } catch (error) {
      safeLogger.error('[OAuth] Failed to derive pN identifier', {
        err: error instanceof Error ? error.message : String(error),
      });
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
      safeLogger.warn('[OAuth] No pN identifier provided - token will not include pnIdentifier');
    }
    
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      did: params.did,
      // SECURITY: pN name is NEVER stored - it's a secret
      pnIdentifier, // Use pN identifier directly (derived client-side)
      clientId: params.clientId,
      scope: params.scope,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.ACCESS_TOKEN_EXPIRY,
      jti: crypto.randomUUID(),
      iss: this.TOKEN_ISSUER,
      aud: this.TOKEN_AUDIENCE,
      nbf: now
    };
    const token = await this.signJwt({
      did: payload.did,
      pnIdentifier: payload.pnIdentifier,
      clientId: payload.clientId,
      scope: payload.scope,
      jti: payload.jti,
      iss: payload.iss,
      aud: payload.aud,
      iat: now,
      nbf: now,
      exp: now + Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    });
    
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
    familyId?: string;
    parentTokenHash?: string;
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY);
    const familyId = params.familyId || crypto.randomUUID();
    const jti = crypto.randomUUID();
    
    // Use provided pN identifier (derived client-side)
    // SECURITY: Never derive from secrets - pnName and passcode are never accepted
    const db = getDatabasePool();
    try {
      await db.query(
        `INSERT INTO oauth_refresh_tokens (refresh_token, did, pn_identifier, public_key, client_id, scope, expires_at, family_id, jti, previous_token_hash)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (refresh_token) 
         DO UPDATE SET 
           did = $2,
           pn_identifier = NULL,
           public_key = $3,
           client_id = $4,
           scope = $5,
           expires_at = $6,
           family_id = $7,
           jti = $8,
           previous_token_hash = $9`,
        [tokenHash, params.did, params.publicKey, params.clientId, params.scope, expiresAt, familyId, jti, params.parentTokenHash || null]
      );
    } catch (error) {
      safeLogger.error('[OAuth] Failed to store refresh token in database', {
        err: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to generate refresh token');
    }
    
    return token;
  }

  /**
   * Refresh access token using refresh token (from database)
   */
  static async refreshAccessToken(refreshToken: string, clientId: string): Promise<AccessToken | null> {
    const db = getDatabasePool();
    const tokenHash = this.hashRefreshToken(refreshToken);
    
    try {
      // Query refresh token from database
      const result = await db.query(
        `SELECT refresh_token, did, public_key, client_id, scope, expires_at, family_id, jti, used_at, replaced_by, revoked_at, reuse_detected_at
         FROM oauth_refresh_tokens 
         WHERE refresh_token = $1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        safeLogger.warn('[OAuth] Refresh token not found in database');
        return null;
      }

      const tokenData = result.rows[0] as RefreshTokenRecord;
      const subjectPn = tokenData.public_key
        ? deriveCanonicalPnIdentifier(tokenData.public_key)
        : undefined;

      // Check if token is expired
      const expiresAt = new Date(tokenData.expires_at);
      if (expiresAt.getTime() < Date.now()) {
        safeLogger.warn('[OAuth] Refresh token has expired');
        // Clean up expired token
        await db.query('DELETE FROM oauth_refresh_tokens WHERE refresh_token = $1', [tokenHash]);
        return null;
      }

      // Verify client ID matches
      if (tokenData.client_id !== clientId) {
        safeLogger.warn('[OAuth] Client ID mismatch for refresh token');
        return null;
      }
      if (tokenData.revoked_at) {
        return null;
      }
      if (tokenData.used_at) {
        await db.query(
          `UPDATE oauth_refresh_tokens
           SET revoked_at = NOW(), reuse_detected_at = NOW(), revoked_reason = 'reuse_detected'
           WHERE family_id = $1`,
          [tokenData.family_id || tokenHash]
        );
        await appendSecurityAuditEvent({
          eventType: 'oauth.refresh_token_reuse_detected',
          severity: 'high',
          subjectPnIdentifier: subjectPn,
          metadata: {
            clientIdHash: hashIdentifier(clientId),
            familyId: tokenData.family_id,
          },
        });
        return null;
      }

      if ((subjectPn && isPnRevokedForNetwork(subjectPn)) || isDidRevokedForNetwork(tokenData.did)) {
        await db.query('DELETE FROM oauth_refresh_tokens WHERE refresh_token = $1', [tokenHash]);
        return null;
      }

      // Generate new access token
      // Use stored pN identifier from refresh token if available
      const accessToken = await this.generateAccessToken({
        did: tokenData.did,
        publicKey: tokenData.public_key || undefined,
        pnIdentifier: subjectPn,
        clientId: clientId,
        scope: tokenData.scope || []
      });

      const nextRefreshToken = await this.generateRefreshToken({
        did: tokenData.did,
        publicKey: tokenData.public_key || undefined,
        pnIdentifier: subjectPn,
        clientId: clientId,
        scope: tokenData.scope || [],
        familyId: tokenData.family_id || tokenHash,
        parentTokenHash: tokenHash,
      });

      await db.query(
        `UPDATE oauth_refresh_tokens
         SET used_at = NOW(), replaced_by = $2
         WHERE refresh_token = $1`,
        [tokenHash, this.hashRefreshToken(nextRefreshToken)]
      );
      const responseRefreshToken = nextRefreshToken;

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(this.ACCESS_TOKEN_EXPIRY / 1000),
        refresh_token: responseRefreshToken,
        scope: (tokenData.scope || []).join(' ')
      };
    } catch (error) {
      safeLogger.error('[OAuth] Error refreshing access token', {
        err: error instanceof Error ? error.message : String(error),
      });
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
      if (isPnRevokedForNetwork(cached.pnIdentifier) || isDidRevokedForNetwork(cached.did)) {
        accessTokens.delete(token);
        return null;
      }
      return cached;
    }

    // Validate JWT token
    try {
      if (!this.JWT_PUBLIC_KEY) return null;
      const decoded = jwt.verify(token, this.JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: this.TOKEN_ISSUER,
        audience: this.TOKEN_AUDIENCE,
      }) as JwtPayload & TokenPayload;

      const payload: TokenPayload = {
        did: String(decoded.did || ''),
        pnIdentifier: decoded.pnIdentifier,
        clientId: String(decoded.clientId || ''),
        scope: Array.isArray(decoded.scope) ? decoded.scope as string[] : [],
        issuedAt: Number(decoded.issuedAt || (decoded.iat ? decoded.iat * 1000 : Date.now())),
        expiresAt: Number(decoded.expiresAt || (decoded.exp ? decoded.exp * 1000 : Date.now())),
        jti: typeof decoded.jti === 'string' ? decoded.jti : undefined,
        iss: typeof decoded.iss === 'string' ? decoded.iss : undefined,
        aud: typeof decoded.aud === 'string' ? decoded.aud : undefined,
      };
      if (!payload.did || !payload.clientId) return null;

      if (isPnRevokedForNetwork(payload.pnIdentifier) || isDidRevokedForNetwork(payload.did)) {
        return null;
      }

      // Cache for faster lookup
      accessTokens.set(token, payload);

      return payload;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        safeLogger.warn('[OAuth] validateAccessToken failed', {
          message: (error as Error).message,
        });
      }
      return null;
    }
  }

  /**
   * Revoke refresh token (remove from database)
   */
  static async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    const db = getDatabasePool();
    const tokenHash = this.hashRefreshToken(refreshToken);
    
    try {
      const result = await db.query(
        'DELETE FROM oauth_refresh_tokens WHERE refresh_token = $1',
        [tokenHash]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      safeLogger.error('[OAuth] Error revoking refresh token', {
        err: error instanceof Error ? error.message : String(error),
      });
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
        safeLogger.info('[OAuth] Cleaned up expired refresh tokens', { deletedCount });
      }
      return deletedCount;
    } catch (error) {
      safeLogger.error('[OAuth] Error cleaning up expired refresh tokens', {
        err: error instanceof Error ? error.message : String(error),
      });
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

