/**
 * Recovery failsafe routes: register key hash + envelope; public resolve by key hash.
 */

import type { Application, Request, Response } from 'express';
import { PNOAuthService } from './pnOAuthService';
import { assertDeviceCapability, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import {
  getFailsafeStatus,
  resolveRecoveryFailsafe,
  upsertRecoveryEnvelopeOnly,
  upsertRecoveryFailsafe,
} from './recoveryFailsafeService';
import { safeClientErrorMessage } from '../utils/safeError';

function bearerPn(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  return payload.pnIdentifier.startsWith('pn-')
    ? payload.pnIdentifier
    : `pn-${payload.pnIdentifier}`;
}

export function registerRecoveryFailsafeRoutes(app: Application): void {
  /** Owner: register failsafe key hash + recovery envelope (or update either). */
  app.post('/api/recovery/failsafe/register', async (req: Request, res: Response) => {
    try {
      const gate = await assertDeviceCapability(req, DEVICE_CAPABILITIES.recoveryVaultWrite);
      if (!gate.ok) {
        return res.status(gate.status).json({ error: gate.error, reason: gate.reason });
      }
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, keyHash, publicKey, envelope } = req.body ?? {};
      const pnRaw = String(userPnIdentifier || authPn);
      const pn = pnRaw.startsWith('pn-') ? pnRaw : `pn-${pnRaw}`;
      if (pn !== authPn) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!publicKey || typeof publicKey !== 'string') {
        return res.status(400).json({ error: 'publicKey required' });
      }
      if (!envelope || typeof envelope !== 'object') {
        return res.status(400).json({ error: 'envelope required' });
      }

      if (typeof keyHash === 'string' && keyHash.trim()) {
        await upsertRecoveryFailsafe({
          pnIdentifier: pn,
          keyHash: keyHash.trim(),
          publicKey,
          envelope,
        });
      } else {
        await upsertRecoveryEnvelopeOnly({
          pnIdentifier: pn,
          publicKey,
          envelope,
        });
      }
      return res.json({ success: true });
    } catch (error: unknown) {
      console.error('[recovery] failsafe register:', error);
      return res.status(500).json({
        error: 'server_error',
        message: safeClientErrorMessage(error, process.env.NODE_ENV === 'production'),
      });
    }
  });

  /** Owner: status of registered failsafe. */
  app.get('/api/recovery/:userPnIdentifier/failsafe', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });
      const pn = String(req.params.userPnIdentifier || '');
      const norm = pn.startsWith('pn-') ? pn : `pn-${pn}`;
      if (norm !== authPn) return res.status(403).json({ error: 'forbidden' });
      const status = await getFailsafeStatus(norm);
      return res.json(status);
    } catch (error: unknown) {
      console.error('[recovery] failsafe status:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Public resolve: paste recovery key hash → envelope + publicKey for Shamir start.
   * Does not require owner session (unlock screen).
   */
  app.post('/api/recovery/failsafe/resolve', async (req: Request, res: Response) => {
    try {
      const { keyHash, pnIdentifier } = req.body ?? {};
      if (!keyHash || typeof keyHash !== 'string') {
        return res.status(400).json({ error: 'keyHash required' });
      }
      const record = await resolveRecoveryFailsafe({
        keyHash: keyHash.trim(),
        pnIdentifier: typeof pnIdentifier === 'string' ? pnIdentifier : undefined,
      });
      if (!record) {
        return res.status(404).json({ error: 'not_found', message: 'Invalid recovery key' });
      }
      return res.json({
        pnIdentifier: record.pnIdentifier,
        publicKey: record.publicKey,
        envelope: record.envelope,
      });
    } catch (error: unknown) {
      console.error('[recovery] failsafe resolve:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Public: start custodian recovery with a registered failsafe key (no .pn / no owner session).
   * Best-effort persists the request on Drive when server credentials exist.
   */
  app.post('/api/recovery/failsafe/start', async (req: Request, res: Response) => {
    try {
      const { keyHash, pnIdentifier, threshold, claimantContact } = req.body ?? {};
      if (!keyHash || typeof keyHash !== 'string') {
        return res.status(400).json({ error: 'keyHash required' });
      }
      const record = await resolveRecoveryFailsafe({
        keyHash: keyHash.trim(),
        pnIdentifier: typeof pnIdentifier === 'string' ? pnIdentifier : undefined,
      });
      if (!record) {
        return res.status(404).json({ error: 'not_found', message: 'Invalid recovery key' });
      }

      const requestId = `recovery-${Date.now()}`;
      const thr = Number(threshold) > 0 ? Number(threshold) : 2;
      let persisted = false;
      try {
        const { getRecoveryDriveContext } = await import('./recoveryDriveContext');
        const { RecoverySheetsService } = await import('./recoverySheetsService');
        const ctx = await getRecoveryDriveContext(record.pnIdentifier);
        if (ctx) {
          const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
            ctx.token,
            ctx.metadataFolderId,
            ctx.pnIdentifier,
            ctx.accountId
          );
          await RecoverySheetsService.upsertRecoveryRequest(
            ctx.token,
            spreadsheetId,
            {
              requestId,
              publicKey: record.publicKey,
              status: 'pending',
              threshold: thr,
              sharesJson: '[]',
              claimantName: typeof claimantContact === 'string' ? claimantContact : '',
              createdAt: new Date().toISOString(),
              requestType: 'identity_recovery',
            },
            ctx.pnIdentifier,
            ctx.accountId
          );
          persisted = true;
        }
      } catch (err) {
        console.warn('[recovery] failsafe start Drive persist skipped:', err);
      }

      return res.json({
        requestId,
        pnIdentifier: record.pnIdentifier,
        publicKey: record.publicKey,
        envelope: record.envelope,
        threshold: thr,
        persisted,
      });
    } catch (error: unknown) {
      console.error('[recovery] failsafe start:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
