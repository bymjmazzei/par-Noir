/**
 * Owner-authenticated identity re-key migration routes.
 * Crypto runs client-side; API tracks steps and registers succession on complete.
 */

import type { Application, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabasePool } from '../utils/database';
import { PNOAuthService } from './pnOAuthService';
import { storageCredentialsService } from './storageCredentialsService';
import { registerSuccession } from './identitySuccessionService';
import { appendAuditEvent } from './auditService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUIRED_STEPS = [
  'drive_files',
  'zkp_reissue',
  'recovery_vault',
  'dm_rekey',
  'group_rewrap',
  'profile_publish',
  'custodian_reinvite',
  'lineage_zkp',
] as const;

async function resolveMigrationDriveAccess(migrationId: string): Promise<{
  pred: string;
  succ: string;
  token: { access_token: string; refresh_token?: string };
  accountId?: string;
  folders: { metadataFolderId: string; pnFolderId: string };
  pinnedFolderId: string | null;
} | null> {
  const row = await getMigrationRow(migrationId);
  if (!row) return null;
  const pred = normalizePn(row.predecessor_pn_identifier);
  const succ = normalizePn(row.successor_pn_identifier);
  const creds = await storageCredentialsService.getCredentials(pred);
  if (!creds?.credentials) return null;
  const accounts = creds.credentials.googleDriveAccounts
    || (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
  const account = accounts[0];
  if (!account) return null;
  const token = {
    access_token: account.access_token || account.accessToken,
    refresh_token: account.refresh_token || account.refreshToken,
  };
  const pinned =
    (row.pinned_drive_folder_id as string | null)
    || (await storageCredentialsService.getDriveFolderId(pred));
  const { resolvePnDriveFolders } = await import('./resolvePnDriveFolders');
  const folders = await resolvePnDriveFolders(token, pred, account.accountId, pinned);
  if (!folders) return null;
  return {
    pred,
    succ,
    token,
    accountId: account.accountId,
    folders,
    pinnedFolderId: pinned,
  };
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

function bearerPn(req: Request): { pnIdentifier: string; did?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  return {
    pnIdentifier: normalizePn(payload.pnIdentifier),
    did: payload.did,
  };
}

async function verifyLineageProofs(
  predecessorProof: string,
  successorProof: string,
  migrationId: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { verifyLineageZkpPair } = await import('@par-noir/identity-migration');
    return verifyLineageZkpPair(
      { predecessorProof, successorProof },
      migrationId
    );
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function getMigrationRow(migrationId: string) {
  const db = getDatabasePool();
  const r = await db.query(`SELECT * FROM pn_identity_migration WHERE id = $1`, [migrationId]);
  return r.rows[0] ?? null;
}

const LINEAGE_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

/** Completed migration with lineage proofs for integrator ZKP grace window. */
export async function findLineageMigrationForSuccessor(
  successorPnIdentifier: string
): Promise<{
  migrationId: string;
  predecessorPnIdentifier: string;
  completedAt: string;
  lineagePredecessorProof: string;
} | null> {
  const succ = normalizePn(successorPnIdentifier);
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT id, predecessor_pn_identifier, completed_at, lineage_predecessor_proof
     FROM pn_identity_migration
     WHERE successor_pn_identifier = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [succ]
  );
  const row = r.rows[0];
  if (!row?.lineage_predecessor_proof || !row.completed_at) return null;
  const completedAt = new Date(row.completed_at as Date).getTime();
  if (Date.now() - completedAt > LINEAGE_GRACE_MS) return null;
  return {
    migrationId: String(row.id),
    predecessorPnIdentifier: normalizePn(String(row.predecessor_pn_identifier)),
    completedAt: new Date(row.completed_at as Date).toISOString(),
    lineagePredecessorProof: String(row.lineage_predecessor_proof),
  };
}

export function registerIdentityMigrationRoutes(app: Application): void {
  /** POST /api/identity/migration/start */
  app.post('/api/identity/migration/start', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) {
        return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
      }
      const {
        predecessorPnIdentifier,
        successorPnIdentifier,
        predecessorDid,
        successorDid,
        migrationId: clientMigrationId,
      } = req.body ?? {};

      const pred = normalizePn(String(predecessorPnIdentifier || ''));
      const succ = normalizePn(String(successorPnIdentifier || ''));
      if (!predecessorPnIdentifier || !successorPnIdentifier || pred === succ) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'predecessorPnIdentifier and successorPnIdentifier are required and must differ',
        });
      }
      if (auth.pnIdentifier !== succ && auth.pnIdentifier !== pred) {
        return res.status(403).json({
          error: 'forbidden',
          error_description: 'Token must be for predecessor or successor identity',
        });
      }

      const migrationId = typeof clientMigrationId === 'string' && clientMigrationId.length > 0
        ? clientMigrationId
        : `mig_${randomUUID().replace(/-/g, '')}`;

      const pinnedFolderId = await storageCredentialsService.getDriveFolderId(pred);

      const db = getDatabasePool();
      await db.query(
        `INSERT INTO pn_identity_migration (
          id, predecessor_pn_identifier, successor_pn_identifier, predecessor_did, successor_did, status, completed_steps, pinned_drive_folder_id
        ) VALUES ($1, $2, $3, $4, $5, 'in_progress', '[]'::jsonb, $6)
        ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), pinned_drive_folder_id = COALESCE(EXCLUDED.pinned_drive_folder_id, pn_identity_migration.pinned_drive_folder_id)`,
        [
          migrationId,
          pred,
          succ,
          typeof predecessorDid === 'string' ? predecessorDid : null,
          typeof successorDid === 'string' ? successorDid : null,
          pinnedFolderId,
        ]
      );

      return res.status(201).json({
        migrationId,
        predecessorPnIdentifier: pred,
        successorPnIdentifier: succ,
        driveFolderId: pinnedFolderId,
        requiredSteps: [...REQUIRED_STEPS, 'succession_register'],
        checklist: {
          drive_files: 'Re-encrypt Drive files client-side',
          zkp_reissue: 'Re-issue ZK proofs',
          recovery_vault: 'Rebuild recovery vault',
          dm_rekey: 'Re-key DM sessions',
          group_rewrap: 'Re-wrap group chat keys',
          profile_publish: 'Publish new mlKemPublicKey on profile.json',
          custodian_reinvite: 'Re-invite recovery custodians to meet threshold',
          lineage_zkp: 'Dual-sign identity succession ZK proofs',
          succession_register: 'Complete migration (registers network succession)',
        },
      });
    } catch (error: unknown) {
      console.error('[migration] start:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production'),
      });
    }
  });

  /** GET /api/identity/migration/:id */
  app.get('/api/identity/migration/:id', async (req: Request, res: Response) => {
    try {
      const row = await getMigrationRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });
      return res.json({
        migrationId: row.id,
        status: row.status,
        predecessorPnIdentifier: row.predecessor_pn_identifier,
        successorPnIdentifier: row.successor_pn_identifier,
        completedSteps: row.completed_steps ?? [],
        driveProgress: row.drive_progress ?? null,
        migrationReport: row.migration_report ?? null,
        pinnedDriveFolderId: row.pinned_drive_folder_id ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
      });
    } catch (error: unknown) {
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** PATCH /api/identity/migration/:id/steps/:stepId */
  app.patch('/api/identity/migration/:id/steps/:stepId', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const migrationId = req.params.id;
      const stepId = req.params.stepId;
      const row = await getMigrationRow(migrationId);
      if (!row) return res.status(404).json({ error: 'not_found' });

      const pred = normalizePn(row.predecessor_pn_identifier);
      const succ = normalizePn(row.successor_pn_identifier);
      if (auth.pnIdentifier !== pred && auth.pnIdentifier !== succ) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const completed: string[] = Array.isArray(row.completed_steps) ? [...row.completed_steps] : [];
      if (!completed.includes(stepId)) completed.push(stepId);

      const db = getDatabasePool();
      await db.query(
        `UPDATE pn_identity_migration SET completed_steps = $2::jsonb, updated_at = NOW() WHERE id = $1`,
        [migrationId, JSON.stringify(completed)]
      );

      return res.json({ migrationId, stepId, completedSteps: completed });
    } catch (error: unknown) {
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/connections/rekey */
  app.post('/api/identity/migration/:id/connections/rekey', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { connectionId, userPnIdentifier, kemCiphertext } = req.body ?? {};
      if (!connectionId || !userPnIdentifier || !kemCiphertext) {
        return res.status(400).json({ error: 'connectionId, userPnIdentifier, and kemCiphertext required' });
      }

      const row = await getMigrationRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'not_found' });

      const pn = normalizePn(String(userPnIdentifier));
      const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
      const { resolvePnDriveFolders } = await import('./resolvePnDriveFolders');
      const creds = await storageCredentialsService.getCredentials(pn);
      if (!creds?.credentials) return res.status(404).json({ error: 'Drive not connected' });

      const accounts = creds.credentials.googleDriveAccounts
        || (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
      if (!accounts.length) return res.status(404).json({ error: 'Drive not connected' });

      const account = accounts[0];
      const token = {
        access_token: account.access_token || account.accessToken,
        refresh_token: account.refresh_token || account.refreshToken,
      };
      const pinned = await storageCredentialsService.getDriveFolderId(pn);
      const folders = await resolvePnDriveFolders(token, pn, account.accountId, pinned);
      if (!folders) return res.status(404).json({ error: 'Drive folders not found' });

      const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
        token,
        folders.metadataFolderId,
        pn,
        account.accountId
      );
      await ConnectionsSheetsService.updateConnectionStatus(
        token,
        spreadsheetId,
        String(connectionId),
        'accepted',
        pn,
        account.accountId,
        new Date().toISOString(),
        undefined,
        String(kemCiphertext)
      );

      return res.json({ success: true, connectionId });
    } catch (error: unknown) {
      console.error('[migration] connections/rekey:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/groups/rewrap */
  app.post('/api/identity/migration/:id/groups/rewrap', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { ownerPnIdentifier, groupId, keyRotation } = req.body ?? {};
      if (!ownerPnIdentifier || !groupId || !Array.isArray(keyRotation)) {
        return res.status(400).json({ error: 'ownerPnIdentifier, groupId, and keyRotation required' });
      }

      const ownerPn = normalizePn(String(ownerPnIdentifier));
      const creds = await storageCredentialsService.getCredentials(ownerPn);
      if (!creds?.credentials) return res.status(404).json({ error: 'Drive not connected' });

      const accounts = creds.credentials.googleDriveAccounts
        || (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
      const account = accounts[0];
      const token = {
        access_token: account.access_token || account.accessToken,
        refresh_token: account.refresh_token || account.refreshToken,
      };
      const { resolvePnDriveFolders } = await import('./resolvePnDriveFolders');
      const pinned = await storageCredentialsService.getDriveFolderId(ownerPn);
      const folders = await resolvePnDriveFolders(token, ownerPn, account.accountId, pinned);
      if (!folders) return res.status(404).json({ error: 'Drive folders not found' });

      const { GroupSheetsService } = await import('./groupSheetsService');
      const spreadsheetId = await GroupSheetsService.getOrCreateGroupsSheet(
        token,
        folders.metadataFolderId,
        ownerPn,
        account.accountId
      );

      const successorOwnerPn = normalizePn(String(req.body.successorOwnerPnIdentifier || ownerPn));
      await GroupSheetsService.rewrapGroupKeysForMigration(
        token,
        spreadsheetId,
        String(groupId),
        successorOwnerPn,
        keyRotation,
        ownerPn,
        account.accountId
      );

      return res.json({ success: true, groupId });
    } catch (error: unknown) {
      console.error('[migration] groups/rewrap:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/zkp-data-points/batch */
  app.post('/api/identity/migration/:id/zkp-data-points/batch', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, updates } = req.body ?? {};
      if (!userPnIdentifier || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'userPnIdentifier and updates array required' });
      }

      const pn = normalizePn(String(userPnIdentifier));
      const creds = await storageCredentialsService.getCredentials(pn);
      if (!creds?.credentials) return res.status(404).json({ error: 'Drive not connected' });

      const accounts = creds.credentials.googleDriveAccounts
        || (creds.credentials.googleDrive ? [creds.credentials.googleDrive] : []);
      const account = accounts[0];
      const token = { access_token: account.access_token || account.accessToken };
      const { resolvePnDriveFolders } = await import('./resolvePnDriveFolders');
      const pinned = await storageCredentialsService.getDriveFolderId(pn);
      const folders = await resolvePnDriveFolders(token, pn, account.accountId, pinned);
      if (!folders) return res.status(404).json({ error: 'Drive folders not found' });

      const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
      const spreadsheetId = await ZKPDataPointsSheetsService.getZKPDataPointsSheet(
        token,
        folders.metadataFolderId,
        pn,
        account.accountId
      );

      let count = 0;
      for (const u of updates) {
        if (!u?.dataPointId || !u?.zkpProof) continue;
        await ZKPDataPointsSheetsService.addZKPDataPoint(
          token,
          spreadsheetId,
          {
            dataPointId: u.dataPointId,
            proofType: u.proofType || 'identity_verification',
            zkpProof: u.zkpProof,
            signature: u.zkpProof,
            verifiedAt: u.verifiedAt || new Date().toISOString(),
            expiresAt: u.expiresAt,
            verificationLevel: u.verificationLevel || 'verified',
            metadata: u.metadata || { provider: 'migration' },
            encryptedUserData: u.encryptedUserData,
          },
          pn,
          account.accountId
        );
        count++;
      }

      return res.json({ success: true, updated: count });
    } catch (error: unknown) {
      console.error('[migration] zkp batch:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/recovery/custodians */
  app.post('/api/identity/migration/:id/recovery/custodians', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, custodians } = req.body ?? {};
      if (!userPnIdentifier || !Array.isArray(custodians)) {
        return res.status(400).json({ error: 'userPnIdentifier and custodians array required' });
      }

      const drive = await resolveMigrationDriveAccess(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not connected' });

      const pn = normalizePn(String(userPnIdentifier));
      const { RecoverySheetsService } = await import('./recoverySheetsService');
      const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
        drive.token,
        drive.folders.metadataFolderId,
        pn,
        drive.accountId
      );

      let count = 0;
      for (const c of custodians) {
        if (!c?.custodianId) continue;
        const status = c.status || 'active';
        if (status === 'active' && !c.custodianshipCredential) {
          return res.status(400).json({ error: 'custodianshipCredential required for active custodians' });
        }
        await RecoverySheetsService.upsertCustodian(
          drive.token,
          spreadsheetId,
          {
            custodianId: c.custodianId,
            name: c.name || c.custodianId,
            custodianType: c.custodianType || c.type || 'person',
            status,
            shareIndex: Number(c.shareIndex) || 0,
            custodianshipCredential: c.custodianshipCredential || '',
            encryptedShare: c.encryptedShare || '',
            createdAt: c.createdAt || new Date().toISOString(),
          },
          pn,
          drive.accountId
        );
        count++;
      }

      return res.json({ success: true, updated: count });
    } catch (error: unknown) {
      console.error('[migration] recovery custodians:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** PATCH /api/identity/migration/:id/drive/progress */
  app.patch('/api/identity/migration/:id/drive/progress', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { driveProgress, migrationReport } = req.body ?? {};
      const db = getDatabasePool();
      await db.query(
        `UPDATE pn_identity_migration SET
          drive_progress = COALESCE($2::jsonb, drive_progress),
          migration_report = COALESCE($3::jsonb, migration_report),
          updated_at = NOW()
        WHERE id = $1`,
        [
          req.params.id,
          driveProgress ? JSON.stringify(driveProgress) : null,
          migrationReport ? JSON.stringify(migrationReport) : null,
        ]
      );
      return res.json({ success: true });
    } catch (error: unknown) {
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/drive/sheets/migrate */
  app.post('/api/identity/migration/:id/drive/sheets/migrate', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const drive = await resolveMigrationDriveAccess(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not connected' });

      const row = await getMigrationRow(req.params.id);
      let messagesFolderId: string | null = null;
      try {
        const q = `name='par-noir-messages' and '${drive.folders.pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`;
        const resFolder = await fetch(url, { headers: { Authorization: `Bearer ${drive.token.access_token}` } });
        if (resFolder.ok) {
          const data = (await resFolder.json()) as { files?: Array<{ id: string }> };
          messagesFolderId = data.files?.[0]?.id ?? null;
        }
      } catch {
        /* optional */
      }

      const { migrateMetadataSheetsPn } = await import('./driveMigrationSheetsService');
      const result = await migrateMetadataSheetsPn(
        drive.token,
        drive.folders.metadataFolderId,
        messagesFolderId,
        drive.pred,
        drive.succ,
        drive.accountId,
        row?.predecessor_did ?? undefined,
        row?.successor_did ?? undefined
      );

      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      console.error('[migration] drive/sheets/migrate:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/drive/messages/rows */
  app.post('/api/identity/migration/:id/drive/messages/rows', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) return res.status(401).json({ error: 'unauthorized' });

      const { connectionId, kemCiphertext, rowUpdates } = req.body ?? {};
      if (!connectionId || !Array.isArray(rowUpdates)) {
        return res.status(400).json({ error: 'connectionId and rowUpdates required' });
      }

      const drive = await resolveMigrationDriveAccess(req.params.id);
      if (!drive) return res.status(404).json({ error: 'Drive not connected' });

      if (kemCiphertext) {
        const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
        const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
          drive.token,
          drive.folders.metadataFolderId,
          drive.succ,
          drive.accountId
        );
        await ConnectionsSheetsService.updateConnectionStatus(
          drive.token,
          spreadsheetId,
          String(connectionId),
          'accepted',
          drive.succ,
          drive.accountId,
          new Date().toISOString(),
          undefined,
          String(kemCiphertext)
        );
      }

      return res.json({ success: true, updated: rowUpdates.length });
    } catch (error: unknown) {
      console.error('[migration] drive/messages/rows:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** POST /api/identity/migration/:id/complete */
  app.post('/api/identity/migration/:id/complete', async (req: Request, res: Response) => {
    try {
      const auth = bearerPn(req);
      if (!auth) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const migrationId = req.params.id;
      const { lineagePredecessorProof, lineageSuccessorProof, driveFolderId, successorPublicKey } = req.body ?? {};

      const row = await getMigrationRow(migrationId);
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'completed') {
        return res.json({ success: true, alreadyCompleted: true });
      }

      const succ = normalizePn(row.successor_pn_identifier);
      if (auth.pnIdentifier !== succ) {
        return res.status(403).json({
          error: 'forbidden',
          error_description: 'Complete must be called with successor OAuth token',
        });
      }

      if (!lineagePredecessorProof || !lineageSuccessorProof) {
        return res.status(400).json({ error: 'lineage ZK proofs required' });
      }

      const lineageCheck = await verifyLineageProofs(
        String(lineagePredecessorProof),
        String(lineageSuccessorProof),
        migrationId
      );
      if (!lineageCheck.ok) {
        return res.status(400).json({ error: 'invalid_lineage_zkp', reason: lineageCheck.reason });
      }

      const completed: string[] = Array.isArray(row.completed_steps) ? row.completed_steps : [];
      const missing = REQUIRED_STEPS.filter((s) => !completed.includes(s));
      if (missing.length > 0) {
        return res.status(400).json({ error: 'incomplete_steps', missing });
      }

      const pred = normalizePn(row.predecessor_pn_identifier);
      await registerSuccession({
        predecessorPnIdentifier: pred,
        successorPnIdentifier: succ,
        predecessorDid: row.predecessor_did ?? undefined,
        successorDid: row.successor_did ?? undefined,
        migrationId,
        reason: 'rekey_migration',
        migrateBindings: true,
        successorPublicKey: typeof successorPublicKey === 'string' ? successorPublicKey : undefined,
      });

      if (driveFolderId && typeof driveFolderId === 'string') {
        const existing = await storageCredentialsService.getCredentials(succ);
        if (existing?.credentials) {
          await storageCredentialsService.upsertCredentials(succ, {
            ...existing.credentials,
            driveFolderId,
            ...(successorPublicKey ? { publicKey: successorPublicKey } : {}),
          });
        }
      }

      const db = getDatabasePool();
      await db.query(
        `UPDATE pn_identity_migration SET
          status = 'completed',
          lineage_predecessor_proof = $2,
          lineage_successor_proof = $3,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1`,
        [migrationId, lineagePredecessorProof, lineageSuccessorProof]
      );

      await appendAuditEvent({
        eventType: 'identity.migration.completed',
        actorHint: 'owner',
        subjectPnIdentifier: pred,
        metadata: { migrationId, successorPnIdentifier: succ },
      });

      return res.json({ success: true, migrationId, successorPnIdentifier: succ });
    } catch (error: unknown) {
      console.error('[migration] complete:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production'),
      });
    }
  });
}
