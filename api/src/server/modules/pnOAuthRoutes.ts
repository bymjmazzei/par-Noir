/**
 * pN OAuth Routes
 * pN OAuth 2.0 authorization code flow: JWKS, authorize, consent, token,
 * refresh, userinfo, client registration, and revocation endpoints
 */

import express, { RequestHandler } from 'express';
import crypto from 'crypto';
import path from 'path';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, isDevVerbose, safeLogger } from '../../utils/logger';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { requireAdminApiKey } from './adminDeveloperRoutes';

const NODE_ENV = process.env.NODE_ENV || 'development';

/** Apps that host their own unlock page instead of using the API consent page. */
const SELF_HOSTED_UNLOCK_CLIENT_IDS = new Set(['browser-app', 'messaging-app']);

const SELF_HOSTED_UNLOCK_ORIGINS = new Set([
  'https://browse.parnoir.com',
  'https://messaging.parnoir.com',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

function isSelfHostedUnlockOrigin(redirectUri: string): boolean {
  try {
    return SELF_HOSTED_UNLOCK_ORIGINS.has(new URL(redirectUri).origin);
  } catch {
    return false;
  }
}

function isSelfHostedUnlockClient(clientId: string | undefined): boolean {
  return !!clientId && SELF_HOSTED_UNLOCK_CLIENT_IDS.has(clientId);
}

/**
 * Consent sends the user's per-data-point choices as a comma-separated list.
 * `undefined` means the client made no choice this time (consent was skipped),
 * which is distinct from an empty list meaning "declined everything".
 */
function parseGrantedDataPoints(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof raw !== 'string') return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function redactPnIdentifier(pnIdentifier?: string): string {
  if (!pnIdentifier) return 'pn-unknown';
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  if (normalized.length <= 8) return 'pn-***';
  return `${normalized.slice(0, 5)}***${normalized.slice(-3)}`;
}

export interface PnOAuthRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  oauthTokenLimiter: RequestHandler;
}

/**
 * Setup pN OAuth 2.0 endpoints
 * Implements authorization code flow similar to Google OAuth
 */
export function setupPnOAuthRoutes(app: express.Application, deps: PnOAuthRouteDeps) {
  const { extractAccountId, oauthTokenLimiter } = deps;

    // Dynamic import to avoid circular dependencies
    const PNOAuthService = require('./pnOAuthService').PNOAuthService;

    app.get('/.well-known/jwks.json', (_req, res) => {
      const jwks = PNOAuthService.getJwks();
      return res.json(jwks);
    });

    // GET /oauth/authorize - Authorization endpoint
    // This endpoint initiates the OAuth flow
    // Client should redirect user here with: client_id, redirect_uri, response_type=code, scope, state
    app.get('/oauth/authorize', async (req, res) => {
      const { client_id, redirect_uri, response_type, scope, state, nonce } = req.query;

      // Validate required parameters
      if (!client_id || !redirect_uri || !response_type) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri, response_type'
        });
      }

      if (response_type !== 'code') {
        return res.status(400).json({
          error: 'unsupported_response_type',
          error_description: 'Only authorization_code flow is supported'
        });
      }

      // Validate client and redirect URI
      const { ClientRegistrationService } = await import('./clientRegistration');
      if (!(await ClientRegistrationService.validateClient(client_id as string, redirect_uri as string))) {
        return res.status(400).json({
          error: 'invalid_client',
          error_description: 'Invalid client_id or redirect_uri'
        });
      }

      // Validate scopes
      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];
      if (!(await ClientRegistrationService.validateScopes(client_id as string, scopes))) {
        return res.status(400).json({
          error: 'invalid_scope',
          error_description: 'One or more requested scopes are not allowed for this client'
        });
      }

      // Return authorization page URL
      return res.json({
        authorization_url: `/oauth/authorize/consent?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&scope=${encodeURIComponent(scope as string || 'openid profile')}&state=${state || ''}&nonce=${nonce || ''}`,
        client_id,
        redirect_uri,
        scope: scopes,
        state: state || undefined,
        nonce: nonce || undefined
      });
    });

    // GET /oauth/authorize/consent - OAuth consent page
    // Routes to appropriate consent page based on client_id
    // browse/messaging use their own origin's oauth-authorize.html
    // Third parties use API-hosted generic consent page
    app.get('/oauth/authorize/consent', async (req, res) => {
      const { client_id, redirect_uri, scope, state, nonce } = req.query;

      // Validate required parameters
      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri'
        });
      }

      // pN-owned apps that host their own unlock page skip registration validation
      const selfHostedUnlock = isSelfHostedUnlockClient(client_id as string);

      if (!selfHostedUnlock) {
      const { ClientRegistrationService } = await import('./clientRegistration');
      if (!(await ClientRegistrationService.validateClient(client_id as string, redirect_uri as string))) {
        return res.status(400).json({
          error: 'invalid_client',
          error_description: 'Invalid client_id or redirect_uri'
        });
        }
      }

      // Same-origin unlock on browse/messaging (not API consent)
      if (selfHostedUnlock && isSelfHostedUnlockOrigin(redirect_uri as string)) {
        let appOrigin: string;
        try {
          appOrigin = new URL(redirect_uri as string).origin;
        } catch {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Invalid redirect_uri',
          });
        }
        const unlockUrl = new URL(`${appOrigin}/oauth-authorize.html`);
        unlockUrl.searchParams.set('client_id', client_id as string);
        unlockUrl.searchParams.set('redirect_uri', redirect_uri as string);
        unlockUrl.searchParams.set('response_type', 'code');
        if (scope) unlockUrl.searchParams.set('scope', scope as string);
        if (state) unlockUrl.searchParams.set('state', state as string);
        if (nonce) unlockUrl.searchParams.set('nonce', nonce as string);
        const popupParam = req.query.popup;
        if (popupParam === 'true') unlockUrl.searchParams.set('popup', 'true');
        const identityHandoff = req.query.identity_handoff;
        if (identityHandoff === 'required') {
          unlockUrl.searchParams.set('identity_handoff', 'required');
        }
        unlockUrl.searchParams.set('api_endpoint', `${req.protocol}://${req.get('host')}`);
        return res.redirect(unlockUrl.toString());
      }

      // Third parties: API-hosted canonical consent page
      const consentUrl = new URL(`${req.protocol}://${req.get('host')}/oauth/consent`);
      consentUrl.searchParams.set('client_id', client_id as string);
      consentUrl.searchParams.set('redirect_uri', redirect_uri as string);
      if (scope) consentUrl.searchParams.set('scope', scope as string);
      if (state) consentUrl.searchParams.set('state', state as string);
      if (nonce) consentUrl.searchParams.set('nonce', nonce as string);

      // Canonical contract: popup behavior is controlled only by the explicit query parameter.
      const popupParam = req.query.popup;
      if (popupParam === 'true') consentUrl.searchParams.set('popup', 'true');
      const identityHandoff = req.query.identity_handoff;
      if (identityHandoff === 'required') {
        consentUrl.searchParams.set('identity_handoff', 'required');
      }

      return res.redirect(consentUrl.toString());
    });

    // POST /oauth/authorize/authenticate - Authenticate user with pN identity
    // Client sends encrypted identity file and passcode
    // Server verifies and generates authorization code
    app.post('/oauth/authorize/authenticate', async (req, res) => {
      try {
        const { 
          client_id, 
          redirect_uri, 
          scope, 
          state, 
          nonce,
          encrypted_identity, // Encrypted pN identity file
          passcode,
          public_key // Public key from identity
        } = req.body;

        if (!client_id || !redirect_uri || !encrypted_identity || !passcode || !public_key) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required fields: client_id, redirect_uri, encrypted_identity, passcode, public_key'
          });
        }

        // In production, decrypt and verify identity here
        // For now, we'll accept a DID directly or verify the identity
        // Extract DID from encrypted identity or use public_key to derive it
        // This is a simplified version - in production, decrypt the identity file
        
        // DID should come from decrypted identity (client-side decryption)
        // If not provided, we can't proceed - need the actual DID from the identity
        const did = req.body.did;
        
        if (!did) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'DID is required. Identity file must be decrypted client-side to extract DID.'
          });
        }

        // SECURITY: No sensitive data in logs — pn name, passcode, DID, public key must never appear in plain text

        // SECURITY FIX: Client now sends pn_identifier directly (derived client-side)
        // Fallback to derivation for backward compatibility if not provided
        let pnIdentifier: string | undefined = req.body.pn_identifier;
        const pnName = req.body.pnName || req.body.pn_name; // Only used for fallback derivation
        
        // Fallback: Derive pN identifier server-side if client didn't provide it (backward compatibility)
        if (!pnIdentifier && pnName && passcode && public_key) {
          try {
            // STANDARDIZED: Derive pN identifier using VolumeIdGenerator formula
            // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
            const crypto = await import('crypto');
            const combined = `${pnName}:${passcode}:${public_key}`;
            const utf8Bytes = Buffer.from(combined, 'utf8');
            const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
            const shortHash = hash.substring(0, 12);
            pnIdentifier = `pn-${shortHash}`;
            if (process.env.NODE_ENV === 'development') {
              console.log('[OAuth Auth] Derived pN identifier server-side (fallback):', pnIdentifier);
            }
          } catch (error) {
            console.error('[OAuth Auth] Failed to derive pN identifier:', error);
          }
        } else if (pnIdentifier && process.env.NODE_ENV === 'development') {
          console.log('[OAuth Auth] Using pN identifier from client:', redactPnIdentifier(pnIdentifier));
        }

        const scopes = scope ? scope.split(' ') : ['openid', 'profile'];

        // SECURITY FIX: Store pnIdentifier directly instead of secrets
        let code: string;
        try {
          code = PNOAuthService.generateAuthorizationCode({
            clientId: client_id,
            redirectUri: redirect_uri,
            scope: scopes,
            state,
            nonce,
            did,
            publicKey: public_key, // Still needed for file decryption
            pnIdentifier: pnIdentifier // Store pN identifier directly (derived client-side)
            // pnName and passcode are NOT stored - they're secrets
          });
        } catch (oauthErr: unknown) {
          if ((oauthErr as Error & { code?: string }).code === 'IDENTITY_SUPERSEDED') {
            return res.status(403).json({
              error: 'access_denied',
              error_description:
                'This identity is superseded on the par Noir network. Use your successor pN file and identifier for OAuth and services.'
            });
          }
          throw oauthErr;
        }

        // Consent-skip hint: cache first, then the authoritative Drive record.
        // A stored grant only skips consent when the user has already been asked
        // about everything this request wants.
        const { dataPointIdsFromScopes } = await import('./integratorStoragePaths');
        const { getClientContract, grantCoversRequest } = await import(
          '@par-noir/standard-data-points'
        );
        const requestedDataPoints = dataPointIdsFromScopes(scopes);

        let existingGrant: { dataPoints: string[] } | null = null;
        if (pnIdentifier) {
          const { getExistingGrantWithTimeout } = await import('./oauthDrivePermissionContext');
          const grant = await getExistingGrantWithTimeout(req, client_id, { pnIdentifier, did });
          if (grant && grantCoversRequest(grant.consideredDataPoints, requestedDataPoints)) {
            existingGrant = { dataPoints: grant.dataPoints };
          }
        }

        // Under device cloud custody the server holds no Google secrets, so the
        // unlock page must supply the owner's Drive token itself. Hand back the
        // sealed vault: ciphertext the API cannot open, unsealable only with the
        // ML-KEM secret or pn name + passcode the caller just proved it holds.
        let sealedCloudVault: unknown = null;
        if (pnIdentifier) {
          try {
            const { cloudVaultService } = await import('./cloudVaultService');
            sealedCloudVault = await cloudVaultService.getSealedVault(pnIdentifier);
          } catch (vaultErr: unknown) {
            safeLogger.warn('[OAuth] Could not load sealed cloud vault', {
              reason: 'cloud_vault_unavailable',
              message: vaultErr instanceof Error ? vaultErr.message : String(vaultErr),
              pnIdHash: hashIdentifier(pnIdentifier)
            });
          }
        }

        return res.json({
          code,
          state: state || undefined,
          existingGrant,
          requestedDataPoints,
          // Lets the consent screen show the level a proof must meet (e.g. verified)
          dataPointLevels: getClientContract(client_id)?.dataPointLevels || {},
          sealedCloudVault
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('OAuth authentication error:', msg);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Authentication failed'
        });
      }
    });

    // Retry path for consent pages when the inline lookup raced its deadline.
    app.get('/oauth/existing-grant', async (req, res) => {
      try {
        const pnIdentifier = req.query.pnIdentifier as string | undefined;
        const did = req.query.did as string | undefined;
        const clientId = req.query.client_id as string | undefined;
        const scope = (req.query.scope as string | undefined) || '';
        if (!pnIdentifier || !clientId) {
          return res.status(400).json({ error: 'pnIdentifier and client_id are required' });
        }

        const { getExistingGrant } = await import('./oauthDrivePermissionContext');
        const { dataPointIdsFromScopes } = await import('./integratorStoragePaths');
        const { grantCoversRequest } = await import('@par-noir/standard-data-points');

        const requestedDataPoints = dataPointIdsFromScopes(
          scope.split(' ').filter(Boolean)
        );
        const grant = await getExistingGrant(req, clientId, { pnIdentifier, did });
        const existingGrant =
          grant && grantCoversRequest(grant.consideredDataPoints, requestedDataPoints)
            ? { dataPoints: grant.dataPoints }
            : null;

        return res.json({ existingGrant });
      } catch (error: unknown) {
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Grant lookup failed',
        });
      }
    });

    // POST /oauth/token - Token endpoint
    // Exchange authorization code for access token
    // Use lenient rate limiter for OAuth token exchange (users may unlock multiple times during setup)
    app.post('/oauth/token', oauthTokenLimiter, async (req, res) => {
      try {
        const { code, client_id, redirect_uri, grant_type, granted_data_points } = req.body;

        if (!code || !client_id || !redirect_uri) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: code, client_id, redirect_uri'
          });
        }

        if (grant_type !== 'authorization_code') {
          return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: 'Only authorization_code grant type is supported'
          });
        }

        const tokenResponse = await PNOAuthService.exchangeCodeForToken({
          code,
          clientId: client_id,
          redirectUri: redirect_uri
        });

        if (!tokenResponse) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code'
          });
        }

        // Persist third-party permissions + integrator silo for all OAuth clients
        try {
          const tokenPayload = PNOAuthService.validateAccessToken(tokenResponse.access_token);
          if (tokenPayload?.pnIdentifier) {
            const { resolveOAuthDriveContext } = await import('./oauthDrivePermissionContext');
            const { persistIntegratorGrantAfterTokenExchange } = await import(
              './integratorOAuthGrants'
            );

            const driveCtx = await resolveOAuthDriveContext(req, {
              pnIdentifier: tokenPayload.pnIdentifier,
              did: tokenPayload.did,
            });

            if (driveCtx) {
              await persistIntegratorGrantAfterTokenExchange({
                clientId: client_id,
                scopes: tokenPayload.scope || [],
                tokenPayload,
                userAccessToken: driveCtx.userAccessToken,
                accountId: driveCtx.accountId,
                grantedDataPoints: parseGrantedDataPoints(granted_data_points),
              });
            } else {
              safeLogger.warn('[OAuth] Skipped Drive permission persist — no Drive context', {
                clientId: client_id,
                pnIdHash: hashIdentifier(tokenPayload.pnIdentifier),
              });
            }
          }
        } catch (permError: unknown) {
          safeLogger.error('[OAuth] Failed to persist integrator grant', {
            message: permError instanceof Error ? permError.message : String(permError),
          });
        }

        return res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token exchange error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Token exchange failed'
        });
      }
    });

    /**
     * Persist the grant once the client can supply a Drive token.
     *
     * Token exchange happens before the app has hydrated its cloud vault, so under
     * device cloud custody the write above has nothing to authenticate with. The
     * app calls this after hydration with X-PN-Cloud-Access-Token. Same grant
     * builder as the exchange path — one implementation, two entry points.
     */
    app.post('/oauth/grant/persist', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'A valid pN access token is required'
          });
        }

        const clientId = req.body?.client_id;
        if (!clientId) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'client_id is required'
          });
        }

        const { resolveOAuthDriveContext } = await import('./oauthDrivePermissionContext');
        const { persistIntegratorGrantAfterTokenExchange } = await import(
          './integratorOAuthGrants'
        );

        const driveCtx = await resolveOAuthDriveContext(req, {
          pnIdentifier: tokenPayload.pnIdentifier,
          did: tokenPayload.did
        });

        if (!driveCtx) {
          // resolveOAuthDriveContext already logged why at warn level.
          return res.status(409).json({
            error: 'cloud_token_required',
            error_description:
              'Forward X-PN-Cloud-Access-Token from the unsealed cloud vault to persist the grant'
          });
        }

        await persistIntegratorGrantAfterTokenExchange({
          clientId,
          scopes: tokenPayload.scope || [],
          tokenPayload,
          userAccessToken: driveCtx.userAccessToken,
          accountId: driveCtx.accountId,
          grantedDataPoints: parseGrantedDataPoints(req.body?.granted_data_points)
        });

        return res.json({ success: true });
      } catch (error: unknown) {
        safeLogger.error('[OAuth] Grant reconcile failed', {
          message: error instanceof Error ? error.message : String(error)
        });
        return res.status(500).json({
          error: 'server_error',
          error_description:
            safeClientErrorMessage(error, NODE_ENV === 'production') || 'Grant persist failed'
        });
      }
    });

    // POST /oauth/refresh - Refresh token endpoint
    app.post('/oauth/refresh', async (req, res) => {
      try {
        const { refresh_token, client_id } = req.body;

        if (!refresh_token || !client_id) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: refresh_token, client_id'
          });
        }

        const tokenResponse = await PNOAuthService.refreshAccessToken(refresh_token, client_id);

        if (!tokenResponse) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token'
          });
        }

        return res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token refresh error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Token refresh failed'
        });
      }
    });

    // GET /oauth/zkp-data-points - Get ZKP data points for third-party tools
    // Returns ZKP proofs for data points that the third party has access to
    // NEVER returns pN File, pN Name, or passcode
    app.get('/oauth/zkp-data-points', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'Invalid or expired access token'
          });
        }

        // Get pN identifier from token
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'pN identifier not found in token'
          });
        }

        // Get requested data points from query parameter or token scopes
        const requestedDataPoints = req.query.data_points 
          ? (req.query.data_points as string).split(',').map((dp: string) => dp.trim())
          : (tokenPayload.scope || [])
              .filter((scope: string) => scope.startsWith('zkp:') || scope.startsWith('data_point:'))
              .map((scope: string) => scope.replace(/^(zkp:|data_point:)/, ''));

        // NEVER allow access to sensitive data points
        const { filterAllowedDataPointIds } = await import('@par-noir/standard-data-points');
        const allowedDataPoints = filterAllowedDataPointIds(requestedDataPoints);

        if (allowedDataPoints.length === 0) {
          return res.json({ success: true, dataPoints: [] });
        }

        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
        const { loadZkpBundle } = await import('./storage/zkpStorageService');
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const cloudAccessToken = extractCloudAccessToken(req);
        const zkpBundle = await loadZkpBundle(normalizedPnIdentifier, {
          accessToken: cloudAccessToken,
        });
        if (!zkpBundle) {
          return res.status(409).json({ error: 'drive_not_initialized' });
        }

        const clientId = tokenPayload.clientId;
        if (!clientId) {
          return res.json({ success: true, dataPoints: [] });
        }
        let finalAllowedDataPoints = allowedDataPoints;
        let toolPermission: import('./thirdPartyPermissionsService').ThirdPartyPermission | undefined;

        {
          const { getUserDriveMetadataContext } = await import('./driveMetadataHelper');
          const driveCtx = await getUserDriveMetadataContext(normalizedPnIdentifier, {
            accessToken: cloudAccessToken || zkpBundle.token?.access_token,
          });
          if (!driveCtx) {
            return res.json({ success: true, dataPoints: [] });
          }
          const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
          const permissions = await ThirdPartyPermissionsService.getPermissions(
            driveCtx.accessToken,
            driveCtx.metadataFolderId,
            driveCtx.normalizedPnIdentifier,
            driveCtx.accountId
          );
          toolPermission = permissions[clientId];
          if (!toolPermission || toolPermission.status !== 'active') {
            return res.json({ success: true, dataPoints: [] });
          }
          // Re-stamp the static contract so a sheet row predating dataPointLevels
          // cannot downgrade the required verification level.
          const { applyStaticContract } = await import('@par-noir/standard-data-points');
          toolPermission = applyStaticContract(clientId, toolPermission);
          finalAllowedDataPoints = allowedDataPoints.filter(
            (dp: string) =>
              toolPermission!.requiredDataPoints.includes(dp) || toolPermission!.dataPoints.includes(dp)
          );
          if (finalAllowedDataPoints.length === 0) {
            return res.json({ success: true, dataPoints: [] });
          }
        }

        const {
          getDataPointMinLevel,
          proofMeetsMinLevel,
        } = await import('@par-noir/standard-data-points');
        const ZKPDataPointsService = (await import('./zkpDataPointsService')).ZKPDataPointsService;
        const zkpDataPoints: any[] = [];

        for (const dataPointId of finalAllowedDataPoints) {
          try {
            if (isDevVerbose()) {
              console.log(`[OAuth ZKP] Attempting to get proof for ${dataPointId}`);
            }
            const proof = await ZKPDataPointsService.getDataPointProof(
              zkpBundle.token?.access_token || '',
              zkpBundle.spreadsheetId || '',
              dataPointId,
              zkpBundle.pnIdentifier,
              zkpBundle.accountId
            );
            
            if (proof) {
              const minLevel = getDataPointMinLevel(toolPermission?.dataPointLevels, dataPointId);
              if (!proofMeetsMinLevel(proof.verificationLevel, minLevel)) {
                if (isDevVerbose()) {
                  console.log(
                    `[OAuth ZKP] Omitting ${dataPointId}: level ${proof.verificationLevel} below min ${minLevel}`
                  );
                }
                continue;
              }
              if (isDevVerbose()) {
                console.log(`[OAuth ZKP] Found proof for ${dataPointId}`);
              }
              zkpDataPoints.push({
                dataPointId: proof.dataPointId,
                proofType: proof.proofType,
                zkpProof: proof.zkpProof,
                verifiedAt: proof.verifiedAt,
                expiresAt: proof.expiresAt,
                verificationLevel: proof.verificationLevel
                // NEVER include: encryptedUserData, signature, or any actual user data
              });
            } else if (isDevVerbose()) {
              console.log(`[OAuth ZKP] No proof found for ${dataPointId} (permission granted but ZKP not created yet)`);
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (isDevVerbose()) {
              console.warn(`[OAuth ZKP] Failed to get ZKP proof for ${dataPointId}: ${msg}`);
            }
            // Continue with other data points
          }
        }
        
        if (isDevVerbose()) {
          console.log(`[OAuth ZKP] Returning ${zkpDataPoints.length} data point(s) for ${clientId}`);
        }

        return res.json({ success: true, dataPoints: zkpDataPoints });
      } catch (error: any) {
        console.error('Error getting ZKP data points:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to retrieve ZKP data points'
        });
      }
    });

    // GET /oauth/userinfo - User info endpoint
    // Returns user information based on access token
    // NEVER returns pN File, pN Name, or passcode
    app.get('/oauth/userinfo', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'Invalid or expired access token'
          });
        }

        // Get pN identifier from token payload (derived during token generation)
        // Fallback to database lookup if not in token
        let pnIdentifier: string | undefined = tokenPayload.pnIdentifier;
        
        // If not in token, try database lookup
        if (!pnIdentifier) {
          try {
            const db = (await import('../utils/database')).getDatabasePool();
            const did = tokenPayload.did;
            
            console.log(`🔍 [Userinfo] pN identifier not in token, looking up in database for DID: ${did.substring(0, 20)}...`);
            
            const result = await db.query(
              `SELECT DISTINCT pn_identifier 
               FROM aggregator_metadata 
               WHERE pn_identifier IS NOT NULL 
                 AND (
                   ((metadata->'creator'->>'@id')::text = $1::text) OR
                   ((metadata->'creator'->'identifier'->>'value')::text = $1::text) OR
                   ((metadata->'author'->>'did')::text = $1::text)
                 )
               LIMIT 1`,
              [did]
            );
            
            if (result.rows.length > 0 && result.rows[0].pn_identifier) {
              pnIdentifier = result.rows[0].pn_identifier;
              console.log(`✅ [Userinfo] Found pN identifier in database: ${redactPnIdentifier(pnIdentifier)}`);
            }
          } catch (dbError) {
            console.warn('⚠️ [Userinfo] Failed to look up pN identifier from database:', dbError);
          }
        } else {
          console.log(`✅ [Userinfo] Using pN identifier from token: ${redactPnIdentifier(pnIdentifier)}`);
        }

        // Get publicKey from authorization code (stored during /oauth/auth)
        // We need to look it up from the authorization code that was used to generate this token
        // Since authorization codes are short-lived, we'll need to get it from the refresh token or derive it
        // For now, extract from DID if it's in did:key format (fallback)
        let publicKey: string | undefined = undefined;
        
        // Try to get publicKey from refresh token database
        // Also try looking up by pN identifier if available
        try {
          const db = (await import('../utils/database')).getDatabasePool();
          
          // First try by DID
          let refreshTokenResult = await db.query(
            `SELECT public_key FROM oauth_refresh_tokens WHERE did = $1 ORDER BY expires_at DESC LIMIT 1`,
            [tokenPayload.did]
          );
          
          // If not found and we have pN identifier, try by pN identifier
          if ((!refreshTokenResult.rows.length || !refreshTokenResult.rows[0].public_key) && pnIdentifier) {
            refreshTokenResult = await db.query(
              `SELECT public_key FROM oauth_refresh_tokens WHERE pn_identifier = $1 ORDER BY expires_at DESC LIMIT 1`,
              [pnIdentifier]
            );
          }
          
          if (refreshTokenResult.rows.length > 0 && refreshTokenResult.rows[0].public_key) {
            publicKey = refreshTokenResult.rows[0].public_key;
            console.log(`✅ [Userinfo] Found publicKey from refresh token`);
          } else {
            console.warn(`⚠️ [Userinfo] No publicKey found in refresh token for DID: ${tokenPayload.did.substring(0, 20)}...`);
          }
        } catch (dbError) {
          console.warn('⚠️ [Userinfo] Failed to look up publicKey from refresh token:', dbError);
        }
        
        // Fallback: extract from DID if it's in did:key format
        if (!publicKey && tokenPayload.did.startsWith('did:key:')) {
          publicKey = tokenPayload.did.substring(8); // Remove "did:key:" prefix
          console.log(`✅ [Userinfo] Using publicKey extracted from DID`);
        }

        // NEVER return pN File, pN Name, or passcode to third parties
        // These are sensitive credentials that should never be exposed via OAuth
        
        // Get requested scopes from token
        const scopes = tokenPayload.scope || [];
        const requestedDataPoints = scopes.filter((scope: string) => 
          scope.startsWith('data_point:') || scope.startsWith('zkp:')
        );

        // Build response with only allowed data
        const userInfo: any = {
          sub: tokenPayload.did,
          did: tokenPayload.did,
          pn_identifier: pnIdentifier, // pN identifier is safe to share (it's public)
          // NEVER include: pn_name, pn_file, passcode
        };

        // Self-hosted unlock apps need the public key to decrypt the identity file
        // For other clients, only include if explicitly requested
        if (isSelfHostedUnlockClient(tokenPayload.clientId) && publicKey) {
          userInfo.public_key = publicKey;
        } else if (scopes.includes('public_key') && publicKey) {
          userInfo.public_key = publicKey;
        }

        return res.json(userInfo);
      } catch (error: any) {
        console.error('Userinfo error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to retrieve user info'
        });
      }
    });

    // GET /oauth/consent - Canonical OAuth consent page for all clients
    app.get('/oauth/consent', async (req, res) => {
      const { client_id, redirect_uri, scope, state, nonce } = req.query;

      if (!client_id || !redirect_uri) {
        res.status(400).send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>OAuth Error</h1>
              <p>Missing required parameters: client_id, redirect_uri</p>
            </body>
          </html>
        `);
        return;
      }

      const { ClientRegistrationService } = await import('./clientRegistration');
      let client = await ClientRegistrationService.getClient(client_id as string);

      if (!client && isSelfHostedUnlockClient(client_id as string)) {
        await ClientRegistrationService.ensureDefaultClientsSeeded();
        client = await ClientRegistrationService.getClient(client_id as string);
      }

      if (!client || !(await ClientRegistrationService.validateClient(client_id as string, redirect_uri as string))) {
        res.status(400).send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>OAuth Error</h1>
              <p>Invalid client_id or redirect_uri</p>
            </body>
          </html>
        `);
        return;
      }

      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];
      const scopesHtml = scopes
        .map((s) => {
          const label =
            s === 'openid' ? 'Verify your identity' : s === 'profile' ? 'Access your profile information' : s;
          return `<div class="permission-desc" style="margin:6px 0">• ${label}</div>`;
        })
        .join('');

      const fs = await import('fs');
      const templatePath = path.join(__dirname, 'templates', 'oauth-consent.html');
      let html = fs.readFileSync(templatePath, 'utf8');
      const assetBase =
        (process.env.OAUTH_UI_ASSET_ORIGIN && process.env.OAUTH_UI_ASSET_ORIGIN.replace(/\/$/, '')) ||
        'https://browse.parnoir.com';
      html = html
        .replace(/\{\{CLIENT_NAME\}\}/g, (client.name || client_id as string).replace(/</g, '&lt;'))
        .replace(/\{\{CLIENT_DESCRIPTION\}\}/g, (client.description || 'This application wants to access your pN identity').replace(/</g, '&lt;'))
        .replace(/\{\{SCOPES_HTML\}\}/g, scopesHtml)
        .replace(/\{\{ASSET_BASE\}\}/g, assetBase);

      const { PlatformCommercialLicenseService } = await import('./platformRegistrySyncService');
      const verified = await PlatformCommercialLicenseService.getClientVerified(client_id as string);
      const verifiedBadgeHtml = verified
        ? '<div class="verified-badge" style="margin-top:8px;padding:6px 10px;background:#1a3d1a;border:1px solid #2d6a2d;border-radius:6px;font-size:12px;color:#8fdf8f;">Verified by par Noir</div>'
        : '<div class="unverified-notice" style="margin-top:8px;padding:6px 10px;background:#3d2a1a;border:1px solid #6a4a2d;border-radius:6px;font-size:12px;color:#dfbf8f;">Unverified integrator — confirm the redirect domain before unlocking.</div>';
      html = html.replace(/\{\{VERIFIED_BADGE_HTML\}\}/g, verifiedBadgeHtml);

      res.send(html);
    });

    // GET /oauth/popup-bridge — deprecated (OAuth now redirects to registered redirect_uri only)
    app.get('/oauth/popup-bridge', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.status(410).type('text/plain').send(
        'Gone: popup-bridge is removed. OAuth completes via redirect to your registered redirect_uri (RFC 6749). Update bookmarks and client flows.'
      );
    });

    // Client Management Endpoints (admin key required)
    // POST /oauth/clients - Register a new OAuth client
    app.post('/oauth/clients', requireAdminApiKey, async (req, res) => {
      try {
        const { ClientRegistrationService } = await import('./clientRegistration');
        const { clientId, name, description, redirectUris, scopes, clientSecret } = req.body;

        if (!clientId || !name || !redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required fields: clientId, name, redirectUris (array)'
          });
        }

        if (await ClientRegistrationService.clientExists(clientId)) {
          return res.status(409).json({
            error: 'client_exists',
            error_description: 'Client with this ID already exists'
          });
        }

        const client = await ClientRegistrationService.registerClient({
          clientId,
          name,
          description,
          redirectUris,
          scopes: scopes || [],
          clientSecret,
          isActive: true
        });

        // Don't return clientSecret in response
        const { clientSecret: _, ...clientResponse } = client;
        return res.status(201).json(clientResponse);
      } catch (error: any) {
        console.error('Client registration error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register client'
        });
      }
    });

    // GET /oauth/clients/:client_id - Get client information (admin key required)
    app.get('/oauth/clients/:client_id', requireAdminApiKey, async (req, res) => {
      try {
        const { ClientRegistrationService } = await import('./clientRegistration');
        const client = await ClientRegistrationService.getClient(req.params.client_id);

        if (!client) {
          return res.status(404).json({
            error: 'client_not_found',
            error_description: 'Client not found'
          });
        }

        // Don't return clientSecret
        const { clientSecret: _, ...clientResponse } = client;
        return res.json(clientResponse);
      } catch (error: any) {
        console.error('Get client error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get client'
        });
      }
    });

    // POST /oauth/revoke - Revoke token endpoint
    app.post('/oauth/revoke', async (req, res) => {
      try {
        const { token, token_type_hint } = req.body;

        if (!token) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameter: token'
          });
        }

        // Try to revoke as access token first
        let revoked = PNOAuthService.revokeAccessToken(token);
        
        // If not found and hint suggests refresh token, try that
        if (!revoked && token_type_hint === 'refresh_token') {
          revoked = await PNOAuthService.revokeRefreshToken(token);
        }

        // If still not found, try refresh token anyway
        if (!revoked) {
          revoked = await PNOAuthService.revokeRefreshToken(token);
        }

        return res.json({ revoked: true });
      } catch (error: any) {
        console.error('Token revocation error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Token revocation failed'
        });
      }
    });
}
