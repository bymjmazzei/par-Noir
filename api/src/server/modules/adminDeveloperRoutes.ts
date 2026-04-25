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
import { securityFlags, isProduction } from '../utils/securityFlags';
import { appendSecurityAuditEvent } from './auditService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_KEY?.trim();
  const allowedPrincipals = (process.env.ADMIN_ALLOWED_PRINCIPALS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const assertedPrincipal =
    (req.headers['x-admin-principal'] as string) ||
    (req.headers['x-goog-authenticated-user-email'] as string) ||
    '';

  if (securityFlags.enableAdminIdentityHeaders && assertedPrincipal && allowedPrincipals.includes(assertedPrincipal)) {
    return next();
  }

  if (!expected) {
    if (NODE_ENV === 'production' || securityFlags.disableLegacyAdminApiKey) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Admin operations are not configured'
      });
      return;
    }
    if (!securityFlags.allowUnsafeDevAdminBypass) {
      res.status(503).json({
        error: 'service_unavailable',
        error_description: 'Admin bypass disabled; set ALLOW_UNSAFE_DEV_ADMIN_BYPASS=true for local dev only',
      });
      return;
    }
    safeLogger.warn('[admin] ADMIN_API_KEY unset — allowing admin route in non-production due to explicit bypass flag');
    next();
    return;
  }

  let provided = (req.headers['x-admin-key'] as string) || '';
  const auth = req.headers.authorization;
  if (!provided && auth?.startsWith('Bearer ')) {
    provided = auth.slice(7).trim();
  }

  if (provided !== expected) {
    void appendSecurityAuditEvent({
      eventType: 'admin.auth.failed',
      severity: isProduction() ? 'high' : 'medium',
      actorHint: 'admin',
      metadata: {
        principalHash: hashIdentifier(assertedPrincipal || 'missing'),
        source: securityFlags.enableAdminIdentityHeaders ? 'identity_headers_or_legacy' : 'legacy_admin_key',
      },
    });
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

  app.get('/api/admin/social/metrics', requireAdminApiKey, async (_req: Request, res: Response) => {
    try {
      const { getDatabasePool } = await import('../utils/database');
      const db = getDatabasePool();

      const [usersRes, postsRes, engagementRes] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*)::bigint AS total_users,
            (
              SELECT COUNT(*)::bigint
              FROM user_profiles up
              WHERE EXISTS (
                SELECT 1
                FROM verified_identities vi
                WHERE vi.identity_id = up.pn_identifier
                  AND vi.is_active = TRUE
              )
            ) AS verified_users
          FROM user_profiles
        `),
        db.query(`
          SELECT
            COUNT(*)::bigint AS total_posts,
            COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(content), ''), '') <> '')::bigint AS text_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(media) = 'array' THEN jsonb_array_length(media) ELSE 0 END > 0
            )::bigint AS media_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(polls) = 'array' THEN jsonb_array_length(polls) ELSE 0 END > 0
            )::bigint AS poll_posts,
            COUNT(*) FILTER (
              WHERE CASE WHEN jsonb_typeof(forms) = 'array' THEN jsonb_array_length(forms) ELSE 0 END > 0
            )::bigint AS form_posts,
            COUNT(*) FILTER (WHERE is_top_post = TRUE)::bigint AS top_posts,
            COUNT(*) FILTER (WHERE file_id IS NOT NULL)::bigint AS file_linked_posts
          FROM feed_posts
        `),
        db.query(`
          SELECT
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'views')::bigint, 0)), 0)::bigint AS total_views,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'likes')::bigint, 0)), 0)::bigint AS total_likes,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'comments')::bigint, 0)), 0)::bigint AS total_comments,
            COALESCE(SUM(COALESCE((metadata->'engagement'->>'shares')::bigint, 0)), 0)::bigint AS total_shares
          FROM (
            SELECT metadata FROM aggregator_media
            UNION ALL
            SELECT metadata FROM aggregator_thoughts
            UNION ALL
            SELECT metadata FROM aggregator_collections
          ) AS all_content
        `),
      ]);

      const usersRow = usersRes.rows[0] || {};
      const postsRow = postsRes.rows[0] || {};
      const engagementRow = engagementRes.rows[0] || {};

      const totalUsers = Number(usersRow.total_users ?? 0);
      const verifiedUsers = Number(usersRow.verified_users ?? 0);
      const unverifiedUsers = Math.max(0, totalUsers - verifiedUsers);

      return res.json({
        generatedAt: new Date().toISOString(),
        totals: {
          users: {
            total: totalUsers,
            verified: verifiedUsers,
            unverified: unverifiedUsers,
          },
          posts: {
            total: Number(postsRow.total_posts ?? 0),
            byType: {
              text: Number(postsRow.text_posts ?? 0),
              media: Number(postsRow.media_posts ?? 0),
              poll: Number(postsRow.poll_posts ?? 0),
              form: Number(postsRow.form_posts ?? 0),
              top: Number(postsRow.top_posts ?? 0),
              fileLinked: Number(postsRow.file_linked_posts ?? 0),
            },
          },
          engagement: {
            views: Number(engagementRow.total_views ?? 0),
            likes: Number(engagementRow.total_likes ?? 0),
            comments: Number(engagementRow.total_comments ?? 0),
            shares: Number(engagementRow.total_shares ?? 0),
          },
        },
      });
    } catch (error: unknown) {
      console.error('[admin] social metrics:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description:
          safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to load social metrics',
      });
    }
  });
}
