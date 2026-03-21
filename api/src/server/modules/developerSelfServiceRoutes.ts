/**
 * Developer portal self-service: Bearer token must be issued for client DEVELOPER_PORTAL_CLIENT_ID
 * (default developer-portal). pnId for API keys comes from the token only.
 */

import type { Application, Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiKeyService } from './apiKeyService';
import { ClientRegistrationService } from './clientRegistration';
import { appendAuditEvent } from './auditService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

const RESERVED_CLIENT_IDS = new Set(['browser-app', 'prism-app', 'developer-portal']);

export function getDeveloperPortalClientId(): string {
  return (process.env.DEVELOPER_PORTAL_CLIENT_ID || 'developer-portal').trim();
}

function requireDeveloperPortalClient(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const expected = getDeveloperPortalClientId();
  if (req.user?.clientId !== expected) {
    res.status(403).json({
      error: 'forbidden',
      error_description:
        'Sign in through the developer console (par Noir OAuth). Tokens from other apps cannot use this API.'
    });
    return;
  }
  next();
}

function validateSelfServiceClientId(clientId: string): string | null {
  const id = clientId.trim();
  if (id.length < 3 || id.length > 64) return 'client id must be 3–64 characters';
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && !/^[a-z0-9]{3}$/.test(id)) {
    return 'client id must be lowercase letters, digits, and hyphens (no leading/trailing hyphen)';
  }
  if (RESERVED_CLIENT_IDS.has(id)) return 'this client id is reserved';
  return null;
}

export function registerDeveloperSelfServiceRoutes(app: Application): void {
  const chain = [requireAuth, requireDeveloperPortalClient];

  app.post('/api/developer/api-keys', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id; unlock identity and sign in again.'
        });
      }

      const { scopes, requestsPerMinute, requestsPerDay } = req.body || {};
      const { record, plaintextKey } = await ApiKeyService.createApiKey({
        pnId,
        scopes: Array.isArray(scopes) ? scopes.map(String) : undefined,
        requestsPerMinute: typeof requestsPerMinute === 'number' ? requestsPerMinute : undefined,
        requestsPerDay: typeof requestsPerDay === 'number' ? requestsPerDay : undefined,
        auditActorHint: 'developer_portal'
      });

      return res.status(201).json({
        id: record.id,
        pnId: record.pnId,
        ownerType: record.ownerType,
        scopes: record.scopes,
        apiKey: plaintextKey,
        message: 'Store this API key securely; it will not be shown again.'
      });
    } catch (error: unknown) {
      console.error('[developer] create api key:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to create API key'
      });
    }
  });

  app.get('/api/developer/api-keys', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id.'
        });
      }
      const keys = await ApiKeyService.listKeysByPnId(pnId);
      return res.json({ keys });
    } catch (error: unknown) {
      console.error('[developer] list api keys:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list API keys'
      });
    }
  });

  app.post('/api/developer/oauth-clients', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerPn = req.user?.pnIdentifier?.trim();
      if (!ownerPn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id.'
        });
      }

      const { clientId, name, description, redirectUris, scopes, clientSecret } = req.body || {};
      if (!clientId || typeof clientId !== 'string' || !name || typeof name !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'clientId and name are required strings'
        });
      }
      const idErr = validateSelfServiceClientId(clientId);
      if (idErr) {
        return res.status(400).json({ error: 'invalid_request', error_description: idErr });
      }
      if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'redirectUris must be a non-empty array of URLs'
        });
      }

      if (await ClientRegistrationService.clientExists(clientId.trim())) {
        return res.status(409).json({
          error: 'client_exists',
          error_description: 'A client with this id already exists'
        });
      }

      const client = await ClientRegistrationService.registerClient({
        clientId: clientId.trim(),
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : undefined,
        redirectUris: redirectUris.map((u: unknown) => String(u).trim()).filter(Boolean),
        scopes: Array.isArray(scopes) ? scopes.map(String) : ['openid', 'profile'],
        clientSecret: typeof clientSecret === 'string' ? clientSecret : undefined,
        isActive: true,
        ownerPnId: ownerPn
      });

      await appendAuditEvent({
        eventType: 'oauth_client.registered',
        actorHint: 'developer_portal',
        subjectPnIdentifier: ownerPn,
        metadata: { clientId: client.clientId }
      });

      const { clientSecret: _omit, ...clientResponse } = client;
      return res.status(201).json(clientResponse);
    } catch (error: unknown) {
      console.error('[developer] register oauth client:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register client'
      });
    }
  });

  app.get('/api/developer/oauth-clients', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerPn = req.user?.pnIdentifier?.trim();
      if (!ownerPn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id.'
        });
      }
      const clients = await ClientRegistrationService.listClientsByOwnerPnId(ownerPn);
      const safe = clients.map(({ clientSecret: _, ...rest }) => rest);
      return res.json({ clients: safe });
    } catch (error: unknown) {
      console.error('[developer] list oauth clients:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list clients'
      });
    }
  });
}
