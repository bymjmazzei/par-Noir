/**
 * Recovery failsafe routes: register key hash + envelope + Drive proof; public recovery start.
 */

import type { Application, Request, Response } from 'express';
import { PNOAuthService } from './pnOAuthService';
import {
  gateRecoverySetup,
  getBearerPnIdentifier,
  RECOVERY_SETUP_CHALLENGE_CLIENT_ID,
} from './deviceCapabilityService';
import {
  getFailsafeStatus,
  resolveRecoveryFailsafe,
  upsertRecoveryEnvelopeOnly,
  upsertRecoveryFailsafe,
} from './recoveryFailsafeService';
import {
  ACTIVE_REQUEST_STATUSES,
  eligibleCustodians,
  getRecoveryRelayStore,
  isMlKem768PublicKey,
  recoveryDriveProofDigest,
  recoveryOwnerHash,
  recoveryReleaseDelayMs,
  recoveryRequestIdForKey,
  recoveryRequestTtlMs,
} from './recoveryRelayService';
import { safeClientErrorMessage } from '../utils/safeError';

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;
function isKeyRecoveryEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1
    && v.kind === 'recovery-key'
    && typeof v.salt === 'string'
    && typeof v.iv === 'string'
    && typeof v.ciphertext === 'string'
    && v.ciphertext.length <= 64 * 1024
  );
}

/** Live alert to the owner's open sessions (keyed devices and unlocked dashboards). */
async function notifyOwnerOfRecovery(pnIdentifier: string): Promise<void> {
  try {
    const { emitNewNotification } = await import('./realtimeEvents');
    emitNewNotification(pnIdentifier, 'recovery_request');
  } catch (err) {
    console.warn('[recovery] owner recovery notice not sent:', (err as Error)?.message);
  }
}

export function registerRecoveryFailsafeRoutes(app: Application): void {
  /** Owner: single-use challenge to sign when changing recovery setup before any device is keyed. */
  app.post('/api/recovery/owner/setup-challenge', async (req: Request, res: Response) => {
    try {
      const authPn = getBearerPnIdentifier(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });
      const challenge = await PNOAuthService.createUnlockChallenge({
        clientId: RECOVERY_SETUP_CHALLENGE_CLIENT_ID,
        redirectUri: authPn,
      });
      return res.json(challenge);
    } catch (error: unknown) {
      console.error('[recovery] setup challenge:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** Owner: register failsafe key hash + recovery envelope (or update either). */
  app.post('/api/recovery/failsafe/register', async (req: Request, res: Response) => {
    try {
      if (!(await gateRecoverySetup(req, res))) return;
      const authPn = getBearerPnIdentifier(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, keyHash, publicKey, envelope, keyEnvelope, driveProofHash } = req.body ?? {};
      const pnRaw = String(userPnIdentifier || authPn);
      const pn = pnRaw.startsWith('pn-') ? pnRaw : `pn-${pnRaw}`;
      if (pn !== authPn) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!publicKey || typeof publicKey !== 'string') {
        return res.status(400).json({ error: 'publicKey required' });
      }
      const hasKeyEnvelope = keyEnvelope !== undefined && keyEnvelope !== null;
      if (hasKeyEnvelope && !isKeyRecoveryEnvelope(keyEnvelope)) {
        return res.status(400).json({ error: 'invalid_key_envelope' });
      }
      if (!hasKeyEnvelope && (!envelope || typeof envelope !== 'object')) {
        return res.status(400).json({ error: 'envelope required' });
      }
      if (hasKeyEnvelope) {
        if (typeof keyHash !== 'string' || !keyHash.trim()) {
          return res.status(400).json({ error: 'keyHash required' });
        }
        if (!driveProofHash) {
          return res.status(400).json({ error: 'drive_proof_required' });
        }
        if (await getRecoveryRelayStore().getOwner(recoveryOwnerHash(pn))) {
          return res.status(409).json({ error: 'custodians_configured' });
        }
      }
      if (driveProofHash !== undefined && !SHA256_HEX.test(String(driveProofHash))) {
        return res.status(400).json({ error: 'invalid_drive_proof_hash' });
      }
      const driveProofDigest = driveProofHash
        ? recoveryDriveProofDigest(String(driveProofHash).toLowerCase())
        : undefined;

      if (typeof keyHash === 'string' && keyHash.trim()) {
        await upsertRecoveryFailsafe({
          pnIdentifier: pn,
          keyHash: keyHash.trim(),
          publicKey,
          envelope: envelope && typeof envelope === 'object' ? envelope : null,
          keyEnvelope: hasKeyEnvelope ? keyEnvelope : null,
          driveProofDigest,
        });
      } else {
        await upsertRecoveryEnvelopeOnly({
          pnIdentifier: pn,
          publicKey,
          envelope,
          driveProofDigest,
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
      const authPn = getBearerPnIdentifier(req);
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
   * Public: start recovery with the recovery key (no owner session). Key-only pNs wait out the
   * release delay (or a keyed-device approval); custodian pNs collect approvals, and approved
   * shares are sealed to `temporaryPublicKey`, which only the claimant device holds.
   */
  app.post('/api/recovery/failsafe/start', async (req: Request, res: Response) => {
    try {
      const { keyHash, temporaryPublicKey, claimantContact } = req.body ?? {};
      if (!keyHash || typeof keyHash !== 'string') {
        return res.status(400).json({ error: 'keyHash required' });
      }
      if (!isMlKem768PublicKey(temporaryPublicKey)) {
        return res.status(400).json({ error: 'invalid_temporary_public_key' });
      }
      const record = await resolveRecoveryFailsafe({ keyHash: keyHash.trim() });
      if (!record) {
        return res.status(404).json({ error: 'not_found', message: 'Invalid recovery key' });
      }
      if (!record.driveProofDigest) {
        return res.status(409).json({ error: 'drive_proof_not_registered' });
      }

      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(record.pnIdentifier);
      const tempKey = String(temporaryPublicKey).trim();
      const requestId = recoveryRequestIdForKey(tempKey);
      const contact = typeof claimantContact === 'string' ? claimantContact.slice(0, 200) : '';

      if (record.keyEnvelope) {
        let request = await store.getRequest(requestId);
        if (request && (request.ownerHash !== ownerHash || !ACTIVE_REQUEST_STATUSES.includes(request.status))) {
          return res.status(409).json({ error: 'request_key_reused' });
        }
        if (!request) {
          const now = Date.now();
          request = {
            requestId,
            requestType: 'key_recovery',
            ownerHash,
            ownerPublicKey: record.publicKey,
            temporaryPublicKey: tempKey,
            threshold: 0,
            epoch: 0,
            claimantContact: contact,
            status: 'pending',
            approvals: [],
            releaseAfter: new Date(now + recoveryReleaseDelayMs()).toISOString(),
            expiresAt: new Date(now + recoveryRequestTtlMs()).toISOString(),
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          };
          await store.insertRequest(request);
          await notifyOwnerOfRecovery(record.pnIdentifier);
        }
        return res.json({
          mode: 'key_only',
          requestId,
          pnIdentifier: record.pnIdentifier,
          publicKey: record.publicKey,
          threshold: 0,
          releaseAfter: request.releaseAfter,
          expiresAt: request.expiresAt,
        });
      }

      if (!record.envelope) return res.status(409).json({ error: 'recovery_not_configured' });
      const owner = await store.getOwner(ownerHash);
      if (!owner) return res.status(409).json({ error: 'recovery_not_configured' });
      const eligible = eligibleCustodians(await store.listCustodians(ownerHash), owner.epoch);
      if (eligible.length < owner.threshold) {
        return res.status(409).json({ error: 'custodians_not_ready' });
      }
      if (!eligible.some((c) => c.unrevokable)) {
        return res.status(409).json({ error: 'protected_custodian_missing' });
      }

      let request = await store.getRequest(requestId);
      if (request && (request.ownerHash !== ownerHash || !ACTIVE_REQUEST_STATUSES.includes(request.status))) {
        return res.status(409).json({ error: 'request_key_reused' });
      }
      if (!request) {
        const now = Date.now();
        request = {
          requestId,
          requestType: 'identity_recovery',
          ownerHash,
          ownerPublicKey: owner.ownerPublicKey,
          temporaryPublicKey: tempKey,
          threshold: owner.threshold,
          epoch: owner.epoch,
          claimantContact: contact,
          status: 'pending',
          approvals: [],
          releaseAfter: new Date(now + recoveryReleaseDelayMs()).toISOString(),
          expiresAt: new Date(now + recoveryRequestTtlMs()).toISOString(),
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        };
        await store.insertRequest(request);
        await notifyOwnerOfRecovery(record.pnIdentifier);
      }

      return res.json({
        mode: 'custodians',
        requestId,
        pnIdentifier: record.pnIdentifier,
        publicKey: record.publicKey,
        envelope: record.envelope,
        threshold: request.threshold,
        releaseAfter: request.releaseAfter,
        expiresAt: request.expiresAt,
      });
    } catch (error: unknown) {
      console.error('[recovery] failsafe start:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
