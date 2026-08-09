/**
 * Blind public ciphertext proxy + owner ensure/revoke for public-link feed model.
 * fetch path never resolves peer Drive tokens.
 */
import { Request, Response, Application } from 'express';
import {
  isPublicContentRef,
  publicTokenContainsEmbeddedCiphertext,
  type PublicContentRef,
} from '@par-noir/aggregator-domain';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  ensureDrivePublicReadable,
  ensurePortablePublicReadable,
  fetchPublicBytes,
  PublicBlobAccessError,
  revokeDrivePublicReadable,
} from './publicBlobAccess';

const PURGE_COOLDOWN_MS = 60_000;
const recentPurges = new Map<string, number>();

function clientError(err: unknown): string {
  if (err instanceof PublicBlobAccessError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

export function registerPublicContentRoutes(app: Application): void {
  /**
   * Owner-only: mark a cloud object anyone-readable and return publicContentRef.
   * Uses resolveOwnerDriveToken for the authenticated caller only.
   */
  app.post('/api/aggregator/public-content/:objectId/ensure-public', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer required' });
      }

      const objectId = req.params.objectId;
      const backend = String(req.body?.backend || req.query.backend || 'google_drive');
      const publicUrlHint = typeof req.body?.publicUrl === 'string' ? req.body.publicUrl : undefined;

      if (backend === 'google_drive') {
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let accessToken: string;
        try {
          const resolved = await resolveOwnerDriveToken(req, tokenPayload.pnIdentifier);
          accessToken =
            resolved.token.access_token ||
            (resolved.token as { accessToken?: string }).accessToken ||
            '';
          if (!accessToken) {
            return res.status(409).json({
              error: 'cloud_token_required',
              error_description: 'Resolved Drive token missing access_token',
            });
          }
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        const ref = await ensureDrivePublicReadable(accessToken, objectId);
        return res.json({ success: true, publicContentRef: ref });
      }

      const ref = await ensurePortablePublicReadable(backend, objectId, publicUrlHint);
      return res.json({ success: true, publicContentRef: ref });
    } catch (error: unknown) {
      if (error instanceof PublicBlobAccessError) {
        safeLogger.warn('[ensure-public] failed', { code: error.code, status: error.httpStatus });
        return res.status(error.httpStatus).json({ error: error.code.toLowerCase(), error_description: error.message });
      }
      safeLogger.warn('[ensure-public] unexpected', { message: clientError(error) });
      return res.status(500).json({ error: 'ensure_public_failed', error_description: clientError(error) });
    }
  });

  /**
   * Owner-only: revoke anyone permission (Drive) or acknowledge portable revoke via body.
   */
  app.post('/api/aggregator/public-content/:objectId/revoke-public', async (req: Request, res: Response) => {
    try {
      const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer required' });
      }

      const objectId = req.params.objectId;
      const backend = String(req.body?.backend || req.query.backend || 'google_drive');

      if (backend === 'google_drive') {
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        let accessToken: string;
        try {
          const resolved = await resolveOwnerDriveToken(req, tokenPayload.pnIdentifier);
          accessToken =
            resolved.token.access_token ||
            (resolved.token as { accessToken?: string }).accessToken ||
            '';
          if (!accessToken) {
            return res.status(409).json({
              error: 'cloud_token_required',
              error_description: 'Resolved Drive token missing access_token',
            });
          }
        } catch (e) {
          if (respondDriveTokenError(res, e)) return;
          throw e;
        }
        await revokeDrivePublicReadable(accessToken, objectId);
        return res.json({ success: true });
      }

      // Portable: caller must have revoked provider-side; API has nothing to revoke without owner URL ACLs.
      return res.json({ success: true, note: 'portable_revoke_client_side' });
    } catch (error: unknown) {
      if (error instanceof PublicBlobAccessError) {
        return res.status(error.httpStatus).json({ error: error.code.toLowerCase(), error_description: error.message });
      }
      return res.status(500).json({ error: 'revoke_public_failed', error_description: clientError(error) });
    }
  });

  /**
   * Blind proxy: stream public ciphertext. No owner / peer OAuth.
   * Confirmed 404/410 → attested aggregator purge.
   */
  app.get('/api/aggregator/public-content/:fileId', async (req: Request, res: Response) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId) {
        return res.status(400).json({ error: 'missing_file_id' });
      }

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      const entry = await service.getFileMetadata(fileId);
      if (!entry?.metadata) {
        return res.status(404).json({ error: 'not_found', error_description: 'Not in public index' });
      }

      const meta = entry.metadata as {
        isPublic?: boolean;
        publicContentRef?: PublicContentRef;
        publicToken?: unknown;
      };

      if (meta.isPublic !== true) {
        return res.status(403).json({ error: 'forbidden', error_description: 'Not public' });
      }

      if (publicTokenContainsEmbeddedCiphertext(meta.publicToken)) {
        safeLogger.warn('[public-content] Rejecting legacy embedded publicToken row', {
          fileHash: hashIdentifier(fileId),
        });
        return res.status(409).json({
          error: 'legacy_embedded_token',
          error_description: 'Re-publish required: API must not hold ciphertext',
        });
      }

      const ref = meta.publicContentRef;
      if (!isPublicContentRef(ref)) {
        safeLogger.warn('[public-content] Missing publicContentRef', {
          fileHash: hashIdentifier(fileId),
        });
        return res.status(409).json({
          error: 'missing_public_content_ref',
          error_description: 'Public row missing publicContentRef',
        });
      }

      let buffer: Buffer;
      try {
        buffer = await fetchPublicBytes(ref);
      } catch (error: unknown) {
        if (error instanceof PublicBlobAccessError && error.code === 'NOT_FOUND') {
          const now = Date.now();
          const last = recentPurges.get(fileId) || 0;
          if (now - last > PURGE_COOLDOWN_MS) {
            recentPurges.set(fileId, now);
            try {
              await service.removeMetadata(fileId);
              const { invalidateIndexCache } = await import('../utils/cache');
              await invalidateIndexCache();
              safeLogger.info('[public-content] Purged dead public row after 404', {
                fileHash: hashIdentifier(fileId),
              });
            } catch (purgeErr: unknown) {
              safeLogger.warn('[public-content] Purge failed', {
                message: clientError(purgeErr),
                fileHash: hashIdentifier(fileId),
              });
            }
          }
          return res.status(404).json({ error: 'not_found', error_description: 'Public content missing; cache purged' });
        }
        if (error instanceof PublicBlobAccessError) {
          return res.status(error.httpStatus).json({
            error: error.code.toLowerCase(),
            error_description: error.message,
          });
        }
        throw error;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.setHeader('X-PN-Public-Content', '1');
      return res.send(buffer);
    } catch (error: unknown) {
      safeLogger.warn('[public-content] proxy failed', { message: clientError(error) });
      return res.status(500).json({ error: 'proxy_failed', error_description: clientError(error) });
    }
  });
}
