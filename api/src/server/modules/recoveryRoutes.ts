/**
 * Custodian-held recovery routes (owner, custodian, public release).
 * See recoveryRelayService for the storage model. No cloud token is read here.
 */

import { randomUUID } from 'crypto';
import type { Application, Request, Response } from 'express';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { normalizeCustodianStatus, type RecoveryZkApprovalPayload } from '@par-noir/recovery-crypto';
import {
  assertDeviceCapability,
  DEVICE_CAPABILITIES,
  gateOwnerRoute,
  getBearerPnIdentifier,
} from './deviceCapabilityService';
import {
  ACTIVE_REQUEST_STATUSES,
  driveProofMatches,
  eligibleCustodians,
  evaluateRequestQuorum,
  getRecoveryRelayStore,
  isMlKem768PublicKey,
  normalizeRecoveryPn,
  parseSealedSharePayload,
  recoveryCustodianPnHash,
  recoveryOwnerHash,
  recoveryRequestTtlMs,
  refreshRequestExpiry,
  releaseBlockReason,
  type RecoveryCustodianRow,
  type RecoveryOwnerRow,
  type RecoveryRequestRow,
} from './recoveryRelayService';
import { verifyCustodianshipCredential, verifyRecoveryApprovalPayload } from './recoveryZkService';
import { resolveRecoveryFailsafe } from './recoveryFailsafeService';
import { safeLogger } from '../../utils/logger';

function serverError(res: Response, tag: string, error: unknown): Response {
  safeLogger.error(`[recovery] ${tag}`, { err: error instanceof Error ? error.message : 'error' });
  return res.status(500).json({ error: 'server_error' });
}

async function gateCustodian(req: Request, res: Response, capability: string): Promise<string | null> {
  const bearer = getBearerPnIdentifier(req);
  if (!bearer) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  const gate = await assertDeviceCapability(req, capability);
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error, reason: gate.reason });
    return null;
  }
  return bearer;
}

function validSplit(threshold: unknown, totalShares: unknown): { threshold: number; totalShares: number } | null {
  const t = Number(threshold);
  const n = Number(totalShares);
  if (!Number.isInteger(t) || !Number.isInteger(n) || t < 2 || t > 5 || n < t || n > 5) return null;
  return { threshold: t, totalShares: n };
}

function custodianSummary(c: RecoveryCustodianRow, owner: RecoveryOwnerRow | null) {
  return {
    custodianId: c.custodianId,
    name: c.name,
    custodianType: c.custodianType,
    shareIndex: c.shareIndex,
    status: normalizeCustodianStatus(c.status),
    unrevokable: c.unrevokable,
    hasKey: Boolean(c.mlKemPublicKey),
    custodyEpoch: c.custodyEpoch,
    custodyCurrent: Boolean(owner && c.custodyEpoch === owner.epoch),
    custodianshipCredential: c.custodianshipCredential,
    createdAt: c.createdAt,
  };
}

function requestSummary(r: RecoveryRequestRow, custodians: RecoveryCustodianRow[]) {
  const quorum = evaluateRequestQuorum(r, custodians);
  return {
    requestId: r.requestId,
    requestType: r.requestType,
    status: r.status,
    approvalCount: quorum.approvalCount,
    threshold: r.threshold,
    includesUnrevokableShare: quorum.includesUnrevokableShare,
    claimantContact: r.claimantContact,
    createdAt: r.createdAt,
    releaseAfter: r.releaseAfter,
    expiresAt: r.expiresAt,
  };
}

export function registerRecoveryRoutes(app: Application): void {
  // -------------------------------------------------------------------------
  // Owner
  // -------------------------------------------------------------------------

  /** Create the recovery config, or rotate to a new epoch after a fresh split. */
  app.post('/api/recovery/owner/epoch', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryVaultWrite);
      if (!ctx) return;
      const { ownerPublicKey, threshold, totalShares, rotate } = req.body ?? {};
      if (typeof ownerPublicKey !== 'string' || !ownerPublicKey.trim()) {
        return res.status(400).json({ error: 'ownerPublicKey required' });
      }
      if (deriveCanonicalPnIdentifier(ownerPublicKey.trim()) !== ctx.pnIdentifier) {
        return res.status(403).json({ error: 'owner_key_mismatch' });
      }
      const split = validSplit(threshold, totalShares);
      if (!split) return res.status(400).json({ error: 'invalid_split' });

      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const existing = await store.getOwner(ownerHash);
      if (
        existing
        && rotate !== true
        && (existing.threshold !== split.threshold || existing.totalShares !== split.totalShares)
      ) {
        return res.status(409).json({ error: 'resplit_required' });
      }
      const epoch = !existing ? 1 : rotate === true ? existing.epoch + 1 : existing.epoch;
      await store.upsertOwner({
        ownerHash,
        ownerPublicKey: ownerPublicKey.trim(),
        epoch,
        threshold: split.threshold,
        totalShares: split.totalShares,
        updatedAt: new Date().toISOString(),
      });
      if (existing && rotate === true) {
        await store.deleteCustodyDeliveriesForOwner(ownerHash);
        const requests = await store.listRequestsForOwner(ownerHash);
        for (const r of requests) {
          if (ACTIVE_REQUEST_STATUSES.includes(r.status)) {
            await store.updateRequest(r.requestId, { status: 'cancelled' });
          }
        }
      }
      return res.json({ success: true, epoch, threshold: split.threshold, totalShares: split.totalShares });
    } catch (error) {
      return serverError(res, 'owner epoch', error);
    }
  });

  app.get('/api/recovery/owner/summary', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.custodiansRead);
      if (!ctx) return;
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const owner = await store.getOwner(ownerHash);
      const custodians = await store.listCustodians(ownerHash);
      const live = custodians.filter((c) => normalizeCustodianStatus(c.status) !== 'revoked');
      const ready = owner ? eligibleCustodians(custodians, owner.epoch) : [];
      return res.json({
        configured: Boolean(owner),
        epoch: owner?.epoch ?? null,
        threshold: owner?.threshold ?? null,
        totalShares: owner?.totalShares ?? null,
        custodians: live.map((c) => custodianSummary(c, owner)),
        counts: {
          accepted: live.filter((c) => normalizeCustodianStatus(c.status) === 'accepted').length,
          acceptedUnrevokable: live.filter(
            (c) => normalizeCustodianStatus(c.status) === 'accepted' && c.unrevokable
          ).length,
          invited: live.filter((c) => normalizeCustodianStatus(c.status) === 'invited').length,
          ready: ready.length,
          readyUnrevokable: ready.filter((c) => c.unrevokable).length,
        },
      });
    } catch (error) {
      return serverError(res, 'owner summary', error);
    }
  });

  app.post('/api/recovery/owner/custodians', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryCustodianManage);
      if (!ctx) return;
      const { custodianId, name, custodianType, shareIndex, custodianshipCredential, unrevokable } = req.body ?? {};
      if (typeof custodianId !== 'string' || !custodianId.trim() || typeof custodianshipCredential !== 'string') {
        return res.status(400).json({ error: 'custodianId and custodianshipCredential required' });
      }
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const owner = await store.getOwner(ownerHash);
      if (!owner) return res.status(409).json({ error: 'recovery_not_configured' });

      const verified = verifyCustodianshipCredential(custodianshipCredential);
      if (!verified.ok || !verified.data) {
        return res.status(400).json({ error: 'invalid_custodianship_credential', reason: verified.reason });
      }
      const index = Number(shareIndex);
      if (
        verified.data.custodianId !== custodianId
        || verified.data.identityPublicKey !== owner.ownerPublicKey
        || verified.data.shareIndex !== index
      ) {
        return res.status(400).json({ error: 'custodianship_mismatch' });
      }
      if (!Number.isInteger(index) || index < 1 || index > owner.totalShares) {
        return res.status(400).json({ error: 'invalid_share_index' });
      }
      if (verified.data.unrevokable !== undefined && verified.data.unrevokable !== (unrevokable === true)) {
        return res.status(400).json({ error: 'custodianship_unrevokable_mismatch' });
      }

      const custodians = await store.listCustodians(ownerHash);
      const existing = custodians.find((c) => c.custodianId === custodianId);
      if (existing && normalizeCustodianStatus(existing.status) === 'revoked') {
        return res.status(409).json({ error: 'custodian_revoked' });
      }
      const taken = custodians.find(
        (c) =>
          c.custodianId !== custodianId
          && c.shareIndex === index
          && normalizeCustodianStatus(c.status) !== 'revoked'
      );
      if (taken) return res.status(409).json({ error: 'share_index_taken' });

      const now = new Date().toISOString();
      await store.upsertCustodian({
        ownerHash,
        custodianId,
        ownerPublicKey: owner.ownerPublicKey,
        custodianPnHash: existing?.custodianPnHash ?? null,
        name: typeof name === 'string' ? name.slice(0, 120) : '',
        custodianType: typeof custodianType === 'string' ? custodianType.slice(0, 40) : 'person',
        shareIndex: index,
        custodianshipCredential,
        unrevokable: unrevokable === true,
        status: existing?.status ?? 'invited',
        mlKemPublicKey: existing?.mlKemPublicKey ?? null,
        custodyEpoch: existing?.custodyEpoch ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return res.json({ success: true, custodianId, shareIndex: index });
    } catch (error) {
      return serverError(res, 'owner custodian register', error);
    }
  });

  app.post('/api/recovery/owner/custodians/:custodianId/custody', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryVaultWrite);
      if (!ctx) return;
      const { epoch, sealedShare } = req.body ?? {};
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const owner = await store.getOwner(ownerHash);
      if (!owner) return res.status(409).json({ error: 'recovery_not_configured' });
      if (Number(epoch) !== owner.epoch) return res.status(409).json({ error: 'stale_epoch' });

      const custodian = await store.getCustodian(ownerHash, req.params.custodianId);
      if (!custodian || normalizeCustodianStatus(custodian.status) !== 'accepted' || !custodian.mlKemPublicKey) {
        return res.status(409).json({ error: 'custodian_not_accepted' });
      }
      const sealed = parseSealedSharePayload(sealedShare, custodian.shareIndex);
      if (!sealed) return res.status(400).json({ error: 'invalid_sealed_share' });

      await store.putCustodyDelivery({
        id: randomUUID(),
        kind: 'custody',
        ownerHash,
        custodianId: custodian.custodianId,
        requestId: null,
        epoch: owner.epoch,
        sealedShare: sealed,
        createdAt: new Date().toISOString(),
      });
      return res.json({ success: true });
    } catch (error) {
      return serverError(res, 'owner custody delivery', error);
    }
  });

  app.post('/api/recovery/owner/custodians/:custodianId/revoke', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryCustodianManage);
      if (!ctx) return;
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const owner = await store.getOwner(ownerHash);
      const custodians = await store.listCustodians(ownerHash);
      const target = custodians.find((c) => c.custodianId === req.params.custodianId);
      if (!target || normalizeCustodianStatus(target.status) === 'revoked') {
        return res.status(404).json({ error: 'custodian_not_found' });
      }
      if (target.unrevokable) return res.status(403).json({ error: 'custodian_unrevokable' });
      const remainingAccepted = custodians.filter(
        (c) => c.custodianId !== target.custodianId && normalizeCustodianStatus(c.status) === 'accepted'
      ).length;
      if (owner && normalizeCustodianStatus(target.status) === 'accepted' && remainingAccepted < owner.threshold) {
        return res.status(403).json({ error: 'revoke_would_break_threshold' });
      }
      await store.upsertCustodian({
        ...target,
        status: 'revoked',
        custodyEpoch: null,
        updatedAt: new Date().toISOString(),
      });
      for (const d of await store.listCustodyDeliveries(ownerHash, target.custodianId)) {
        await store.deleteDelivery(d.id);
      }
      return res.json({ success: true, custodianId: target.custodianId, resplitRequired: true });
    } catch (error) {
      return serverError(res, 'owner custodian revoke', error);
    }
  });

  app.get('/api/recovery/owner/requests', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryRead);
      if (!ctx) return;
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const custodians = await store.listCustodians(ownerHash);
      const requests = [];
      for (const r of await store.listRequestsForOwner(ownerHash)) {
        requests.push(requestSummary(await refreshRequestExpiry(store, r), custodians));
      }
      return res.json({ requests });
    } catch (error) {
      return serverError(res, 'owner requests', error);
    }
  });

  app.post('/api/recovery/owner/requests/:requestId/cancel', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryInitiate);
      if (!ctx) return;
      const store = getRecoveryRelayStore();
      const request = await store.getRequest(req.params.requestId);
      if (!request || request.ownerHash !== recoveryOwnerHash(ctx.pnIdentifier)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!ACTIVE_REQUEST_STATUSES.includes(request.status)) {
        return res.status(409).json({ error: 'request_not_active', status: request.status });
      }
      await store.updateRequest(request.requestId, { status: 'cancelled' });
      return res.json({ success: true, status: 'cancelled' });
    } catch (error) {
      return serverError(res, 'owner cancel request', error);
    }
  });

  /** Owner (unlocked, possibly unkeyed) asks custodians to approve wiping keyed devices. */
  app.post('/api/recovery/owner/device-reset', async (req: Request, res: Response) => {
    try {
      const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryInitiate);
      if (!ctx) return;
      const store = getRecoveryRelayStore();
      const ownerHash = recoveryOwnerHash(ctx.pnIdentifier);
      const owner = await store.getOwner(ownerHash);
      if (!owner) return res.status(409).json({ error: 'recovery_not_configured' });
      const eligible = eligibleCustodians(await store.listCustodians(ownerHash), owner.epoch);
      if (eligible.length < owner.threshold) return res.status(409).json({ error: 'custodians_not_ready' });

      const now = Date.now();
      const request: RecoveryRequestRow = {
        requestId: `device-reset-${randomUUID()}`,
        requestType: 'device_registry_reset',
        ownerHash,
        ownerPublicKey: owner.ownerPublicKey,
        temporaryPublicKey: null,
        threshold: owner.threshold,
        epoch: owner.epoch,
        claimantContact: '',
        status: 'pending',
        approvals: [],
        releaseAfter: new Date(now).toISOString(),
        expiresAt: new Date(now + recoveryRequestTtlMs()).toISOString(),
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      await store.insertRequest(request);
      return res.json({ success: true, requestId: request.requestId, threshold: owner.threshold });
    } catch (error) {
      return serverError(res, 'owner device reset start', error);
    }
  });

  // -------------------------------------------------------------------------
  // Custodian
  // -------------------------------------------------------------------------

  app.post('/api/recovery/custodian/accept', async (req: Request, res: Response) => {
    try {
      const bearer = await gateCustodian(req, res, DEVICE_CAPABILITIES.custodianAccept);
      if (!bearer) return;
      const { ownerPnIdentifier, custodianId, custodianshipZkp, mlKemPublicKey } = req.body ?? {};
      if (!ownerPnIdentifier || !custodianId || typeof custodianshipZkp !== 'string') {
        return res.status(400).json({ error: 'ownerPnIdentifier, custodianId and custodianshipZkp required' });
      }
      if (!isMlKem768PublicKey(mlKemPublicKey)) {
        return res.status(400).json({ error: 'invalid_ml_kem_public_key' });
      }
      const ownerPn = normalizeRecoveryPn(String(ownerPnIdentifier));
      if (ownerPn === bearer) return res.status(400).json({ error: 'custodian_is_owner' });

      const verified = verifyCustodianshipCredential(custodianshipZkp);
      if (!verified.ok || verified.data?.custodianId !== custodianId) {
        return res.status(400).json({ error: 'invalid_custodianship_credential', reason: verified.reason });
      }
      const store = getRecoveryRelayStore();
      const row = await store.getCustodian(recoveryOwnerHash(ownerPn), String(custodianId));
      if (!row || normalizeCustodianStatus(row.status) === 'revoked') {
        return res.status(404).json({ error: 'custodian_not_found' });
      }
      if (row.custodianshipCredential !== custodianshipZkp) {
        return res.status(400).json({ error: 'custodianship_mismatch' });
      }
      const custodianPnHash = recoveryCustodianPnHash(bearer);
      if (row.custodianPnHash && row.custodianPnHash !== custodianPnHash) {
        return res.status(409).json({ error: 'custodian_already_claimed' });
      }
      await store.upsertCustodian({
        ...row,
        custodianPnHash,
        mlKemPublicKey: String(mlKemPublicKey).trim(),
        status: 'accepted',
        updatedAt: new Date().toISOString(),
      });
      return res.json({ success: true, status: 'accepted', custodianId: row.custodianId });
    } catch (error) {
      return serverError(res, 'custodian accept', error);
    }
  });

  app.get('/api/recovery/custodian/custody', async (req: Request, res: Response) => {
    try {
      const bearer = await gateCustodian(req, res, DEVICE_CAPABILITIES.custodianAccept);
      if (!bearer) return;
      const store = getRecoveryRelayStore();
      const deliveries = [];
      for (const c of await store.listCustodiansByCustodianPn(recoveryCustodianPnHash(bearer))) {
        for (const d of await store.listCustodyDeliveries(c.ownerHash, c.custodianId)) {
          deliveries.push({
            deliveryId: d.id,
            ownerPublicKey: c.ownerPublicKey,
            custodianId: c.custodianId,
            shareIndex: c.shareIndex,
            epoch: d.epoch,
            sealedShare: d.sealedShare,
          });
        }
      }
      return res.json({ deliveries });
    } catch (error) {
      return serverError(res, 'custodian custody list', error);
    }
  });

  app.post('/api/recovery/custodian/custody/ack', async (req: Request, res: Response) => {
    try {
      const bearer = await gateCustodian(req, res, DEVICE_CAPABILITIES.custodianAccept);
      if (!bearer) return;
      const ids: unknown[] = Array.isArray(req.body?.deliveryIds) ? req.body.deliveryIds : [];
      const store = getRecoveryRelayStore();
      const custodianPnHash = recoveryCustodianPnHash(bearer);
      let acked = 0;
      for (const id of ids) {
        if (typeof id !== 'string') continue;
        const d = await store.getDelivery(id);
        if (!d || d.kind !== 'custody') continue;
        const row = await store.getCustodian(d.ownerHash, d.custodianId);
        if (!row || row.custodianPnHash !== custodianPnHash) continue;
        await store.upsertCustodian({ ...row, custodyEpoch: d.epoch, updatedAt: new Date().toISOString() });
        await store.deleteDelivery(d.id);
        acked += 1;
      }
      return res.json({ success: true, acked });
    } catch (error) {
      return serverError(res, 'custodian custody ack', error);
    }
  });

  app.get('/api/recovery/custodian/requests', async (req: Request, res: Response) => {
    try {
      const bearer = await gateCustodian(req, res, DEVICE_CAPABILITIES.custodianApprove);
      if (!bearer) return;
      const store = getRecoveryRelayStore();
      const out = [];
      const now = Date.now();
      for (const c of await store.listCustodiansByCustodianPn(recoveryCustodianPnHash(bearer))) {
        const all = await store.listCustodians(c.ownerHash);
        for (const raw of await store.listRequestsForOwner(c.ownerHash)) {
          const r = await refreshRequestExpiry(store, raw, now);
          if (r.status !== 'pending' && r.status !== 'ready') continue;
          if (r.epoch !== c.custodyEpoch) continue;
          if (r.approvals.some((a) => a.custodianId === c.custodianId)) continue;
          out.push({
            ...requestSummary(r, all),
            ownerPublicKey: r.ownerPublicKey,
            custodianId: c.custodianId,
            shareIndex: c.shareIndex,
            epoch: r.epoch,
            temporaryPublicKey: r.temporaryPublicKey,
          });
        }
      }
      return res.json({ requests: out });
    } catch (error) {
      return serverError(res, 'custodian requests', error);
    }
  });

  app.post('/api/recovery/custodian/requests/:requestId/approve', async (req: Request, res: Response) => {
    try {
      const bearer = await gateCustodian(req, res, DEVICE_CAPABILITIES.custodianApprove);
      if (!bearer) return;
      const { custodianId, approval, sealedShare } = req.body ?? {};
      const payload = approval as RecoveryZkApprovalPayload | undefined;
      if (typeof custodianId !== 'string' || !payload?.approvalZkp || !payload?.custodianshipZkp) {
        return res.status(400).json({ error: 'custodianId and approval required' });
      }
      const store = getRecoveryRelayStore();
      const found = await store.getRequest(req.params.requestId);
      if (!found) return res.status(404).json({ error: 'request_not_found' });
      const request = await refreshRequestExpiry(store, found);
      if (request.status !== 'pending' && request.status !== 'ready') {
        return res.status(409).json({ error: 'request_not_active', status: request.status });
      }

      const custodian = await store.getCustodian(request.ownerHash, custodianId);
      if (
        !custodian
        || normalizeCustodianStatus(custodian.status) !== 'accepted'
        || custodian.custodianPnHash !== recoveryCustodianPnHash(bearer)
      ) {
        return res.status(403).json({ error: 'custodian_not_accepted' });
      }
      if (custodian.custodyEpoch !== request.epoch) return res.status(409).json({ error: 'stale_epoch' });
      if (
        payload.custodianId !== custodianId
        || payload.shareIndex !== custodian.shareIndex
        || payload.custodianshipZkp !== custodian.custodianshipCredential
      ) {
        return res.status(400).json({ error: 'approval_mismatch' });
      }
      const verified = verifyRecoveryApprovalPayload(payload);
      if (!verified.ok) return res.status(400).json({ error: 'invalid_approval', reason: verified.reason });
      if (verified.requestId !== request.requestId || verified.identityPublicKey !== request.ownerPublicKey) {
        return res.status(400).json({ error: 'approval_request_mismatch' });
      }
      if (request.approvals.some((a) => a.custodianId === custodianId)) {
        return res.status(409).json({ error: 'already_approved' });
      }

      if (request.requestType === 'identity_recovery') {
        const sealed = parseSealedSharePayload(sealedShare, custodian.shareIndex);
        if (!sealed) return res.status(400).json({ error: 'invalid_sealed_share' });
        await store.putReleaseDelivery({
          id: randomUUID(),
          kind: 'release',
          ownerHash: request.ownerHash,
          custodianId,
          requestId: request.requestId,
          epoch: request.epoch,
          sealedShare: sealed,
          createdAt: new Date().toISOString(),
        });
      }

      const approvals = [
        ...request.approvals,
        { custodianId, shareIndex: custodian.shareIndex, approvedAt: new Date().toISOString() },
      ];
      const quorum = evaluateRequestQuorum({ ...request, approvals }, await store.listCustodians(request.ownerHash));
      const status = quorum.ready ? 'ready' : 'pending';
      await store.updateRequest(request.requestId, { approvals, status });
      return res.json({
        success: true,
        status,
        approvalCount: quorum.approvalCount,
        includesUnrevokableShare: quorum.includesUnrevokableShare,
        reason: quorum.reason,
      });
    } catch (error) {
      return serverError(res, 'custodian approve', error);
    }
  });

  // -------------------------------------------------------------------------
  // Public (claimant without a pN session)
  // -------------------------------------------------------------------------

  app.get('/api/recovery/requests/:requestId/status', async (req: Request, res: Response) => {
    try {
      const store = getRecoveryRelayStore();
      const found = await store.getRequest(req.params.requestId);
      if (!found) return res.status(404).json({ error: 'request_not_found' });
      const request = await refreshRequestExpiry(store, found);
      const summary = requestSummary(request, await store.listCustodians(request.ownerHash));
      return res.json({
        requestType: summary.requestType,
        status: summary.status,
        approvalCount: summary.approvalCount,
        threshold: summary.threshold,
        includesUnrevokableShare: summary.includesUnrevokableShare,
        releaseAfter: summary.releaseAfter,
        expiresAt: summary.expiresAt,
      });
    } catch (error) {
      return serverError(res, 'request status', error);
    }
  });

  /**
   * Release sealed shares to the claimant. Requires the failsafe key and the
   * owner-Drive proof the claimant read back with their own Google sign-in.
   */
  app.post('/api/recovery/requests/:requestId/release', async (req: Request, res: Response) => {
    try {
      const { keyHash, driveProof } = req.body ?? {};
      if (typeof keyHash !== 'string' || !keyHash.trim() || typeof driveProof !== 'string' || !driveProof.trim()) {
        return res.status(400).json({ error: 'keyHash and driveProof required' });
      }
      const store = getRecoveryRelayStore();
      const found = await store.getRequest(req.params.requestId);
      if (!found) return res.status(404).json({ error: 'request_not_found' });
      const request = await refreshRequestExpiry(store, found);

      const failsafe = await resolveRecoveryFailsafe({ keyHash: keyHash.trim() });
      if (!failsafe || recoveryOwnerHash(failsafe.pnIdentifier) !== request.ownerHash) {
        return res.status(403).json({ error: 'invalid_recovery_key' });
      }
      if (!driveProofMatches(driveProof, failsafe.driveProofDigest)) {
        return res.status(403).json({ error: 'drive_proof_mismatch' });
      }

      const custodians = await store.listCustodians(request.ownerHash);
      const quorum = evaluateRequestQuorum(request, custodians);
      const block = releaseBlockReason(request, quorum);
      if (block) {
        return res.status(block === 'request_not_found' ? 404 : 409).json({
          error: block,
          releaseAfter: request.releaseAfter,
          approvalCount: quorum.approvalCount,
        });
      }

      const eligible = eligibleCustodians(custodians, request.epoch);
      const shares = (await store.listReleaseDeliveries(request.requestId))
        .filter(
          (d) =>
            d.epoch === request.epoch
            && request.approvals.some((a) => a.custodianId === d.custodianId)
            && eligible.some((c) => c.custodianId === d.custodianId)
        )
        .map((d) => ({
          custodianId: d.custodianId,
          shareIndex: eligible.find((c) => c.custodianId === d.custodianId)!.shareIndex,
          epoch: d.epoch,
          sealedShare: d.sealedShare,
        }));
      if (request.status !== 'released') {
        await store.updateRequest(request.requestId, { status: 'released' });
      }
      return res.json({
        success: true,
        pnIdentifier: failsafe.pnIdentifier,
        publicKey: failsafe.publicKey,
        envelope: failsafe.envelope,
        shares,
      });
    } catch (error) {
      return serverError(res, 'request release', error);
    }
  });
}
