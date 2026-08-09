/**
 * Opaque social mailbox HTTP routes (throughway keyed by route_key).
 */

import type { Application, Request, Response } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import {
  gateOwnerRoute,
  assertDeviceCapability,
  getBearerPnIdentifier,
  normalizePnIdentifier,
  DEVICE_CAPABILITIES
} from './deviceCapabilityService';
import {
  ackMailboxJobs,
  enqueueSocialMailboxJob,
  isDeviceCloudCustodyEnabled,
  isMailboxRouteKey,
  legacyRouteKeyForIdentity,
  listPendingMailboxJobs,
  lookupMailboxJob,
  ownsMailboxRoute,
  registerMailboxRoute,
  type SocialMailboxJobType
} from './socialMailboxService';
import { safeClientErrorMessage } from '../utils/safeError';
import { hashIdentifier, safeLogger } from '../../utils/logger';

/** DM traffic. Gated by messages.read / messages.send. */
const MESSAGING_JOB_TYPES: SocialMailboxJobType[] = [
  'message_append',
  'message_attachment',
  'notification_row'
];

/**
 * Connections, follows, and group delivery. Gated separately so a device
 * granted messaging cannot silently also send connection requests, and a
 * device denied messaging can still accept a connection.
 */
const SOCIAL_JOB_TYPES: SocialMailboxJobType[] = [
  'connection_request',
  'connection_accept',
  'connection_reject',
  'connection_delete',
  'follower_add',
  'follower_remove',
  'group_message_append',
  'group_inbox_update',
  'message_request'
];

const JOB_TYPES: SocialMailboxJobType[] = [...MESSAGING_JOB_TYPES, ...SOCIAL_JOB_TYPES];

function isSocialJobType(jobType: SocialMailboxJobType): boolean {
  return SOCIAL_JOB_TYPES.includes(jobType);
}

function resolveRouteKey(explicit: unknown, identityId: string | undefined): string | null {
  if (isMailboxRouteKey(explicit)) return String(explicit).trim();
  if (identityId && typeof identityId === 'string' && identityId.startsWith('pn-')) {
    return legacyRouteKeyForIdentity(identityId);
  }
  return null;
}

/**
 * Which job types this device may drain. Empty means it may read nothing, which
 * the caller turns into a 403 rather than an empty list — an empty list would
 * look like "delivered nothing" instead of "not allowed".
 */
async function readableJobTypes(req: Request): Promise<SocialMailboxJobType[]> {
  const allowed: SocialMailboxJobType[] = [];
  if ((await assertDeviceCapability(req, DEVICE_CAPABILITIES.messagesRead)).ok) {
    allowed.push(...MESSAGING_JOB_TYPES);
  }
  if ((await assertDeviceCapability(req, DEVICE_CAPABILITIES.socialRead)).ok) {
    allowed.push(...SOCIAL_JOB_TYPES);
  }
  return allowed;
}

/**
 * Bearer must be the pn it claims, and must hold at least one read capability.
 * Returns the job types it may see.
 */
async function gateMailboxRead(
  req: Request,
  res: Response,
  pnIdentifier: string
): Promise<SocialMailboxJobType[] | null> {
  const bearer = getBearerPnIdentifier(req);
  if (!bearer) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  if (bearer !== normalizePnIdentifier(pnIdentifier)) {
    safeLogger.warn('[mailbox] Bearer pN does not match requested pN', {
      routePn: hashIdentifier(normalizePnIdentifier(pnIdentifier)),
      bearerPn: hashIdentifier(bearer)
    });
    res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
    return null;
  }
  const allowed = await readableJobTypes(req);
  if (allowed.length === 0) {
    res.status(403).json({ error: 'capability_not_allowed', reason: 'no_mailbox_read' });
    return null;
  }
  return allowed;
}

/**
 * A route key is handed to every peer you connect with, so holding one proves
 * nothing. Without this check an authenticated peer can drain your mailbox.
 */
async function gateRouteOwnership(
  res: Response,
  routeKey: string,
  pnIdentifier: string
): Promise<boolean> {
  if (await ownsMailboxRoute(routeKey, pnIdentifier)) return true;
  safeLogger.warn('[mailbox] Caller does not own the requested route', {
    reason: 'route_not_owned',
    bearerPn: hashIdentifier(pnIdentifier)
  });
  res.status(403).json({ error: 'forbidden', reason: 'route_not_owned' });
  return false;
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
      const allowedTypes = await gateMailboxRead(req, res, pnIdentifier);
      if (!allowedTypes) return;

      const routeKey = resolveRouteKey(routeKeyParam, pnIdentifier);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey required' });
      }
      if (!(await gateRouteOwnership(res, routeKey, pnIdentifier))) return;

      const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
      const jobs = await listPendingMailboxJobs(routeKey, limit, allowedTypes);
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
      const allowedTypes = await gateMailboxRead(req, res, identity);
      if (!allowedTypes) return;
      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: 'jobIds array required' });
      }
      const routeKey = resolveRouteKey(bodyRouteKey, identity);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey required' });
      }
      if (!(await gateRouteOwnership(res, routeKey, identity))) return;
      const ids = jobIds.filter((id: unknown) => typeof id === 'string') as string[];
      const acked = await ackMailboxJobs(routeKey, ids, allowedTypes);
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
      if (!JOB_TYPES.includes(jobType)) {
        return res.status(400).json({ error: 'invalid jobType' });
      }
      const sendCapability = isSocialJobType(jobType)
        ? DEVICE_CAPABILITIES.socialWrite
        : DEVICE_CAPABILITIES.messagesSend;
      if (!(await gateOwnerRoute(req, res, sendCapability, actor))) {
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
      const requestId =
        typeof req.query.requestId === 'string' ? req.query.requestId : undefined;

      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!JOB_TYPES.includes(jobType)) {
        return res.status(400).json({ error: 'routeKey and jobType required' });
      }
      // The sender looks up the recipient's route to see whether their own
      // fan-out landed, so route ownership does not apply here. Only existence
      // and ack state are returned, never the payload.
      const lookupCapability = isSocialJobType(jobType)
        ? DEVICE_CAPABILITIES.socialWrite
        : DEVICE_CAPABILITIES.messagesSend;
      if (!(await gateOwnerRoute(req, res, lookupCapability, pnIdentifier))) {
        return;
      }
      const routeKey =
        resolveRouteKey(routeKeyParam, undefined) ||
        (recipientIdentityId.startsWith('pn-')
          ? legacyRouteKeyForIdentity(recipientIdentityId)
          : null);
      if (!routeKey) {
        return res.status(400).json({ error: 'routeKey and jobType required' });
      }

      const job = await lookupMailboxJob({
        routeKey,
        jobType,
        messageId,
        commentId,
        requestId
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

  /**
   * Claim a freshly minted route before handing it to any peer. First claim
   * wins, and a route is 32 random bytes, so only its minter can get there
   * first. Without a claim the route cannot be drained at all.
   */
  app.post('/api/mailbox/route', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      const { pnIdentifier, routeKey } = req.body || {};
      const identity = pnIdentifier || tokenPayload?.pnIdentifier;
      if (!identity) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.messagesRead, identity))) {
        return;
      }
      if (!isMailboxRouteKey(routeKey)) {
        return res.status(400).json({ error: 'routeKey required' });
      }
      const claimed = await registerMailboxRoute(String(routeKey).trim(), identity);
      if (!claimed) {
        safeLogger.warn('[mailbox] Route already claimed by another identity', {
          reason: 'route_already_claimed',
          bearerPn: hashIdentifier(normalizePnIdentifier(identity))
        });
        return res.status(409).json({ error: 'route_already_claimed' });
      }
      return res.json({ success: true });
    } catch (error: unknown) {
      safeLogger.error('mailbox_route_claim_failed', {
        err: error instanceof Error ? error.message : 'error'
      });
      return res.status(500).json({
        error: 'Failed to claim mailbox route',
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
