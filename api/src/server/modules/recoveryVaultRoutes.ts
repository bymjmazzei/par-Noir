/**
 * Recovery vault routes: pending shares, assign, revoke, resend, accept.
 */

import type { Application, Request, Response } from 'express';
import {
  computeMissingShareIndices,
  countAcceptedCustodians,
  normalizeCustodianStatus,
  recoveryMeetsQuorumRule,
  type RecoveryZkApprovalPayload,
} from '@par-noir/recovery-crypto';
import { PNOAuthService } from './pnOAuthService';
import { getRecoveryDriveContext } from './recoveryDriveContext';
import { RecoverySheetsService } from './recoverySheetsService';
import { verifyCustodianshipCredential } from './recoveryZkService';

function bearerPn(req: Request): { pnIdentifier: string; did?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  const pn = payload.pnIdentifier.startsWith('pn-') ? payload.pnIdentifier : `pn-${payload.pnIdentifier}`;
  return { pnIdentifier: pn, did: payload.did };
}

async function spreadsheetForPn(pn: string) {
  const ctx = await getRecoveryDriveContext(pn);
  if (!ctx) return null;
  const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
    ctx.token,
    ctx.metadataFolderId,
    ctx.pnIdentifier,
    ctx.accountId
  );
  return { ctx, spreadsheetId };
}

export function registerRecoveryVaultRoutes(app: Application): void {
  app.post('/api/recovery/vault/initialize', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, shares } = req.body ?? {};
      const pn = String(userPnIdentifier || auth.pnIdentifier);
      if (!Array.isArray(shares)) {
        return res.status(400).json({ error: 'shares array required' });
      }

      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const result = await RecoverySheetsService.initializePendingShares(
        bundle.ctx.token,
        bundle.spreadsheetId,
        shares,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      console.error('[recovery] vault initialize:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/recovery/vault/reconcile', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, totalShares } = req.body ?? {};
      const pn = String(userPnIdentifier || auth.pnIdentifier);
      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const { normalized } = await RecoverySheetsService.normalizeLegacyCustodianRows(
        bundle.ctx.token,
        bundle.spreadsheetId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      let missingIndices: number[] = [];
      const total = Number(totalShares);
      if (Number.isFinite(total) && total > 0) {
        const [custodians, pending] = await Promise.all([
          RecoverySheetsService.listCustodians(
            bundle.ctx.token,
            bundle.spreadsheetId,
            bundle.ctx.pnIdentifier,
            bundle.ctx.accountId
          ),
          RecoverySheetsService.listPendingShares(
            bundle.ctx.token,
            bundle.spreadsheetId,
            bundle.ctx.pnIdentifier,
            bundle.ctx.accountId,
            false
          ),
        ]);
        const assignedIndices = custodians
          .filter((c) => normalizeCustodianStatus(c.status) !== 'revoked')
          .map((c) => c.shareIndex);
        missingIndices = computeMissingShareIndices({
          totalShares: total,
          assignedIndices,
          pendingIndices: pending.map((p) => p.shareIndex),
        });
      }

      return res.json({ success: true, normalized, missingIndices });
    } catch (error: unknown) {
      console.error('[recovery] vault reconcile:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/recovery/:userPnIdentifier/vault/pending', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const pn = req.params.userPnIdentifier;
      const includeEncrypted = req.query.includeEncrypted === 'true';
      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const pending = await RecoverySheetsService.listPendingShares(
        bundle.ctx.token,
        bundle.spreadsheetId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId,
        includeEncrypted
      );
      return res.json({ pending });
    } catch (error: unknown) {
      console.error('[recovery] list pending:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/recovery/custodians/assign', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const {
        userPnIdentifier,
        custodianId,
        name,
        custodianType,
        shareIndex,
        custodianshipCredential,
        encryptedShare,
        unrevokable,
      } = req.body ?? {};

      if (!custodianId || !shareIndex || !custodianshipCredential) {
        return res.status(400).json({ error: 'custodianId, shareIndex, and custodianshipCredential required' });
      }

      const verified = verifyCustodianshipCredential(custodianshipCredential);
      if (!verified.ok) {
        return res.status(400).json({ error: 'Invalid custodianship credential', reason: verified.reason });
      }
      if (verified.data?.custodianId !== custodianId) {
        return res.status(400).json({ error: 'Custodianship custodianId mismatch' });
      }
      if (
        verified.data?.unrevokable !== undefined
        && verified.data.unrevokable !== (unrevokable === true)
      ) {
        return res.status(400).json({ error: 'custodianship_unrevokable_mismatch' });
      }

      const pn = String(userPnIdentifier || auth.pnIdentifier);
      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      await RecoverySheetsService.assignShareToCustodian(
        bundle.ctx.token,
        bundle.spreadsheetId,
        {
          custodianId,
          name: name || custodianId,
          custodianType: custodianType || 'person',
          encryptedShare: encryptedShare || '',
          shareIndex: Number(shareIndex),
          custodianshipCredential,
          status: 'invited',
          createdAt: new Date().toISOString(),
          unrevokable: unrevokable === true,
        },
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      return res.json({ success: true, custodianId, shareIndex: Number(shareIndex) });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'server_error';
      if (msg === 'pending_share_not_found') {
        return res.status(404).json({ error: msg });
      }
      console.error('[recovery] custodians assign:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/recovery/custodians/:custodianId/resend', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier } = req.body ?? {};
      const pn = String(userPnIdentifier || auth.pnIdentifier);
      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const row = await RecoverySheetsService.getCustodianById(
        bundle.ctx.token,
        bundle.spreadsheetId,
        req.params.custodianId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );
      if (!row || normalizeCustodianStatus(row.status) === 'revoked') {
        return res.status(404).json({ error: 'custodian_not_found' });
      }

      return res.json({
        success: true,
        custodianId: row.custodianId,
        name: row.name,
        custodianType: row.custodianType,
        shareIndex: row.shareIndex,
        custodianshipCredential: row.custodianshipCredential,
        status: row.status,
        unrevokable: row.unrevokable,
        encryptedShare: row.encryptedShare,
      });
    } catch (error: unknown) {
      console.error('[recovery] custodians resend:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/recovery/custodians/:custodianId/revoke', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, threshold } = req.body ?? {};
      const pn = String(userPnIdentifier || auth.pnIdentifier);
      const bundle = await spreadsheetForPn(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      try {
        const revoked = await RecoverySheetsService.revokeCustodian(
          bundle.ctx.token,
          bundle.spreadsheetId,
          req.params.custodianId,
          bundle.ctx.pnIdentifier,
          bundle.ctx.accountId,
          Number.isFinite(Number(threshold)) ? Number(threshold) : undefined
        );
        return res.json({ success: true, custodianId: revoked.custodianId, shareIndex: revoked.shareIndex });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'revoke_failed';
        if (msg === 'custodian_unrevokable') {
          return res.status(403).json({ error: msg });
        }
        if (msg === 'revoke_would_break_threshold') {
          return res.status(403).json({ error: msg });
        }
        if (msg === 'custodian_not_found') {
          return res.status(404).json({ error: msg });
        }
        throw e;
      }
    } catch (error: unknown) {
      console.error('[recovery] custodians revoke:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/recovery/custodians/accept', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { ownerPnIdentifier, custodianId, custodianshipZkp } = req.body ?? {};
      if (!ownerPnIdentifier || !custodianId || !custodianshipZkp) {
        return res.status(400).json({ error: 'ownerPnIdentifier, custodianId, and custodianshipZkp required' });
      }

      const verified = verifyCustodianshipCredential(custodianshipZkp);
      if (!verified.ok) {
        return res.status(400).json({ error: 'Invalid custodianship credential', reason: verified.reason });
      }
      if (verified.data?.custodianId !== custodianId) {
        return res.status(400).json({ error: 'Custodianship custodianId mismatch' });
      }

      const bundle = await spreadsheetForPn(String(ownerPnIdentifier));
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const row = await RecoverySheetsService.getCustodianById(
        bundle.ctx.token,
        bundle.spreadsheetId,
        custodianId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );
      if (!row) return res.status(404).json({ error: 'custodian_not_found' });
      if (row.custodianshipCredential && row.custodianshipCredential !== custodianshipZkp) {
        return res.status(400).json({ error: 'custodianship_mismatch' });
      }

      const accepted = await RecoverySheetsService.acceptCustodian(
        bundle.ctx.token,
        bundle.spreadsheetId,
        custodianId,
        auth.did,
        auth.pnIdentifier,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      return res.json({ success: true, status: accepted.status, custodianId: accepted.custodianId });
    } catch (error: unknown) {
      console.error('[recovery] custodians accept:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}

export async function evaluateRecoveryApprovalUpdate(params: {
  userPnIdentifier: string;
  requestId: string;
  approval: RecoveryZkApprovalPayload;
  threshold?: number;
}): Promise<{
  ok: boolean;
  status?: string;
  approvalCount?: number;
  reason?: string;
  includesUnrevokableShare?: boolean;
  error?: string;
  httpStatus?: number;
}> {
  const { verifyRecoveryApprovalPayload } = await import('./recoveryZkService');
  const verified = await verifyRecoveryApprovalPayload(params.approval);
  if (!verified.ok) {
    return { ok: false, error: 'Invalid recovery approval', reason: verified.reason, httpStatus: 400 };
  }
  if (verified.requestId && verified.requestId !== params.requestId) {
    return { ok: false, error: 'Approval requestId mismatch', httpStatus: 400 };
  }

  const bundle = await spreadsheetForPn(params.userPnIdentifier);
  if (!bundle) {
    return { ok: false, error: 'Drive not connected', httpStatus: 404 };
  }

  const custodians = await RecoverySheetsService.listCustodians(
    bundle.ctx.token,
    bundle.spreadsheetId,
    bundle.ctx.pnIdentifier,
    bundle.ctx.accountId
  );
  const custodianRow = custodians.find((c) => c.custodianId === params.approval.custodianId);
  if (!custodianRow || normalizeCustodianStatus(custodianRow.status) !== 'accepted') {
    return { ok: false, error: 'Custodian not accepted', httpStatus: 403 };
  }
  if (normalizeCustodianStatus(custodianRow.status) === 'revoked') {
    return { ok: false, error: 'Custodian revoked', httpStatus: 403 };
  }

  const requests = await RecoverySheetsService.listRecoveryRequests(
    bundle.ctx.token,
    bundle.spreadsheetId,
    bundle.ctx.pnIdentifier,
    bundle.ctx.accountId
  );
  const reqRow = requests.find((r) => r.requestId === params.requestId);
  if (!reqRow) {
    return { ok: false, error: 'Recovery request not found', httpStatus: 404 };
  }

  const approvals = JSON.parse(reqRow.sharesJson || '[]') as RecoveryZkApprovalPayload[];
  if (approvals.some((a) => a.custodianId === params.approval.custodianId)) {
    return { ok: false, error: 'Custodian already approved this request', httpStatus: 409 };
  }

  approvals.push(params.approval);
  const required = params.threshold || reqRow.threshold || 2;
  const quorum = recoveryMeetsQuorumRule({ approvals, custodians, threshold: required });
  const newStatus = quorum.ready ? 'ready' : 'pending';

  await RecoverySheetsService.upsertRecoveryRequest(
    bundle.ctx.token,
    bundle.spreadsheetId,
    { ...reqRow, sharesJson: JSON.stringify(approvals), status: newStatus },
    bundle.ctx.pnIdentifier,
    bundle.ctx.accountId
  );

  return {
    ok: true,
    status: newStatus,
    approvalCount: quorum.approvalCount,
    reason: quorum.reason,
    includesUnrevokableShare: quorum.includesUnrevokableShare,
  };
}

export async function fetchVaultSharesForRequest(params: {
  userPnIdentifier: string;
  requestId: string;
}): Promise<{ ok: boolean; httpStatus: number; body: Record<string, unknown> }> {
  const bundle = await spreadsheetForPn(params.userPnIdentifier);
  if (!bundle) {
    return { ok: false, httpStatus: 404, body: { error: 'Drive not connected' } };
  }

  const requests = await RecoverySheetsService.listRecoveryRequests(
    bundle.ctx.token,
    bundle.spreadsheetId,
    bundle.ctx.pnIdentifier,
    bundle.ctx.accountId
  );
  const reqRow = requests.find((r) => r.requestId === params.requestId);
  if (!reqRow) {
    return { ok: false, httpStatus: 404, body: { error: 'Recovery request not found' } };
  }

  const approvals = JSON.parse(reqRow.sharesJson || '[]') as RecoveryZkApprovalPayload[];
  const custodians = await RecoverySheetsService.listCustodians(
    bundle.ctx.token,
    bundle.spreadsheetId,
    bundle.ctx.pnIdentifier,
    bundle.ctx.accountId
  );

  const quorum = recoveryMeetsQuorumRule({
    approvals,
    custodians,
    threshold: reqRow.threshold || 2,
  });

  if (!quorum.ready || reqRow.status !== 'ready') {
    return {
      ok: false,
      httpStatus: 403,
      body: {
        error: quorum.reason || 'Threshold not met',
        status: reqRow.status,
        approvalCount: quorum.approvalCount,
        includesUnrevokableShare: quorum.includesUnrevokableShare,
      },
    };
  }

  const vaultShares = custodians
    .filter(
      (c) =>
        normalizeCustodianStatus(c.status) === 'accepted'
        && approvals.some(
          (a) => a.custodianId === c.custodianId || a.shareIndex === c.shareIndex
        )
    )
    .map((c) => ({
      custodianId: c.custodianId,
      shareIndex: c.shareIndex,
      encryptedShare: c.encryptedShare,
      unrevokable: c.unrevokable,
    }));

  return {
    ok: true,
    httpStatus: 200,
    body: {
      vaultShares,
      approvalCount: quorum.approvalCount,
      threshold: reqRow.threshold,
      includesUnrevokableShare: quorum.includesUnrevokableShare,
    },
  };
}

export async function getRecoveryCustodianSummary(userPnIdentifier: string) {
  const bundle = await spreadsheetForPn(userPnIdentifier);
  if (!bundle) return null;

  const [custodians, pending] = await Promise.all([
    RecoverySheetsService.listCustodians(
      bundle.ctx.token,
      bundle.spreadsheetId,
      bundle.ctx.pnIdentifier,
      bundle.ctx.accountId
    ),
    RecoverySheetsService.listPendingShares(
      bundle.ctx.token,
      bundle.spreadsheetId,
      bundle.ctx.pnIdentifier,
      bundle.ctx.accountId,
      false
    ),
  ]);

  const counts = countAcceptedCustodians(custodians);
  return {
    custodians: custodians.filter((c) => normalizeCustodianStatus(c.status) !== 'revoked'),
    pending,
    counts,
  };
}
