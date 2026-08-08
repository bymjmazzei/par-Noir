/**
 * Developer portal self-service: Bearer token must be issued for client DEVELOPER_PORTAL_CLIENT_ID
 * (default developer-portal). pnId for API keys comes from the token only.
 */

import type { Application, Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { ApiKeyService } from './apiKeyService';
import { ClientRegistrationService } from './clientRegistration';
import { appendAuditEvent, listAuditEventsBySubject } from './auditService';
import { safeClientErrorMessage } from '../utils/safeError';
import { isPlatformRegistryConfigured } from './platformOperatorService';
import { submitOAuthClientApplication } from './platformRegistryApplicationService';
import { PlatformCommercialLicenseService } from './platformRegistrySyncService';

const NODE_ENV = process.env.NODE_ENV || 'development';

const RESERVED_CLIENT_IDS = new Set([
  'browser-app',
  'messaging-app',
  'prism-app',
  'developer-portal',
  'licensing-portal'
]);

const DATA_POINT_PROPOSAL_EVENT = 'data_point.proposal';

export function getDeveloperPortalClientId(): string {
  return (process.env.DEVELOPER_PORTAL_CLIENT_ID || 'developer-portal').trim();
}

export function requireDeveloperPortalClient(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
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
      const scopeList = Array.isArray(scopes) ? scopes.map(String) : undefined;
      const rpm = typeof requestsPerMinute === 'number' ? requestsPerMinute : undefined;
      const rpd = typeof requestsPerDay === 'number' ? requestsPerDay : undefined;

      if (
        isPlatformRegistryConfigured() &&
        (PlatformCommercialLicenseService.scopesRequireCommercial(scopeList ?? []) ||
          PlatformCommercialLicenseService.limitsRequireCommercial(rpm, rpd))
      ) {
        const licensed = await PlatformCommercialLicenseService.hasActiveLicenseForPn(pnId);
        if (!licensed) {
          return res.status(403).json({
            error: 'commercial_license_required',
            error_description:
              'Elevated API limits or commercial scopes require an active commercial license. Contact licensing@parnoir.com or request approval via the platform operator.'
          });
        }
      }

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

      const trimmedClientId = clientId.trim();
      const redirectUriList = redirectUris.map((u: unknown) => String(u).trim()).filter(Boolean);
      const scopeList = Array.isArray(scopes) ? scopes.map(String) : ['openid', 'profile'];

      if (isPlatformRegistryConfigured()) {
        if (await ClientRegistrationService.clientExists(trimmedClientId)) {
          const existing = await ClientRegistrationService.getClient(trimmedClientId);
          if (existing?.isActive) {
            return res.status(409).json({
              error: 'client_exists',
              error_description: 'A client with this id already exists'
            });
          }
        }

        try {
          const { applicationId, status } = await submitOAuthClientApplication({
            clientId: trimmedClientId,
            name: name.trim(),
            description: typeof description === 'string' ? description.trim() : undefined,
            redirectUris: redirectUriList,
            scopes: scopeList,
            ownerPnId: ownerPn
          });

          await appendAuditEvent({
            eventType: 'oauth_client.application_submitted',
            actorHint: 'developer_portal',
            subjectPnIdentifier: ownerPn,
            metadata: { clientId: trimmedClientId, applicationId }
          });

          return res.status(201).json({
            applicationId,
            clientId: trimmedClientId,
            status,
            message: 'Application submitted for platform operator review. OAuth will activate after approval.'
          });
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 409) {
            return res.status(409).json({
              error: 'client_exists',
              error_description: (err as Error).message
            });
          }
          throw err;
        }
      }

      if (await ClientRegistrationService.clientExists(trimmedClientId)) {
        return res.status(409).json({
          error: 'client_exists',
          error_description: 'A client with this id already exists'
        });
      }

      const client = await ClientRegistrationService.registerClient({
        clientId: trimmedClientId,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : undefined,
        redirectUris: redirectUriList,
        scopes: scopeList,
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

  app.post('/api/developer/data-point-proposals', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id.'
        });
      }

      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const useCase = typeof body.useCase === 'string' ? body.useCase.trim() : '';
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const dataType = typeof body.dataType === 'string' ? body.dataType.trim() : '';

      if (!name || !description || !useCase) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'name, description, and useCase are required'
        });
      }

      const allowedCategories = new Set(['verification', 'preferences', 'compliance', 'location']);
      if (!allowedCategories.has(category)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'category must be verification, preferences, compliance, or location'
        });
      }

      const allowedDataTypes = new Set(['string', 'number', 'boolean', 'date', 'object']);
      if (!allowedDataTypes.has(dataType)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'dataType must be string, number, boolean, date, or object'
        });
      }

      const requiredFields = Array.isArray(body.requiredFields)
        ? body.requiredFields.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [];
      const examples = Array.isArray(body.examples)
        ? body.examples.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [];

      if (requiredFields.length === 0 || examples.length === 0) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'requiredFields and examples must be non-empty arrays'
        });
      }

      const proposalId = `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const proposedAt = new Date().toISOString();

      await appendAuditEvent({
        eventType: DATA_POINT_PROPOSAL_EVENT,
        actorHint: 'developer_portal',
        subjectPnIdentifier: pnId,
        metadata: {
          proposalId,
          proposedAt,
          name,
          description,
          category,
          dataType,
          requiredFields,
          examples,
          useCase
        }
      });

      return res.status(201).json({ proposalId, proposedAt, status: 'pending' });
    } catch (error: unknown) {
      console.error('[developer] data-point-proposals POST:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to submit proposal'
      });
    }
  });

  app.get('/api/developer/data-point-proposals', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Your session has no par Noir user id.'
        });
      }

      const rows = await listAuditEventsBySubject({
        subjectPnIdentifier: pnId,
        eventType: DATA_POINT_PROPOSAL_EVENT,
        limit: 100
      });

      const proposals = rows.map((row) => ({
        ...((row.metadata as Record<string, unknown>) || {}),
        recordedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
      }));

      return res.json({ proposals });
    } catch (error: unknown) {
      console.error('[developer] data-point-proposals GET:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list proposals'
      });
    }
  });

  app.post('/api/developer/webhooks', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Your session has no par Noir user id.' });
      }
      const { clientId, url, events } = req.body || {};
      if (!clientId || !url || !Array.isArray(events)) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'clientId, url, and events[] are required'
        });
      }
      const { IntegratorWebhookService } = await import('./integratorWebhookService');
      const { subscription, secret } = await IntegratorWebhookService.createSubscription({
        clientId: String(clientId),
        ownerPnId: pnId,
        url: String(url),
        events: events.map(String)
      });
      return res.status(201).json({
        subscription,
        secret,
        message: 'Store this signing secret securely; it will not be shown again.'
      });
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 403 || statusCode === 404) {
        return res.status(statusCode).json({ error: 'forbidden', error_description: (error as Error).message });
      }
      if (error instanceof Error && error.message.includes('event')) {
        return res.status(400).json({ error: 'invalid_request', error_description: error.message });
      }
      console.error('[developer] webhooks POST:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to create webhook'
      });
    }
  });

  app.get('/api/developer/webhooks', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      const clientId = String(req.query.clientId || '').trim();
      if (!pnId || !clientId) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'clientId query parameter is required'
        });
      }
      const { IntegratorWebhookService } = await import('./integratorWebhookService');
      const subscriptions = await IntegratorWebhookService.listSubscriptions(clientId, pnId);
      return res.json({ subscriptions });
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 403 || statusCode === 404) {
        return res.status(statusCode).json({ error: 'forbidden', error_description: (error as Error).message });
      }
      console.error('[developer] webhooks GET:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.put('/api/developer/webhooks/:id', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Your session has no par Noir user id.' });
      }
      const { url, events, isActive } = req.body || {};
      const { IntegratorWebhookService } = await import('./integratorWebhookService');
      const updated = await IntegratorWebhookService.updateSubscription(req.params.id, pnId, {
        url: typeof url === 'string' ? url : undefined,
        events: Array.isArray(events) ? events.map(String) : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : undefined
      });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      return res.json({ subscription: updated });
    } catch (error: unknown) {
      console.error('[developer] webhooks PUT:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.delete('/api/developer/webhooks/:id', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Your session has no par Noir user id.' });
      }
      const { IntegratorWebhookService } = await import('./integratorWebhookService');
      const deleted = await IntegratorWebhookService.deleteSubscription(req.params.id, pnId);
      if (!deleted) return res.status(404).json({ error: 'not_found' });
      return res.json({ success: true });
    } catch (error: unknown) {
      console.error('[developer] webhooks DELETE:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/developer/webhooks/:id/rotate-secret', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pnId = req.user?.pnIdentifier?.trim();
      if (!pnId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Your session has no par Noir user id.' });
      }
      const { IntegratorWebhookService } = await import('./integratorWebhookService');
      const rotated = await IntegratorWebhookService.rotateSecret(req.params.id, pnId);
      if (!rotated) return res.status(404).json({ error: 'not_found' });
      return res.json({
        secret: rotated.secret,
        message: 'Store this signing secret securely; it will not be shown again.'
      });
    } catch (error: unknown) {
      console.error('[developer] webhooks rotate-secret:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
