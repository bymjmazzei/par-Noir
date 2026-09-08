/**
 * Feed preview media: presign upload, signed GET / pull-through, plan + verification status.
 */
import { Application, Request, Response } from 'express';
import {
  isFeedPreviewObjectRef,
  r2ObjectKey,
  type FeedPreviewObjectRef,
  type FeedPreviewVariant,
  validateFeedPreviewByteSize,
  PUBLISH_TIER_NOTCHES,
} from '@par-noir/aggregator-domain';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  feedR2Delete,
  feedR2Head,
  feedR2PresignedPutUrl,
  feedR2Put,
  feedR2SignedGetUrl,
  getFeedR2,
} from './feedPreviewR2';
import {
  addUploadBytes,
  checkAndConsumeFreeView,
  resolvePublishPlan,
  viewerKeyFromRequest,
} from './feedPreviewMetering';
import { fetchPublicBytesTimed, PublicBlobAccessError } from './publicBlobAccess';
import { redactFeedPreviewForClient } from './feedPreviewClientRedact';

export { redactFeedPreviewForClient };

function variantFromParam(raw: string): FeedPreviewVariant | null {
  if (raw === 'poster' || raw === 'sd' || raw === 'hd') return raw;
  return null;
}

function refForVariant(
  meta: Record<string, unknown>,
  variant: FeedPreviewVariant
): FeedPreviewObjectRef | null {
  const key =
    variant === 'poster' ? 'feedPoster' : variant === 'hd' ? 'feedPreviewHd' : 'feedPreviewSd';
  const v = meta[key];
  return isFeedPreviewObjectRef(v) ? v : null;
}

async function touchLastPlayed(
  fileId: string,
  variant: FeedPreviewVariant,
  ref: FeedPreviewObjectRef
): Promise<void> {
  if (variant === 'poster') return;
  const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
  const agg = AggregatorMetadataServiceDB.getInstance();
  const updated: FeedPreviewObjectRef = {
    ...ref,
    lastPlayedAt: new Date().toISOString(),
    r2Warm: true,
  };
  const patch =
    variant === 'hd' ? { feedPreviewHd: updated } : { feedPreviewSd: updated };
  await agg.updateMetadata(fileId, patch as any);
}

async function pullThroughToR2(
  fileId: string,
  variant: FeedPreviewVariant,
  ref: FeedPreviewObjectRef
): Promise<FeedPreviewObjectRef> {
  if (!ref.ownerPublicUrl || !ref.ownerObjectId) {
    throw new PublicBlobAccessError('canonical_preview_missing', 'NOT_FOUND', 404);
  }
  const { buffer } = await fetchPublicBytesTimed({
    backend: (ref.ownerBackend || 'google_drive') as any,
    objectId: ref.ownerObjectId,
    publicUrl: ref.ownerPublicUrl,
  });
  const key = ref.r2Key || r2ObjectKey(fileId, variant);
  await feedR2Put(key, buffer, ref.contentType || 'application/octet-stream');
  const warmed: FeedPreviewObjectRef = {
    ...ref,
    r2Key: key,
    byteSize: buffer.length,
    r2Warm: true,
    lastPlayedAt: new Date().toISOString(),
  };
  const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
  const agg = AggregatorMetadataServiceDB.getInstance();
  const patch =
    variant === 'poster'
      ? { feedPoster: warmed }
      : variant === 'hd'
        ? { feedPreviewHd: warmed }
        : { feedPreviewSd: warmed };
  await agg.updateMetadata(fileId, patch as any);
  return warmed;
}

export function registerFeedMediaRoutes(app: Application): void {
  app.get('/api/users/:pn/verification-status', async (req: Request, res: Response) => {
    try {
      const pn = decodeURIComponent(req.params.pn || '');
      if (!pn) return res.status(400).json({ error: 'pn_required' });
      const { EngagementService } = await import('./engagementService');
      const verified = await EngagementService.isIdentityVerifiedForMonetization(pn);
      const planId =
        typeof req.query.planId === 'string' ? req.query.planId : verified ? 'floor' : 'free';
      const plan = await resolvePublishPlan(pn, planId);
      return res.json({
        pnHash: hashIdentifier(pn),
        verified,
        plan: {
          ...plan,
          notches: PUBLISH_TIER_NOTCHES.map((n) => ({
            id: n.id,
            retailUsd: n.retailUsd,
            maxDurationSec: n.maxDurationSec,
            maxHeight: n.maxHeight,
            uploadBytesPerMonth: n.uploadBytesPerMonth,
            allowHd: n.allowHd,
          })),
        },
      });
    } catch (err: unknown) {
      safeLogger.warn('[verification-status] failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      return res.status(500).json({ error: 'verification_status_failed' });
    }
  });

  app.get('/api/aggregator/publish-plan', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const planId =
        typeof req.query.planId === 'string'
          ? req.query.planId
          : typeof req.headers['x-pn-publish-plan'] === 'string'
            ? req.headers['x-pn-publish-plan']
            : 'floor';
      const plan = await resolvePublishPlan(tokenPayload.pnIdentifier, planId);
      return res.json({ plan, notches: PUBLISH_TIER_NOTCHES });
    } catch (err: unknown) {
      return res.status(500).json({
        error: 'publish_plan_failed',
        message: err instanceof Error ? err.message : 'failed',
      });
    }
  });

  app.post('/api/aggregator/feed-media/presign-upload', async (req: Request, res: Response) => {
    try {
      if (!getFeedR2()) {
        return res.status(503).json({ error: 'feed_r2_not_configured' });
      }
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const fileId = String(req.body?.fileId || '');
      const variant = variantFromParam(String(req.body?.variant || ''));
      const contentType = String(req.body?.contentType || 'application/octet-stream');
      const contentLength = Number(req.body?.contentLength || 0);
      const planId = typeof req.body?.planId === 'string' ? req.body.planId : 'floor';

      if (!fileId || !variant) {
        return res.status(400).json({ error: 'fileId_and_variant_required' });
      }
      const sizeCheck = validateFeedPreviewByteSize(variant, contentLength);
      if (!sizeCheck.ok) {
        return res.status(400).json({ error: sizeCheck.error });
      }

      const plan = await resolvePublishPlan(tokenPayload.pnIdentifier, planId);
      if (variant === 'hd' && !plan.allowHd) {
        return res.status(403).json({ error: 'hd_not_allowed_on_plan', plan });
      }
      if (plan.uploadBytesUsed + contentLength > plan.uploadBytesLimit && plan.planId !== 'free') {
        // Soft degrade already reflected in allowHd/duration; still allow free-sized uploads
        if (contentLength > 4_194_304) {
          return res.status(403).json({ error: 'monthly_upload_gb_exceeded', plan });
        }
      }

      const key = r2ObjectKey(fileId, variant, String(Date.now()));
      const { url, maxBytes } = await feedR2PresignedPutUrl(key, contentType, contentLength, variant);
      return res.json({
        key,
        url,
        maxBytes,
        expiresInSec: getFeedR2()!.config.signedGetTtlSec,
        plan,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'presign_failed';
      safeLogger.warn('[feed-media/presign] failed', { message: msg });
      return res.status(400).json({ error: msg });
    }
  });

  app.post('/api/aggregator/feed-media/confirm-upload', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const fileId = String(req.body?.fileId || '');
      const variant = variantFromParam(String(req.body?.variant || ''));
      const ref = req.body?.ref as FeedPreviewObjectRef | undefined;
      if (!fileId || !variant || !isFeedPreviewObjectRef(ref)) {
        return res.status(400).json({ error: 'fileId_variant_ref_required' });
      }
      const sizeCheck = validateFeedPreviewByteSize(variant, ref.byteSize);
      if (!sizeCheck.ok) {
        return res.status(400).json({ error: sizeCheck.error });
      }
      if (ref.r2Key) {
        const head = await feedR2Head(ref.r2Key);
        if (!head) {
          return res.status(400).json({ error: 'r2_object_missing' });
        }
      }
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const agg = AggregatorMetadataServiceDB.getInstance();
      const existing = await agg.getFileMetadata(fileId);
      const patch =
        variant === 'poster'
          ? { feedPoster: { ...ref, r2Warm: true } }
          : variant === 'hd'
            ? { feedPreviewHd: { ...ref, r2Warm: true } }
            : { feedPreviewSd: { ...ref, r2Warm: true } };
      if (!existing) {
        // Row created by subsequent metadata PUT which must include these refs.
        const used = await addUploadBytes(tokenPayload.pnIdentifier, ref.byteSize);
        return res.json({
          success: true,
          pendingRow: true,
          uploadBytesUsed: used,
          ref: redactFeedPreviewForClient({ ...ref, r2Warm: true }),
        });
      }
      await agg.updateMetadata(fileId, patch as any);
      const used = await addUploadBytes(tokenPayload.pnIdentifier, ref.byteSize);
      return res.json({
        success: true,
        uploadBytesUsed: used,
        ref: redactFeedPreviewForClient({ ...ref, r2Warm: true }),
      });
    } catch (err: unknown) {
      safeLogger.warn('[feed-media/confirm] failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      return res.status(500).json({ error: 'confirm_failed' });
    }
  });

  app.get('/api/aggregator/public-media/:fileId', async (req: Request, res: Response) => {
    try {
      if (!getFeedR2()) {
        return res.status(503).json({ error: 'feed_r2_not_configured' });
      }
      const fileId = req.params.fileId;
      const variant = variantFromParam(String(req.query.variant || 'sd'));
      if (!fileId || !variant) {
        return res.status(400).json({ error: 'fileId_and_variant_required' });
      }

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const entry = await AggregatorMetadataServiceDB.getInstance().getFileMetadata(fileId);
      if (!entry?.metadata) {
        return res.status(404).json({ error: 'not_found' });
      }
      const meta = entry.metadata as unknown as Record<string, unknown>;
      if (meta.isPublic !== true && meta.isPublic !== 'true') {
        return res.status(404).json({ error: 'not_public' });
      }

      let ref = refForVariant(meta, variant);
      if (!ref && variant === 'hd') {
        ref = refForVariant(meta, 'sd');
      }
      if (!ref) {
        return res.status(404).json({ error: 'preview_missing' });
      }

      let viewerPn: string | null = null;
      try {
        const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
        viewerPn = getBearerTokenPayload(req)?.pnIdentifier || null;
      } catch {
        viewerPn = null;
      }

      let viewerVerified = false;
      if (viewerPn) {
        const { EngagementService } = await import('./engagementService');
        viewerVerified = await EngagementService.isIdentityVerifiedForMonetization(viewerPn);
      }

      if (variant === 'hd' && !viewerVerified) {
        const sd = refForVariant(meta, 'sd');
        if (sd) ref = sd;
        else {
          return res.status(403).json({ error: 'hd_requires_verification' });
        }
      }

      if (!viewerVerified) {
        const anon =
          typeof req.headers['x-pn-anon-id'] === 'string' ? req.headers['x-pn-anon-id'] : null;
        const gate = await checkAndConsumeFreeView(
          viewerKeyFromRequest(viewerPn, anon),
          ref.byteSize
        );
        if (!gate.ok) {
          return res.status(429).json({
            error: gate.reason,
            startsUsed: gate.startsUsed,
            mbUsed: gate.mbUsed,
          });
        }
      }

      const warmKey = ref.r2Key;
      const warm =
        warmKey && ref.r2Warm !== false ? await feedR2Head(warmKey) : null;

      if (!warm || !warmKey) {
        if (variant === 'poster') {
          return res.status(404).json({ error: 'poster_cold_unexpected' });
        }
        try {
          ref = await pullThroughToR2(fileId, variant === 'hd' && ref === refForVariant(meta, 'hd') ? 'hd' : 'sd', ref);
        } catch (err: unknown) {
          if (err instanceof PublicBlobAccessError) {
            return res.status(err.httpStatus).json({ error: err.code.toLowerCase() });
          }
          throw err;
        }
      } else {
        await touchLastPlayed(fileId, variant, ref).catch(() => undefined);
      }

      const key = ref.r2Key!;
      const url = await feedR2SignedGetUrl(key);
      return res.redirect(302, url);
    } catch (err: unknown) {
      safeLogger.warn('[public-media] failed', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      return res.status(500).json({ error: 'public_media_failed' });
    }
  });

  app.post('/api/aggregator/feed-media/:fileId/revoke', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const fileId = req.params.fileId;
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const agg = AggregatorMetadataServiceDB.getInstance();
      const entry = await agg.getFileMetadata(fileId);
      if (!entry) return res.status(404).json({ error: 'not_found' });
      if (entry.pnIdentifier && entry.pnIdentifier !== tokenPayload.pnIdentifier) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const meta = entry.metadata as unknown as Record<string, unknown>;
      for (const key of ['feedPoster', 'feedPreviewSd', 'feedPreviewHd'] as const) {
        const ref = meta[key];
        if (isFeedPreviewObjectRef(ref) && ref.r2Key) {
          await feedR2Delete(ref.r2Key).catch(() => undefined);
        }
      }
      await agg.updateMetadata(fileId, {
        feedPoster: null,
        feedPreviewSd: null,
        feedPreviewHd: null,
      } as any);
      return res.json({ success: true });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'revoke_failed' });
    }
  });
}
