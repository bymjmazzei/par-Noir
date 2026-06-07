/**
 * API Routes
 * Handles API key authentication, OAuth, data points, and content portability
 */

import { Request, Response } from 'express';
import { getStandardDataPointsPublic, DATA_POINT_CATEGORIES } from './standardDataPointsCatalog';
import { ApiKeyService } from './apiKeyService';
import { PNOAuthService } from './pnOAuthService';

/**
 * Middleware to authenticate API requests using API key
 */
export async function authenticateApiKey(req: Request, res: Response, next: Function): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide via X-API-Key header or api_key query parameter.'
    });
    return;
  }

  const validation = await ApiKeyService.validateApiKey(apiKey);

  if (!validation.valid) {
    res.status(401).json({
      error: 'Unauthorized',
      message: validation.error || 'Invalid API key'
    });
    return;
  }

  const apiKeyData = validation.apiKeyData!;

  const limitResult = await ApiKeyService.checkRateLimit(apiKeyData.id, apiKeyData.rateLimit);
  if (!limitResult.allowed) {
    const retryAfterSec = limitResult.resetAt
      ? Math.ceil((limitResult.resetAt - Date.now()) / 1000)
      : 60;
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'API key rate limit exceeded. Try again later.'
    });
    return;
  }

  (req as any).apiKey = apiKeyData;
  next();
  return;
}

/**
 * OAuth Authentication Endpoints
 */
/**
 * Public read-only identity succession (integrators; no PII beyond opaque pn ids)
 */
export function setupIdentityPublicRoutes(app: any) {
  app.get('/api/v1/identity/successor', async (req: Request, res: Response) => {
    try {
      const pn = req.query.pn_identifier as string;
      if (!pn || typeof pn !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'pn_identifier query parameter is required'
        });
      }
      const { getSuccessorPublicInfo } = await import('./identitySuccessionService');
      const info = await getSuccessorPublicInfo(pn);
      return res.json(info);
    } catch (error) {
      console.error('[identity/successor] error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to load succession state'
      });
    }
  });

  /**
   * GET /api/v1/standard-data-points
   * Public metadata catalog (no PII; integrators and developer portal).
   */
  app.get('/api/v1/standard-data-points', (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({
        version: '1',
        dataPoints: getStandardDataPointsPublic(),
        categories: DATA_POINT_CATEGORIES
      });
    } catch (error) {
      console.error('[standard-data-points] error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to load standard data points catalog'
      });
    }
  });

  /** Alias — same payload as /successor (plan naming) */
  app.get('/api/v1/identity/revocations', async (req: Request, res: Response) => {
    try {
      const pn = req.query.pn_identifier as string;
      if (!pn || typeof pn !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'pn_identifier query parameter is required'
        });
      }
      const { getSuccessorPublicInfo } = await import('./identitySuccessionService');
      const info = await getSuccessorPublicInfo(pn);
      return res.json({
        revoked: info.revoked,
        successorPnIdentifier: info.successorPnIdentifier,
        effectiveAt: info.effectiveAt
      });
    } catch (error) {
      console.error('[identity/revocations] error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to load revocation state'
      });
    }
  });
}

export function setupOAuthRoutes(app: any) {
  /**
   * GET /api/v1/oauth/authorize
   * Generate authorization code for OAuth flow
   */
  app.get('/api/v1/oauth/authorize', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { client_id, redirect_uri, scope, state, nonce } = req.query;
      const apiKey = (req as any).apiKey;

      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id and redirect_uri are required'
        });
      }

      // Validate client_id matches API key's pN ID or is registered
      // For now, we'll allow any client_id (can be enhanced with client registration)

      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];

      let code: string;
      try {
        code = PNOAuthService.generateAuthorizationCode({
          clientId: client_id as string,
          redirectUri: redirect_uri as string,
          scope: scopes,
          state: state as string,
          nonce: nonce as string,
          did: apiKey.pnId, // Use pN ID from API key
          pnIdentifier: apiKey.pnId
        });
      } catch (e: unknown) {
        if ((e as Error & { code?: string }).code === 'IDENTITY_SUPERSEDED') {
          return res.status(403).json({
            error: 'access_denied',
            error_description: 'This pN identifier is superseded on the par Noir network. Use the successor identity.'
          });
        }
        throw e;
      }

      // Return authorization code
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state as string);

      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('[OAuth] Authorization error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to generate authorization code'
      });
    }
  });

  /**
   * POST /api/v1/oauth/token
   * Exchange authorization code for access token
   */
  app.post('/api/v1/oauth/token', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { grant_type, code, redirect_uri, client_id } = req.body;

      if (grant_type !== 'authorization_code') {
        return res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported'
        });
      }

      if (!code || !redirect_uri || !client_id) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'code, redirect_uri, and client_id are required'
        });
      }

      const token = await PNOAuthService.exchangeCodeForToken({
        code: code as string,
        redirectUri: redirect_uri as string,
        clientId: client_id as string
      });

      if (!token) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code'
        });
      }

      return res.json(token);
    } catch (error) {
      console.error('[OAuth] Token exchange error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to exchange code for token'
      });
    }
  });
}

/**
 * Data Point Request Endpoints (L5 API-key integrator flow)
 */
export function setupDataPointRoutes(app: any) {
  app.get('/api/v1/data-points/requests/:requestId', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const { identity_id } = req.query;
      const apiKey = (req as any).apiKey;

      if (!identity_id || typeof identity_id !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'identity_id query parameter is required'
        });
      }

      if (!ApiKeyService.hasScope(apiKey, 'data_points')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have data_points scope'
        });
      }

      const { getUserDriveMetadataContext } = await import('./driveMetadataHelper');
      const ctx = await getUserDriveMetadataContext(identity_id);
      if (!ctx) {
        return res.status(404).json({ error: 'not_found', error_description: 'User not found' });
      }

      const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
      const token = { access_token: ctx.accessToken };
      const spreadsheetId = await DataPointRequestSheetsService.findSpreadsheetId(
        token,
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      if (!spreadsheetId) {
        return res.status(404).json({ error: 'not_found', error_description: 'Request not found' });
      }

      const rows = await DataPointRequestSheetsService.listRequests(
        token,
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const row = rows.find((r) => r.requestId === requestId);
      if (!row) {
        return res.status(404).json({ error: 'not_found', error_description: 'Request not found' });
      }

      return res.json({ success: true, request: row });
    } catch (error) {
      console.error('[DataPoints] Poll error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to get request status'
      });
    }
  });

  app.get('/api/v1/data-points/:dataPointId', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { dataPointId } = req.params;
      const { identity_id, client_id } = req.query;
      const apiKey = (req as any).apiKey;

      if (!identity_id || typeof identity_id !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'identity_id query parameter is required'
        });
      }

      if (!client_id || typeof client_id !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'client_id query parameter is required'
        });
      }

      if (!ApiKeyService.hasScope(apiKey, 'data_points')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have data_points scope'
        });
      }

      const { fetchGrantedZkpProofs } = await import('./integratorDataPointService');
      const proofs = await fetchGrantedZkpProofs({
        userPnIdentifier: identity_id,
        clientId: client_id,
        dataPointIds: [dataPointId]
      });

      const proof = proofs.find((p) => p.dataPointId === dataPointId);
      if (!proof) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'Data point not granted or proof not available'
        });
      }

      return res.json({ success: true, dataPoint: proof });
    } catch (error) {
      console.error('[DataPoints] GET error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to retrieve data point'
      });
    }
  });

  app.post('/api/v1/data-points/request', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { identity_id, client_id, data_points, reason, tool_name } = req.body;
      const apiKey = (req as any).apiKey;

      if (!identity_id || !client_id || !data_points || !Array.isArray(data_points)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'identity_id, client_id, and data_points array are required'
        });
      }

      if (!ApiKeyService.hasScope(apiKey, 'data_points')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have data_points scope'
        });
      }

      const { getUserDriveMetadataContext } = await import('./driveMetadataHelper');
      const ctx = await getUserDriveMetadataContext(identity_id);
      if (!ctx) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'User Drive not connected'
        });
      }

      const crypto = await import('crypto');
      const requestId = `dpr_${crypto.randomBytes(12).toString('hex')}`;
      const createdAt = new Date().toISOString();

      const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
      const token = { access_token: ctx.accessToken };

      const spreadsheetId = await DataPointRequestSheetsService.getOrCreateSpreadsheet(
        token,
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      await DataPointRequestSheetsService.appendRequest(
        token,
        spreadsheetId,
        {
          requestId,
          clientId: client_id,
          toolName: tool_name || client_id,
          dataPoints: data_points.join(','),
          reason: reason || '',
          status: 'pending',
          createdAt
        },
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      const { NotificationService } = await import('./notificationService');
      await NotificationService.createNotification(
        ctx.accessToken,
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        {
          user_pn_identifier: ctx.normalizedPnIdentifier,
          type: 'data_point_request',
          title: 'Data sharing request',
          message: 'An app requested access to your data points',
          data: {
            request_id: requestId,
            client_id,
            data_points: data_points.join(',')
          }
        }
      ).catch((e: Error) => console.warn('[DataPoints] notification failed:', e.message));

      return res.status(201).json({
        success: true,
        requestId,
        status: 'pending',
        createdAt
      });
    } catch (error) {
      console.error('[DataPoints] Request creation error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to create data point request'
      });
    }
  });
}

/** User-facing data point consent (Bearer token). */
export function setupDataPointUserRoutes(app: any) {
  app.get('/api/users/:pnIdentifier/data-point-requests', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      const normalized = req.params.pnIdentifier.startsWith('pn-')
        ? req.params.pnIdentifier
        : `pn-${req.params.pnIdentifier}`;
      const tokenPn = tokenPayload.pnIdentifier.startsWith('pn-')
        ? tokenPayload.pnIdentifier
        : `pn-${tokenPayload.pnIdentifier}`;

      if (normalized !== tokenPn) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { getUserDriveMetadataContext } = await import('./driveMetadataHelper');
      const ctx = await getUserDriveMetadataContext(normalized);
      if (!ctx) {
        return res.json({ success: true, requests: [] });
      }

      const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
      const token = { access_token: ctx.accessToken };
      const spreadsheetId = await DataPointRequestSheetsService.findSpreadsheetId(
        token,
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      if (!spreadsheetId) {
        return res.json({ success: true, requests: [] });
      }

      const status = req.query.status as string | undefined;
      const requests = await DataPointRequestSheetsService.listRequests(
        token,
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId,
        status === 'pending' || status === 'approved' || status === 'declined' ? status : undefined
      );

      return res.json({ success: true, requests });
    } catch (error) {
      console.error('[DataPointRequests] list error:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/users/:pnIdentifier/data-point-requests/:requestId/respond', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      const { action } = req.body as { action?: 'approve' | 'decline' };
      if (action !== 'approve' && action !== 'decline') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'action must be approve or decline'
        });
      }

      const normalized = req.params.pnIdentifier.startsWith('pn-')
        ? req.params.pnIdentifier
        : `pn-${req.params.pnIdentifier}`;
      const tokenPn = tokenPayload.pnIdentifier.startsWith('pn-')
        ? tokenPayload.pnIdentifier
        : `pn-${tokenPayload.pnIdentifier}`;

      if (normalized !== tokenPn) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { getUserDriveMetadataContext } = await import('./driveMetadataHelper');
      const ctx = await getUserDriveMetadataContext(normalized);
      if (!ctx) {
        return res.status(404).json({ error: 'not_found' });
      }

      const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
      const token = { access_token: ctx.accessToken };
      const spreadsheetId = await DataPointRequestSheetsService.findSpreadsheetId(
        token,
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      if (!spreadsheetId) {
        return res.status(404).json({ error: 'not_found' });
      }

      const rows = await DataPointRequestSheetsService.listRequests(
        token,
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const row = rows.find((r) => r.requestId === req.params.requestId);
      if (!row || row.status !== 'pending') {
        return res.status(404).json({ error: 'not_found' });
      }

      const newStatus = action === 'approve' ? 'approved' : 'declined';
      await DataPointRequestSheetsService.updateRequestStatus(
        token,
        spreadsheetId,
        req.params.requestId,
        newStatus,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );

      if (action === 'approve') {
        const dataPointIds = row.dataPoints.split(',').map((s) => s.trim()).filter(Boolean);
        const { grantDataPointsToClient } = await import('./integratorDataPointService');
        await grantDataPointsToClient({
          userPnIdentifier: normalized,
          clientId: row.clientId,
          toolName: row.toolName,
          dataPointIds
        });
      }

      return res.json({ success: true, status: newStatus });
    } catch (error) {
      console.error('[DataPointRequests] respond error:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}

/**
 * Content Portability Endpoints
 */
export function setupContentPortabilityRoutes(app: any) {
  /**
   * GET /api/v1/public-index/:identityId
   * Get user's public index (portable content)
   */
  app.get('/api/v1/public-index/:identityId', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { identityId } = req.params;
      const apiKey = (req as any).apiKey;

      // Check if API key has content scope
      if (!ApiKeyService.hasScope(apiKey, 'content')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have content scope'
        });
      }

      // Get public index from aggregator metadata service
      // Use the existing metadata index service to get public files for this identity
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      
      // Search for public files by creator DID
      const result = await service.searchMetadata('', {
        authorDid: identityId,
        limit: 1000,
        offset: 0
      });

      // Filter to only public files
      const publicFiles = result.files
        .filter((entry: any) => entry.metadata?.isPublic === true)
        .map((entry: any) => entry.metadata);

      return res.json({
        identityId,
        files: publicFiles,
        total: publicFiles.length,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[ContentPortability] Public index error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to retrieve public index'
      });
    }
  });
}

