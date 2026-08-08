/**
 * Recovery request + custodian roster routes (Drive-backed).
 *
 * Companion to recoveryVaultRoutes: this module owns the request lifecycle
 * (create, list, fetch, approve) and the custodian roster read/write.
 */

import express from 'express';
import {
  evaluateRecoveryApprovalUpdate,
  fetchVaultSharesForRequest,
  getRecoveryCustodianSummary,
} from './recoveryVaultRoutes';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

export interface RecoveryRequestRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
}

export function setupRecoveryRequestRoutes(app: express.Application, deps: RecoveryRequestRouteDeps) {
  const { extractAccountId, getMetadataFolder } = deps;

  /**
   * Resolve the Drive context (token + _metadata folder) backing a user's recovery sheet.
   * Verifies the persisted pnDriveIndex still matches Drive, unlike the credentials-only
   * lookup in recoveryDriveContext.ts.
   */
  async function getRecoveryDriveContext(
    req: express.Request,
    userPnIdentifier: string
  ): Promise<{
    pnIdentifier: string;
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number };
    accountId?: string;
    metadataFolderId: string;
  } | null> {
    const { storageCredentialsService } = await import('./storageCredentialsService');
    const { resolveOwnerDriveToken } = await import('./ownerDriveToken');
    const pnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
    if (!userCredentials?.credentials) {
      return null;
    }
    const googleDriveAccounts =
      userCredentials.credentials.googleDriveAccounts ||
      (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
    if (googleDriveAccounts.length === 0) {
      return null;
    }
    const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
    const accountId = account ? extractAccountId(account) : undefined;
    let token;
    try {
      token = (await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId })).token;
    } catch {
      return null;
    }
    const folders = await getMetadataFolder(token, pnIdentifier, accountId);
    if (!folders) {
      return null;
    }
    return {
      pnIdentifier,
      token,
      accountId,
      metadataFolderId: folders.metadataFolderId
    };
  }

    // Recovery requests + custodian roster (Drive-backed)
    app.post('/api/recovery/requests', async (req, res) => {
      try {
        const {
          userPnIdentifier,
          requestId,
          publicKey,
          threshold,
          claimantName,
          status,
          requestType,
        } = req.body;
        if (!userPnIdentifier || !requestId || !publicKey) {
          return res.status(400).json({ error: 'userPnIdentifier, requestId, and publicKey are required' });
        }
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryInitiate, String(userPnIdentifier)))) {
          return;
        }
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const { getRecoveryDriveContext: getCtx } = await import('./recoveryDriveContext');
        const cloudTok = extractCloudAccessToken(req);
        const ctx = await getCtx(String(userPnIdentifier), cloudTok ? { accessToken: cloudTok } : undefined);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        const type =
          requestType === 'device_registry_reset' ? 'device_registry_reset' : 'identity_recovery';
        await RecoverySheetsService.upsertRecoveryRequest(
          ctx.token,
          spreadsheetId,
          {
            requestId,
            publicKey,
            status: status || 'pending',
            threshold: threshold || 2,
            sharesJson: '[]',
            claimantName: claimantName || '',
            createdAt: new Date().toISOString(),
            requestType: type,
          },
          ctx.pnIdentifier,
          ctx.accountId
        );
        return res.json({ success: true, spreadsheetId, requestType: type });
      } catch (error: any) {
        console.error('Error saving recovery request:', error);
        return res.status(500).json({ error: 'Failed to save recovery request' });
      }
    });

    app.get('/api/recovery/:userPnIdentifier/requests', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        const ctx = await getRecoveryDriveContext(req, userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        const requests = await RecoverySheetsService.listRecoveryRequests(
          ctx.token, spreadsheetId, ctx.pnIdentifier, ctx.accountId
        );
        return res.json({ requests });
      } catch (error: any) {
        console.error('Error listing recovery requests:', error);
        return res.status(500).json({ error: 'Failed to list recovery requests' });
      }
    });

    app.get('/api/recovery/:userPnIdentifier/requests/:requestId', async (req, res) => {
      try {
        const { userPnIdentifier, requestId } = req.params;
        const ctx = await getRecoveryDriveContext(req, userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        const requests = await RecoverySheetsService.listRecoveryRequests(
          ctx.token, spreadsheetId, ctx.pnIdentifier, ctx.accountId
        );
        const reqRow = requests.find((r) => r.requestId === requestId);
        if (!reqRow) return res.status(404).json({ error: 'Recovery request not found' });
        return res.json({ request: reqRow });
      } catch (error: any) {
        console.error('Error fetching recovery request:', error);
        return res.status(500).json({ error: 'Failed to fetch recovery request' });
      }
    });

    app.post('/api/recovery/requests/:requestId/approvals', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { userPnIdentifier, approval, threshold } = req.body;
        if (!userPnIdentifier || !approval?.approvalZkp || !approval?.custodianshipZkp || !approval?.custodianId) {
          return res.status(400).json({ error: 'userPnIdentifier and approval ZKP payload are required' });
        }
        const result = await evaluateRecoveryApprovalUpdate({
          userPnIdentifier,
          requestId,
          approval,
          threshold,
        });
        if (!result.ok) {
          return res.status(result.httpStatus || 500).json({
            error: result.error,
            reason: result.reason,
          });
        }
        return res.json({
          success: true,
          status: result.status,
          approvalCount: result.approvalCount,
          includesUnrevokableShare: result.includesUnrevokableShare,
          reason: result.reason,
        });
      } catch (error: any) {
        console.error('Error submitting recovery approval:', error);
        return res.status(500).json({ error: 'Failed to submit recovery approval' });
      }
    });

    /** @deprecated Use POST /api/recovery/requests/:requestId/approvals */
    app.post('/api/recovery/requests/:requestId/shares', async (req, res) => {
      return res.status(410).json({ error: 'Share submission deprecated; use /approvals with ZK authorization' });
    });

    app.get('/api/recovery/:userPnIdentifier/requests/:requestId/vault-shares', async (req, res) => {
      try {
        const { userPnIdentifier, requestId } = req.params;
        const result = await fetchVaultSharesForRequest({ userPnIdentifier, requestId });
        return res.status(result.httpStatus).json(result.body);
      } catch (error: any) {
        console.error('Error fetching vault shares:', error);
        return res.status(500).json({ error: 'Failed to fetch vault shares' });
      }
    });

    app.get('/api/recovery/:userPnIdentifier/custodians', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.custodiansRead, userPnIdentifier))) return;
        const summary = await getRecoveryCustodianSummary(userPnIdentifier, {
          accessToken: (await import('./cloudAccessToken')).extractCloudAccessToken(req),
        });
        if (!summary) {
          // Empty vault / no Drive under custody — not an error for unlock probes.
          return res.json({
            custodians: [],
            pending: [],
            counts: { accepted: 0, acceptedUnrevokable: 0, invited: 0 },
          });
        }
        return res.json({
          custodians: summary.custodians.map((c) => ({
            custodianId: c.custodianId,
            name: c.name,
            custodianType: c.custodianType,
            shareIndex: c.shareIndex,
            custodianshipCredential: c.custodianshipCredential,
            status: c.status,
            createdAt: c.createdAt,
            unrevokable: c.unrevokable,
            custodianPublicKey: c.custodianPublicKey,
            custodianPnIdentifier: c.custodianPnIdentifier,
          })),
          pending: summary.pending,
          counts: summary.counts,
        });
      } catch (error: any) {
        console.error('Error listing custodians:', error);
        return res.status(500).json({ error: 'Failed to list custodians' });
      }
    });

    app.post('/api/recovery/custodians', async (req, res) => {
      try {
        const {
          userPnIdentifier,
          custodianId,
          name,
          custodianType,
          encryptedShare,
          shareIndex,
          custodianshipCredential,
          unrevokable,
        } = req.body;
        if (!userPnIdentifier || !custodianId || !encryptedShare) {
          return res.status(400).json({ error: 'userPnIdentifier, custodianId, and encryptedShare are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryCustodianManage, userPnIdentifier))) return;

        if (custodianshipCredential) {
          const { verifyCustodianshipCredential } = await import('./recoveryZkService');
          const verified = verifyCustodianshipCredential(custodianshipCredential);
          if (!verified.ok) {
            return res.status(400).json({ error: 'Invalid custodianship credential', reason: verified.reason });
          }
          if (verified.data?.custodianId !== custodianId) {
            return res.status(400).json({ error: 'Custodianship custodianId mismatch' });
          }
        }
        const ctx = await getRecoveryDriveContext(req, userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        await RecoverySheetsService.upsertCustodian(
          ctx.token,
          spreadsheetId,
          {
            custodianId,
            name: name || '',
            custodianType: custodianType || 'person',
            encryptedShare,
            shareIndex: shareIndex || 0,
            custodianshipCredential: custodianshipCredential || '',
            status: 'invited',
            createdAt: new Date().toISOString(),
            unrevokable: unrevokable === true,
          },
          ctx.pnIdentifier,
          ctx.accountId
        );
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error saving custodian share:', error);
        return res.status(500).json({ error: 'Failed to save custodian' });
      }
    });
}
