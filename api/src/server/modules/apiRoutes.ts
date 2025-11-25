/**
 * API Routes
 * Handles API key authentication, OAuth, data points, and content portability
 */

import { Request, Response } from 'express';
import { ApiKeyService } from './apiKeyService';
import { PNOAuthService } from './pnOAuthService';
import { ZKPDataPointsService } from './zkpDataPointsService';
import { AggregatorMetadataService } from './aggregatorMetadataService';

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

  // Attach API key data to request
  (req as any).apiKey = validation.apiKeyData;
  next();
  return;
}

/**
 * OAuth Authentication Endpoints
 */
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
      
      // Generate authorization code
      const code = PNOAuthService.generateAuthorizationCode({
        clientId: client_id as string,
        redirectUri: redirect_uri as string,
        scope: scopes,
        state: state as string,
        nonce: nonce as string,
        did: apiKey.pnId, // Use pN ID from API key
        pnIdentifier: apiKey.pnId
      });

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
 * Data Point Request Endpoints
 */
export function setupDataPointRoutes(app: any) {
  /**
   * GET /api/v1/data-points/:dataPointId
   * Request a persistent data point (e.g., identity_attestation, age_attestation)
   */
  app.get('/api/v1/data-points/:dataPointId', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { dataPointId } = req.params;
      const { identity_id } = req.query;
      const apiKey = (req as any).apiKey;

      if (!identity_id) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'identity_id query parameter is required'
        });
      }

      // Check if API key has data_points scope
      if (!ApiKeyService.hasScope(apiKey, 'data_points')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have data_points scope'
        });
      }

      // Get data point from ZKP service
      // Note: This requires access token - for API access, we'd need to get it from the identity
      // For now, return a placeholder response indicating the endpoint structure
      return res.status(501).json({
        error: 'not_implemented',
        error_description: 'Data point retrieval requires identity access token. Use OAuth flow to obtain access token first.'
      });
    } catch (error) {
      console.error('[DataPoints] Request error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to retrieve data point'
      });
    }
  });

  /**
   * POST /api/v1/data-points/request
   * Request transactional data points (requires user consent)
   */
  app.post('/api/v1/data-points/request', authenticateApiKey, async (req: Request, res: Response) => {
    try {
      const { identity_id, data_points, reason } = req.body;
      const apiKey = (req as any).apiKey;

      if (!identity_id || !data_points || !Array.isArray(data_points)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'identity_id and data_points array are required'
        });
      }

      // Check if API key has data_points scope
      if (!ApiKeyService.hasScope(apiKey, 'data_points')) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: 'API key does not have data_points scope'
        });
      }

      // Create data point request (requires user consent)
      // Note: This would require implementing a request system
      // For now, return a placeholder response
      return res.status(501).json({
        error: 'not_implemented',
        error_description: 'Data point request system not yet implemented. Use OAuth flow to request data points.'
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

