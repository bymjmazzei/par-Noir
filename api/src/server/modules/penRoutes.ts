/**
 * Pen first-party routes: apply-inbound receipts for device-written docs,
 * stickers, templates, and doc invites. Chain timestamps use /api/timestamp.
 */

import type { Application, Request, Response } from 'express';
import {
  gateFirstPartyOwnerRoute,
  requireFirstPartyOAuthClient,
  DEVICE_CAPABILITIES
} from './deviceCapabilityService';
import { safeClientErrorMessage } from '../utils/safeError';
import { safeLogger } from '../../utils/logger';
import { setupWidgetRoutes } from './widgetRoutes';

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const PEN_JOB_TYPES = [
  'pen.section_promote',
  'pen.comment',
  'pen.suggestion',
  'pen.draft_upsert',
  'pen.publish',
  'pen.doc_bootstrap',
  'pen.doc_delete',
  'pen.doc_meta',
  'pen.font_upsert',
  'pen.poll_create',
  'pen.poll_structure_put',
  'pen.poll_vote',
  'pen.widget_action'
] as const;

export function setupPenRoutes(app: Application): void {
  setupWidgetRoutes(app);

  /**
   * POST /api/pen/apply-inbound
   * Record a pen.* job the owner's device already wrote to its own cloud.
   */
  app.post('/api/pen/apply-inbound', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const pnForGate = String(req.body?.userPnIdentifier || '').trim() || undefined;
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnForGate))) {
        return;
      }

      const jobType = String(req.body?.jobType || '').trim();
      const userPnIdentifier = String(req.body?.userPnIdentifier || '').trim();
      const docId = String(req.body?.docId || '').trim();

      if (!userPnIdentifier || !docId || !(PEN_JOB_TYPES as readonly string[]).includes(jobType)) {
        return res.status(400).json({
          error:
            'userPnIdentifier, docId, and jobType=pen.doc_bootstrap|pen.draft_upsert|pen.publish|pen.comment|pen.suggestion|pen.section_promote|pen.doc_delete|pen.doc_meta|pen.font_upsert|pen.poll_create|pen.poll_structure_put|pen.poll_vote|pen.widget_action required'
        });
      }

      const { readDeviceCloudResult, respondCloudOnDevice } = await import('./deviceCloudResult');
      const submitted = readDeviceCloudResult(req.body);
      if (!submitted) {
        respondCloudOnDevice(res);
        return;
      }
      return res.json({ success: true, jobType, docId, ...submitted });

    } catch (e) {
      safeLogger.warn('[pen/apply-inbound] failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  /** Load one doc tree (manifest + current sections + drafts metadata). */
  app.get('/api/pen/stickers/search', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const key = process.env.GIPHY_API_KEY?.trim();
      if (!key) return res.status(503).json({ error: 'giphy_unconfigured' });
      const q = String(req.query.q || '').trim().slice(0, 50);
      const endpoint = q
        ? `https://api.giphy.com/v1/stickers/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/stickers/trending?api_key=${encodeURIComponent(key)}&limit=20&rating=g`;
      const upstream = await fetch(endpoint);
      if (!upstream.ok) return res.status(502).json({ error: 'giphy_failed' });
      const body = (await upstream.json()) as {
        data?: Array<{ id?: string; title?: string; images?: Record<string, { url?: string }> }>;
      };
      const results = (body.data || [])
        .map((row) => {
          const raw = row.images?.fixed_height?.url || row.images?.original?.url || '';
          let url = '';
          try {
            const parsed = new URL(raw);
            if (
              parsed.protocol === 'https:' &&
              (parsed.hostname === 'giphy.com' || parsed.hostname.endsWith('.giphy.com'))
            ) {
              url = parsed.toString();
            }
          } catch {
            url = '';
          }
          if (!url) return null;
          return { id: String(row.id || url), title: String(row.title || 'Sticker'), url };
        })
        .filter((row): row is { id: string; title: string; url: string } => Boolean(row));
      return res.json({ results });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.get('/api/pen/templates', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const { listStarterTemplates, listClasses } = await import('@par-noir/pen-protocol');
      return res.json({
        classes: listClasses(),
        templates: listStarterTemplates()
      });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.post('/api/pen/docs/:docId/invites', async (req: Request, res: Response) => {
    try {
      const payload = requireFirstPartyOAuthClient(req, res);
      if (!payload) return;
      const ownerPn = String(payload.pnIdentifier || '').trim();
      const docId = String(req.params.docId || '').trim();
      const groupId = String(req.body?.groupId || '').trim();
      const role = String(req.body?.role || 'viewer').trim() as 'collaborator' | 'commentor' | 'viewer';
      const title = String(req.body?.title || '').trim();
      const expiresInDays =
        req.body?.expiresInDays != null ? Number(req.body.expiresInDays) : undefined;
      if (!docId || !groupId) {
        return res.status(400).json({ error: 'docId and groupId required' });
      }
      if (!['collaborator', 'commentor', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'invalid_role' });
      }
      const { createPenDocInvite } = await import('./penDocInviteService');
      const created = await createPenDocInvite({
        ownerPn,
        docId,
        groupId,
        title,
        role,
        expiresInDays
      });
      return res.json(created);
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.get('/api/pen/invites/:inviteId', async (req: Request, res: Response) => {
    try {
      const inviteId = String(req.params.inviteId || '').trim();
      const { getPenDocInvitePublic } = await import('./penDocInviteService');
      const invite = await getPenDocInvitePublic(inviteId);
      if (!invite) {
        return res.status(404).json({ error: 'invite_not_found' });
      }
      return res.json({
        docId: invite.docId,
        title: invite.title,
        role: invite.role,
        ownerPn: invite.ownerPn,
        expiresAt: invite.expiresAt,
        claimed: Boolean(invite.claimedBy)
      });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });

  app.post('/api/pen/invites/:inviteId/claim', async (req: Request, res: Response) => {
    try {
      const payload = requireFirstPartyOAuthClient(req, res);
      if (!payload) return;
      const inviteePn = String(payload.pnIdentifier || '').trim();
      const inviteId = String(req.params.inviteId || '').trim();
      const inviteeMlKemPublicKey = String(req.body?.inviteeMlKemPublicKey || '').trim();
      if (!inviteeMlKemPublicKey) {
        return res.status(400).json({
          error: 'messaging_keys_required',
          error_description:
            'Messaging keys unavailable. Lock and unlock your pN before accepting a doc invite.'
        });
      }
      const { claimPenDocInvite } = await import('./penDocInviteService');
      const result = await claimPenDocInvite({
        inviteId,
        inviteePn,
        inviteeMlKemPublicKey
      });
      return res.json({ success: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'claim_failed';
      const status =
        msg === 'invite_not_found'
          ? 404
          : msg === 'invite_expired' || msg === 'invite_already_claimed' || msg === 'cannot_claim_own_doc'
            ? 400
            : 500;
      return res.status(status).json({ error: msg });
    }
  });

  /** Verified author for public templates + monetized licensing (active `verified_identities` row). */
  app.get('/api/pen/author-verification', async (req: Request, res: Response) => {
    try {
      const payload = requireFirstPartyOAuthClient(req, res);
      if (!payload) return;
      const { VerificationIntegrationService } = await import('./verificationIntegrationService');
      const pn = String(payload.pnIdentifier || '').trim();
      return res.json({ verified: pn ? await VerificationIntegrationService.isVerified(pn) : false });
    } catch (e) {
      return res.status(500).json({ error: safeClientErrorMessage(e, isProduction) });
    }
  });
}
