/**
 * Opaque social mailbox HTTP routes (throughway keyed by route_key).
 */

import type { Application, Request, Response } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import {
  ackMailboxJobs,
  enqueueSocialMailboxJob,
  isDeviceCloudCustodyEnabled,
  isMailboxRouteKey,
  legacyRouteKeyForIdentity,
  listPendingMailboxJobs,
  lookupMailboxJob,
  type SocialMailboxJobType
} from './socialMailboxService';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, safeLogger } from '../../utils/logger';

const JOB_TYPES: SocialMailboxJobType[] = [
  'message_append',
  'message_attachment',
  'notification_row'
];

function resolveRouteKey(explicit: unknown, identityId: string | undefined): string | null {
  if (isMailboxRouteKey(explicit)) return String(explicit).trim();
  if (identityId && typeof identityId === 'string' && identityId.startsWith('pn-')) {
    return legacyRouteKeyForIdentity(identityId);
  }
  return null;
}

export function registerMailboxRoutes(app: Application, nodeEnv: string): void {
  app.get('/api/mailbox/pending', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      const pnIdentifier =
        (typeof req.query.pnIdentifier === 'string' && req.query.pnIdentifier) ||
        tokenPayload?.pnIdentifier;
      const routeKeyParam =
        typeof req.query.routeKey === 'string' ? req.query.routeKey : undefined;
      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, pnIdentifier))) {
        return;
      }

      const routeKey = resolveRouteKey(routeKeyParam, pnIdentifier);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey required' });
      }

      const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
      const jobs = await listPendingMailboxJobs(routeKey, limit);
      return res.json({
        success: true,
        deviceCloudCustody: isDeviceCloudCustodyEnabled(),
        model: 'opaque_route_throughway',
        jobs: jobs.map((j) => ({
          id: j.id,
          routeKey: j.routeKey,
          jobType: j.jobType,
          payload: j.payload,
          createdAt: j.createdAt,
          expiresAt: j.expiresAt
        }))
      });
    } catch (error: unknown) {
      safeLogger.error('mailbox_pending_failed', {
        err: error instanceof Error ? error.message : 'error'
      });
      return res.status(500).json({
        error: 'Failed to list mailbox jobs',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/mailbox/ack', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier, jobIds, routeKey: bodyRouteKey } = req.body || {};
      const tokenPayload = getBearerTokenPayload(req);
      const identity = pnIdentifier || tokenPayload?.pnIdentifier;
      if (!identity) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, identity))) {
        return;
      }
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: 'jobIds array required' });
      }
      const routeKey = resolveRouteKey(bodyRouteKey, identity);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey required' });
      }
      const ids = jobIds.filter((id: unknown) => typeof id === 'string') as string[];
      const acked = await ackMailboxJobs(routeKey, ids);
      return res.json({ success: true, acked });
    } catch (error: unknown) {
      safeLogger.error('mailbox_ack_failed', {
        err: error instanceof Error ? error.message : 'error'
      });
      return res.status(500).json({
        error: 'Failed to ack mailbox jobs',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  /** Idempotent fan-out from sender outbox reconcile. */
  app.post('/api/mailbox/enqueue', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      const {
        pnIdentifier,
        routeKey: bodyRouteKey,
        recipientIdentityId,
        jobType,
        payload
      } = req.body || {};
      const actor = pnIdentifier || tokenPayload?.pnIdentifier;
      if (!actor) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesSend, actor))) {
        return;
      }
      const routeKey =
        resolveRouteKey(bodyRouteKey, undefined) ||
        (typeof recipientIdentityId === 'string' && recipientIdentityId.startsWith('pn-')
          ? legacyRouteKeyForIdentity(recipientIdentityId)
          : null);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey required' });
      }
      if (!JOB_TYPES.includes(jobType)) {
        return res.status(400).json({ error: 'invalid jobType' });
      }
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'payload object required' });
      }

      const job = await enqueueSocialMailboxJob({
        routeKey,
        jobType,
        payload: payload as Record<string, unknown>
      });
      return res.json({
        success: true,
        created: job.created,
        job: {
          id: job.id,
          jobType: job.jobType,
          createdAt: job.createdAt,
          expiresAt: job.expiresAt,
          ackedAt: job.ackedAt
        }
      });
    } catch (error: unknown) {
      safeLogger.error('mailbox_enqueue_failed', {
        actor: hashIdentifier(
          String((req.body || {}).pnIdentifier || getBearerTokenPayload(req)?.pnIdentifier || '')
        ),
        err: error instanceof Error ? error.message : 'error'
      });
      return res.status(500).json({
        error: 'Failed to enqueue mailbox job',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/mailbox/lookup', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      const pnIdentifier =
        (typeof req.query.pnIdentifier === 'string' && req.query.pnIdentifier) ||
        tokenPayload?.pnIdentifier;
      const routeKeyParam =
        typeof req.query.routeKey === 'string' ? req.query.routeKey : undefined;
      const recipientIdentityId =
        typeof req.query.recipientIdentityId === 'string'
          ? req.query.recipientIdentityId
          : '';
      const jobType = req.query.jobType as SocialMailboxJobType;
      const messageId =
        typeof req.query.messageId === 'string' ? req.query.messageId : undefined;
      const commentId =
        typeof req.query.commentId === 'string' ? req.query.commentId : undefined;

      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, pnIdentifier))) {
        return;
      }
      const routeKey =
        resolveRouteKey(routeKeyParam, undefined) ||
        (recipientIdentityId.startsWith('pn-')
          ? legacyRouteKeyForIdentity(recipientIdentityId)
          : null);
      if (!routeKey || !JOB_TYPES.includes(jobType)) {
        return res.status(400).json({ error: 'routeKey and jobType required' });
      }

      const job = await lookupMailboxJob({
        routeKey,
        jobType,
        messageId,
        commentId
      });
      return res.json({
        success: true,
        found: !!job,
        pending: !!(job && !job.ackedAt),
        job: job
          ? {
              id: job.id,
              jobType: job.jobType,
              ackedAt: job.ackedAt,
              createdAt: job.createdAt,
              expiresAt: job.expiresAt
            }
          : null
      });
    } catch (error: unknown) {
      safeLogger.error('mailbox_lookup_failed', {
        err: error instanceof Error ? error.message : 'error'
      });
      return res.status(500).json({
        error: 'Failed to lookup mailbox job',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/mailbox/status', async (_req: Request, res: Response) => {
    return res.json({
      success: true,
      deviceCloudCustody: isDeviceCloudCustodyEnabled(),
      model: 'opaque_route_throughway'
    });
  });
}
