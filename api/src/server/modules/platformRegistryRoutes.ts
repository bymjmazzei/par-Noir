/**
 * Operator platform registry routes (developer portal, allowlisted pN only).
 */

import type { Application, Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  getDeveloperPortalClientId,
  requireDeveloperPortalClient
} from './developerSelfServiceRoutes';
import { isPlatformOperator, isPlatformRegistryConfigured } from './platformOperatorService';
import { PlatformRegistryNotConfiguredError, requirePlatformRegistryDriveContext } from './platformRegistryContext';
import { PlatformRegistrySheetsService } from './platformRegistrySheetsService';
import {
  PlatformCommercialLicenseService,
  PlatformRegistrySyncService,
  getLastPlatformRegistrySyncResult
} from './platformRegistrySyncService';
import type {
  PlatformApplication,
  PlatformCommercialLicense,
  PlatformOAuthClientRow
} from './platformRegistryTypes';
import { appendAuditEvent } from './auditService';
import { safeClientErrorMessage } from '../utils/safeError';
import { getDatabasePool } from '../utils/database';

const NODE_ENV = process.env.NODE_ENV || 'development';

function requirePlatformOperator(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const pnId = req.user?.pnIdentifier?.trim();
  if (!isPlatformOperator(pnId)) {
    res.status(403).json({
      error: 'forbidden',
      error_description: 'Platform operator access required.'
    });
    return;
  }
  next();
}

function driveToken(accessToken: string) {
  return { access_token: accessToken };
}

export function registerPlatformRegistryRoutes(app: Application): void {
  const devChain = [requireAuth, requireDeveloperPortalClient];
  const opChain = [...devChain, requirePlatformOperator];

  app.get('/api/developer/platform/access', ...devChain, (req: AuthenticatedRequest, res: Response) => {
    const pnId = req.user?.pnIdentifier?.trim();
    return res.json({
      isOperator: isPlatformOperator(pnId),
      registryConfigured: isPlatformRegistryConfigured()
    });
  });

  app.get('/api/developer/applications/mine', ...devChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ownerPn = req.user?.pnIdentifier?.trim();
      if (!ownerPn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'No pN identifier on session.' });
      }
      if (!isPlatformRegistryConfigured()) {
        return res.json({ applications: [] });
      }
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const applications = await PlatformRegistrySheetsService.listApplications(
        driveToken(ctx.accessToken),
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId,
        { ownerPnId: ownerPn.startsWith('pn-') ? ownerPn : `pn-${ownerPn}` }
      );
      return res.json({ applications });
    } catch (error: unknown) {
      if (error instanceof PlatformRegistryNotConfiguredError) {
        return res.json({ applications: [] });
      }
      console.error('[platform] applications/mine:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list applications'
      });
    }
  });

  app.post('/api/developer/platform/registry/initialize', ...opChain, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const ctx = await requirePlatformRegistryDriveContext();
      try {
        await PlatformRegistrySheetsService.getSpreadsheetId(
          driveToken(ctx.accessToken),
          ctx.metadataFolderId,
          ctx.normalizedPnIdentifier,
          ctx.accountId
        );
        return res.json({ initialized: true, message: 'Platform registry already exists.' });
      } catch {
        await PlatformRegistrySheetsService.createPlatformRegistrySheet(
          driveToken(ctx.accessToken),
          ctx.metadataFolderId,
          ctx.normalizedPnIdentifier,
          ctx.accountId
        );
        return res.status(201).json({ initialized: true, message: 'Platform registry sheet created on operator Drive.' });
      }
    } catch (error: unknown) {
      console.error('[platform] registry initialize:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to initialize registry'
      });
    }
  });

  app.get('/api/developer/platform/overview', ...opChain, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const token = driveToken(ctx.accessToken);
      const applications = await PlatformRegistrySheetsService.listApplications(
        token, spreadsheetId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const clients = await PlatformRegistrySheetsService.listOAuthClients(
        token, spreadsheetId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const licenses = await PlatformRegistrySheetsService.listCommercialLicenses(
        token, spreadsheetId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const pool = getDatabasePool();
      const syncMeta = await pool.query(`SELECT * FROM platform_registry_sync_meta WHERE id = 1`);
      const lastSync = getLastPlatformRegistrySyncResult();
      return res.json({
        pendingApplications: applications.filter((a) => a.status === 'pending').length,
        activeClients: clients.filter((c) => c.status === 'active').length,
        activeLicenses: licenses.filter((l) => l.status === 'active').length,
        lastSync: lastSync ?? (syncMeta.rows[0]
          ? {
              syncedAt: syncMeta.rows[0].last_sync_at,
              oauthClientsUpserted: syncMeta.rows[0].oauth_clients_upserted,
              licensesUpserted: syncMeta.rows[0].licenses_upserted
            }
          : null)
      });
    } catch (error: unknown) {
      console.error('[platform] overview:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to load overview'
      });
    }
  });

  app.get('/api/developer/platform/applications', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const applications = await PlatformRegistrySheetsService.listApplications(
        driveToken(ctx.accessToken),
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId,
        status === 'pending' || status === 'approved' || status === 'rejected' ? { status } : undefined
      );
      return res.json({ applications });
    } catch (error: unknown) {
      console.error('[platform] applications list:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list applications'
      });
    }
  });

  app.post('/api/developer/platform/applications/:id/approve', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorPn = req.user?.pnIdentifier?.trim();
      if (!operatorPn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'No operator pN on session.' });
      }
      const { verified, commercialLicenseId, notes } = req.body || {};
      const ctx = await requirePlatformRegistryDriveContext();
      const token = driveToken(ctx.accessToken);
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const app = await PlatformRegistrySheetsService.getApplicationById(
        token, spreadsheetId, req.params.id, ctx.normalizedPnIdentifier, ctx.accountId
      );
      if (!app) {
        return res.status(404).json({ error: 'not_found', error_description: 'Application not found.' });
      }
      if (app.status !== 'pending') {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Application is not pending.' });
      }

      const now = new Date().toISOString();
      const reviewedApp: PlatformApplication = {
        ...app,
        status: 'approved',
        reviewedAt: now,
        reviewedByPn: operatorPn.startsWith('pn-') ? operatorPn : `pn-${operatorPn}`,
        notes: typeof notes === 'string' ? notes.trim() : app.notes
      };
      await PlatformRegistrySheetsService.updateApplication(
        token, spreadsheetId, reviewedApp, ctx.normalizedPnIdentifier, ctx.accountId
      );

      const clientRow: PlatformOAuthClientRow = {
        clientId: app.clientId,
        name: app.name,
        description: app.description,
        redirectUris: app.redirectUris,
        scopes: app.scopes,
        ownerPnId: app.ownerPnId,
        status: 'active',
        verified: verified === true,
        commercialLicenseId: typeof commercialLicenseId === 'string' ? commercialLicenseId.trim() : undefined,
        approvedAt: now,
        updatedAt: now
      };
      await PlatformRegistrySheetsService.upsertOAuthClient(
        token, spreadsheetId, clientRow, ctx.normalizedPnIdentifier, ctx.accountId
      );

      const syncResult = await PlatformRegistrySyncService.syncFromDrive();

      await appendAuditEvent({
        eventType: 'oauth_client.application_approved',
        actorHint: 'platform_operator',
        subjectPnIdentifier: app.ownerPnId,
        metadata: { clientId: app.clientId, applicationId: app.applicationId, verified: verified === true }
      });

      return res.json({ application: reviewedApp, client: clientRow, sync: syncResult });
    } catch (error: unknown) {
      console.error('[platform] approve application:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to approve application'
      });
    }
  });

  app.post('/api/developer/platform/applications/:id/reject', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorPn = req.user?.pnIdentifier?.trim();
      const { notes } = req.body || {};
      const ctx = await requirePlatformRegistryDriveContext();
      const token = driveToken(ctx.accessToken);
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const app = await PlatformRegistrySheetsService.getApplicationById(
        token, spreadsheetId, req.params.id, ctx.normalizedPnIdentifier, ctx.accountId
      );
      if (!app) {
        return res.status(404).json({ error: 'not_found' });
      }
      const now = new Date().toISOString();
      const rejected: PlatformApplication = {
        ...app,
        status: 'rejected',
        reviewedAt: now,
        reviewedByPn: operatorPn?.startsWith('pn-') ? operatorPn : operatorPn ? `pn-${operatorPn}` : undefined,
        notes: typeof notes === 'string' ? notes.trim() : app.notes
      };
      await PlatformRegistrySheetsService.updateApplication(
        token, spreadsheetId, rejected, ctx.normalizedPnIdentifier, ctx.accountId
      );
      await appendAuditEvent({
        eventType: 'oauth_client.application_rejected',
        actorHint: 'platform_operator',
        subjectPnIdentifier: app.ownerPnId,
        metadata: { clientId: app.clientId, applicationId: app.applicationId }
      });
      return res.json({ application: rejected });
    } catch (error: unknown) {
      console.error('[platform] reject application:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/developer/platform/oauth-clients', ...opChain, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const clients = await PlatformRegistrySheetsService.listOAuthClients(
        driveToken(ctx.accessToken),
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      return res.json({ clients });
    } catch (error: unknown) {
      console.error('[platform] oauth-clients:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.patch('/api/developer/platform/oauth-clients/:clientId', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, verified, notes } = req.body || {};
      const ctx = await requirePlatformRegistryDriveContext();
      const token = driveToken(ctx.accessToken);
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const clients = await PlatformRegistrySheetsService.listOAuthClients(
        token, spreadsheetId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const existing = clients.find((c) => c.clientId === req.params.clientId);
      if (!existing) {
        return res.status(404).json({ error: 'not_found' });
      }
      const updated: PlatformOAuthClientRow = {
        ...existing,
        status: status === 'active' || status === 'suspended' || status === 'revoked' ? status : existing.status,
        verified: typeof verified === 'boolean' ? verified : existing.verified,
        notes: typeof notes === 'string' ? notes.trim() : existing.notes,
        updatedAt: new Date().toISOString()
      };
      await PlatformRegistrySheetsService.upsertOAuthClient(
        token, spreadsheetId, updated, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const syncResult = await PlatformRegistrySyncService.syncFromDrive();
      return res.json({ client: updated, sync: syncResult });
    } catch (error: unknown) {
      console.error('[platform] patch oauth-client:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/developer/platform/licenses', ...opChain, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const licenses = await PlatformRegistrySheetsService.listCommercialLicenses(
        driveToken(ctx.accessToken),
        spreadsheetId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      return res.json({ licenses });
    } catch (error: unknown) {
      console.error('[platform] licenses list:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/developer/platform/licenses', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const granteePnId = typeof body.granteePnId === 'string' ? body.granteePnId.trim() : '';
      if (!granteePnId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'granteePnId is required' });
      }
      const now = new Date().toISOString();
      const licenseId =
        typeof body.licenseId === 'string' && body.licenseId.trim()
          ? body.licenseId.trim()
          : `lic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const license: PlatformCommercialLicense = {
        licenseId,
        granteePnId: granteePnId.startsWith('pn-') ? granteePnId : `pn-${granteePnId}`,
        granteeClientId: typeof body.granteeClientId === 'string' ? body.granteeClientId.trim() : undefined,
        tier: body.tier === 'free' ? 'free' : 'commercial',
        type: body.type === 'perpetual' ? 'perpetual' : 'annual',
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        rateLimits: {
          requestsPerMinute: typeof body.requestsPerMinute === 'number' ? body.requestsPerMinute : 500,
          requestsPerDay: typeof body.requestsPerDay === 'number' ? body.requestsPerDay : 100000
        },
        status: 'active',
        issuedAt: now,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
        notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
        updatedAt: now
      };
      const ctx = await requirePlatformRegistryDriveContext();
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        driveToken(ctx.accessToken),
        ctx.metadataFolderId,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      await PlatformRegistrySheetsService.upsertCommercialLicense(
        driveToken(ctx.accessToken),
        spreadsheetId,
        license,
        ctx.normalizedPnIdentifier,
        ctx.accountId
      );
      const syncResult = await PlatformRegistrySyncService.syncFromDrive();
      await appendAuditEvent({
        eventType: 'platform_license.issued',
        actorHint: 'platform_operator',
        subjectPnIdentifier: license.granteePnId,
        metadata: { licenseId: license.licenseId }
      });
      return res.status(201).json({ license, sync: syncResult });
    } catch (error: unknown) {
      console.error('[platform] create license:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.patch('/api/developer/platform/licenses/:licenseId', ...opChain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ctx = await requirePlatformRegistryDriveContext();
      const token = driveToken(ctx.accessToken);
      const spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
        token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const licenses = await PlatformRegistrySheetsService.listCommercialLicenses(
        token, spreadsheetId, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const existing = licenses.find((l) => l.licenseId === req.params.licenseId);
      if (!existing) {
        return res.status(404).json({ error: 'not_found' });
      }
      const body = req.body || {};
      const updated: PlatformCommercialLicense = {
        ...existing,
        status:
          body.status === 'active' || body.status === 'suspended' || body.status === 'revoked' || body.status === 'expired'
            ? body.status
            : existing.status,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : existing.expiresAt,
        notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
        updatedAt: new Date().toISOString()
      };
      await PlatformRegistrySheetsService.upsertCommercialLicense(
        token, spreadsheetId, updated, ctx.normalizedPnIdentifier, ctx.accountId
      );
      const syncResult = await PlatformRegistrySyncService.syncFromDrive();
      return res.json({ license: updated, sync: syncResult });
    } catch (error: unknown) {
      console.error('[platform] patch license:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/developer/platform/registry/sync', ...opChain, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const syncResult = await PlatformRegistrySyncService.syncFromDrive();
      return res.json({ sync: syncResult });
    } catch (error: unknown) {
      console.error('[platform] manual sync:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Sync failed'
      });
    }
  });
}
