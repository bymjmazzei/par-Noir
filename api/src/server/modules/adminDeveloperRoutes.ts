/**
 * Admin-only routes for OAuth client registration and API key issuance.
 * Requires ADMIN_API_KEY in env (X-Admin-Key header, or Authorization: Bearer <same value>).
 * In production, missing ADMIN_API_KEY rejects admin routes.
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { ApiKeyService } from './apiKeyService';
import { safeClientErrorMessage } from '../utils/safeError';
import { registerSuccession } from './identitySuccessionService';
import { appendAuditEvent } from './auditService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) {
    if (NODE_ENV === 'production') {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Admin operations are not configured'
      });
      return;
    }
    console.warn('[admin] ADMIN_API_KEY unset — allowing admin route in non-production');
    next();
    return;
  }

  let provided = (req.headers['x-admin-key'] as string) || '';
  const auth = req.headers.authorization;
  if (!provided && auth?.startsWith('Bearer ')) {
    provided = auth.slice(7).trim();
  }

  if (provided !== expected) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Invalid or missing admin key (use X-Admin-Key or Authorization: Bearer)'
    });
    return;
  }

  next();
}

export function registerAdminDeveloperRoutes(app: Application): void {
  app.post('/api/admin/api-keys', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { pnId, ownerType, scopes, isActive, requestsPerMinute, requestsPerDay } = req.body || {};
      if (!pnId || typeof pnId !== 'string') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'pnId is required'
        });
      }

      const { record, plaintextKey } = await ApiKeyService.createApiKey({
        pnId: pnId.trim(),
        ownerType: typeof ownerType === 'string' ? ownerType : undefined,
        scopes: Array.isArray(scopes) ? scopes.map(String) : undefined,
        isActive: isActive !== false,
        requestsPerMinute: typeof requestsPerMinute === 'number' ? requestsPerMinute : undefined,
        requestsPerDay: typeof requestsPerDay === 'number' ? requestsPerDay : undefined
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
      console.error('[admin] create api key:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to create API key'
      });
    }
  });

  /**
   * POST /api/admin/identity/succession
   * Register predecessor → successor for par Noir network (OAuth, storage, feeds binding).
   * Requires ADMIN_API_KEY. Run from secure automation after recovery / rotation workflows.
   */
  app.post('/api/admin/identity/succession', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const {
        predecessorPnIdentifier,
        successorPnIdentifier,
        predecessorDid,
        successorDid,
        migrationId,
        reason,
        migrateBindings
      } = req.body || {};

      if (!predecessorPnIdentifier || !successorPnIdentifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'predecessorPnIdentifier and successorPnIdentifier are required'
        });
      }

      await registerSuccession({
        predecessorPnIdentifier: String(predecessorPnIdentifier),
        successorPnIdentifier: String(successorPnIdentifier),
        predecessorDid: typeof predecessorDid === 'string' ? predecessorDid : undefined,
        successorDid: typeof successorDid === 'string' ? successorDid : undefined,
        migrationId: typeof migrationId === 'string' ? migrationId : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
        migrateBindings: migrateBindings !== false
      });

      await appendAuditEvent({
        eventType: 'identity.succession.registered',
        actorHint: 'admin',
        subjectPnIdentifier: String(predecessorPnIdentifier),
        metadata: { successorPnIdentifier: String(successorPnIdentifier) }
      });

      return res.status(201).json({ success: true });
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      if (err.code === 'INVALID_SUCCESSION') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: err.message
        });
      }
      if ((error as { code?: string }).code === '23505') {
        return res.status(409).json({
          error: 'conflict',
          error_description: 'Succession already recorded for this predecessor'
        });
      }
      console.error('[admin] identity succession:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register succession'
      });
    }
  });

  app.get('/api/admin/audit-events', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 2000);
      const eventType = req.query.event_type ? String(req.query.event_type) : null;
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();
      const r = eventType
        ? await db.query(
            `SELECT id, event_type, actor_hint, subject_pn_identifier, metadata, created_at
             FROM audit_events WHERE event_type = $1 ORDER BY created_at DESC LIMIT $2`,
            [eventType, limit]
          )
        : await db.query(
            `SELECT id, event_type, actor_hint, subject_pn_identifier, metadata, created_at
             FROM audit_events ORDER BY created_at DESC LIMIT $1`,
            [limit]
          );
      return res.json({ events: r.rows });
    } catch (error: unknown) {
      console.error('[admin] audit-events:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list audit events'
      });
    }
  });
}
