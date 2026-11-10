/**
 * API Routes
 * Handles API key authentication, data points, and content portability.
 * User OAuth lives only under `/oauth/*` (see pnOAuthRoutes).
 */

import { Request, Response } from 'express';
import { getStandardDataPointsPublic, DATA_POINT_CATEGORIES } from './standardDataPointsCatalog';
import { ApiKeyService } from './apiKeyService';

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

      const { getDataPointRequest } = await import('./dataPointRequestStore');
      const row = await getDataPointRequest(identity_id, requestId);
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
        dataPointIds: [dataPointId],
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

      if (
        typeof identity_id !== 'string' ||
        !identity_id ||
        typeof client_id !== 'string' ||
        !client_id ||
        !Array.isArray(data_points) ||
        data_points.length === 0 ||
        !data_points.every((d: unknown) => typeof d === 'string' && d.length > 0)
      ) {
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

      const { createDataPointRequest } = await import('./dataPointRequestStore');
      const row = await createDataPointRequest({
        pnIdentifier: identity_id,
        clientId: client_id,
        toolName: typeof tool_name === 'string' && tool_name ? tool_name : client_id,
        dataPoints: data_points,
        reason: typeof reason === 'string' ? reason : ''
      });

      const { enqueueSocialJob } = await import('./socialRail');
      await enqueueSocialJob({
        jobType: 'notification_row',
        peerPn: identity_id.startsWith('pn-') ? identity_id : `pn-${identity_id}`,
        requestId: row.requestId,
        extra: { kind: 'data_point_request', requestId: row.requestId, clientId: client_id }
      });

      return res.status(201).json({
        success: true,
        requestId: row.requestId,
        status: row.status,
        createdAt: row.createdAt
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

function ownerPnFromBearer(req: Request, res: Response, getPayload: (req: Request) => any): string | null {
  const tokenPayload = getPayload(req);
  if (!tokenPayload?.pnIdentifier) {
    res.status(401).json({ error: 'invalid_token' });
    return null;
  }
  const normalize = (pn: string) => (pn.startsWith('pn-') ? pn : `pn-${pn}`);
  const normalized = normalize(req.params.pnIdentifier);
  if (normalized !== normalize(tokenPayload.pnIdentifier)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return normalized;
}

/** User-facing data point consent (Bearer token). */
export function setupDataPointUserRoutes(app: any) {
  app.get('/api/users/:pnIdentifier/data-point-requests', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const normalized = ownerPnFromBearer(req, res, getBearerTokenPayload);
      if (!normalized) return;

      const status = req.query.status as string | undefined;
      const { listDataPointRequests } = await import('./dataPointRequestStore');
      const requests = await listDataPointRequests(
        normalized,
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
      const normalized = ownerPnFromBearer(req, res, getBearerTokenPayload);
      if (!normalized) return;

      const { action } = req.body as { action?: 'approve' | 'decline' };
      if (action !== 'approve' && action !== 'decline') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'action must be approve or decline'
        });
      }

      const { respondToDataPointRequest } = await import('./dataPointRequestStore');
      const newStatus = action === 'approve' ? 'approved' : 'declined';
      const row = await respondToDataPointRequest(normalized, req.params.requestId, newStatus);
      if (!row) {
        return res.status(404).json({ error: 'not_found' });
      }

      const dataPointIds = row.dataPoints.split(',').map((s) => s.trim()).filter(Boolean);
      if (action === 'approve') {
        const { grantDataPointsToClient } = await import('./integratorDataPointService');
        await grantDataPointsToClient({
          userPnIdentifier: normalized,
          clientId: row.clientId,
          toolName: row.toolName,
          dataPointIds
        });
      }

      const {
        IntegratorWebhookService,
        INTEGRATOR_WEBHOOK_EVENTS
      } = await import('./integratorWebhookService');
      IntegratorWebhookService.emitDataPointRequestEvent(
        row.clientId,
        action === 'approve'
          ? INTEGRATOR_WEBHOOK_EVENTS.DATA_POINT_REQUEST_APPROVED
          : INTEGRATOR_WEBHOOK_EVENTS.DATA_POINT_REQUEST_DECLINED,
        {
          requestId: row.requestId,
          identityId: normalized,
          clientId: row.clientId,
          dataPoints: dataPointIds,
          status: newStatus,
          approvedAt: row.respondedAt || new Date().toISOString()
        }
      );

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

