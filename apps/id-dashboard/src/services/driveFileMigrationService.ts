/**
 * Full pinned Drive tree migration during identity re-key.
 */

import {
  migrateDriveEncryptedFiles,
  patchProfileJson,
  patchCompanionMetadata,
  replaceIdentityStringsInJson,
  patchPublicTokenShareEncrypted,
  isEncryptedPayloadFileName,
  isTextPatchableFileName,
  createEmptyMigrationReport,
  recordMigrationOutcome,
  type IdentityKeyMaterial,
  type MigrationReport,
} from '@par-noir/identity-migration';
import type { GoogleDriveBackend, DriveInventoryItem } from './storage/GoogleDriveBackend';
import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { ownerFetch } from './ownerApiService';

export interface DriveMigrationParams {
  migrationId: string;
  authToken: string;
  drive: GoogleDriveBackend;
  driveFolderId: string;
  predecessor: IdentityKeyMaterial;
  successor: IdentityKeyMaterial;
  onProgress: (label: string, pct: number) => void;
  acknowledgeFailures?: boolean;
}

function authHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}

async function migrationFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    method,
    headers: authHeaders(authToken, proof),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

async function patchDriveProgress(
  authToken: string,
  migrationId: string,
  driveProgress: unknown,
  migrationReport?: MigrationReport
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/drive/progress`;
  const body = { driveProgress, migrationReport };
  await migrationFetch(authToken, 'PATCH', path, body).catch(() => undefined);
}

async function migrateSheetsViaApi(authToken: string, migrationId: string): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/drive/sheets/migrate`;
  const res = await migrationFetch(authToken, 'POST', path, {});
  if (!res.ok) throw new Error('Failed to migrate metadata sheets');
}

export async function connectDriveBackendForMigration(did: string): Promise<GoogleDriveBackend | null> {
  const { GoogleDriveBackend } = await import('./storage/GoogleDriveBackend');
  const backend = new GoogleDriveBackend({ storageKeyPrefix: 'google_drive', apiEndpoint: API_ENDPOINT });
  const ok = await backend.loadEncryptedCredentials(did);
  return ok ? backend : null;
}

export async function runFullDriveMigration(params: DriveMigrationParams): Promise<{
  report: MigrationReport;
  failures: Array<{ path: string; reason: string }>;
}> {
  const {
    migrationId,
    authToken,
    drive,
    driveFolderId,
    predecessor,
    successor,
    onProgress,
  } = params;

  let report = createEmptyMigrationReport(
    migrationId,
    predecessor.pnIdentifier,
    successor.pnIdentifier
  );

  onProgress('Inventorying Drive tree…', 52);
  const inventory = await drive.listFilesRecursive(driveFolderId);
  const files = inventory.filter((i) => !i.isFolder);
  await patchDriveProgress(authToken, migrationId, { phase: 'inventory', total: files.length });

  const encryptedFiles = files.filter((f) => isEncryptedPayloadFileName(f.name));
  onProgress(`Re-encrypting payloads (0/${encryptedFiles.length})…`, 54);

  try {
    await migrateDriveEncryptedFiles(
      { did: predecessor.did, publicKey: predecessor.publicKey },
      { did: successor.did, publicKey: successor.publicKey },
      {
        listEncryptedFiles: async () =>
          encryptedFiles.map((f) => ({
            fileId: f.fileId,
            fileName: f.name,
            relativePath: f.path,
          })),
        download: async (fileId) => {
          const blob = await drive.downloadFile(fileId);
          return blob.text();
        },
        uploadReencrypted: async (fileId, pkgJson) => {
          const blob = new Blob([pkgJson], { type: 'application/json' });
          await drive.replaceFileContent(fileId, blob, 'application/json');
        },
        onProgress: (done, total, current) => {
          onProgress(`Re-encrypting ${done + 1}/${total}${current ? `: ${current}` : ''}`, 54 + Math.floor((done / Math.max(total, 1)) * 8));
        },
      }
    );
    for (const f of encryptedFiles) {
      report = recordMigrationOutcome(report, { path: f.path, fileId: f.fileId, outcome: 'migrated' });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'payload_migration_failed';
    report = recordMigrationOutcome(report, { path: '_payloads', outcome: 'failed', reason: msg });
    throw e;
  }

  onProgress('Updating JSON metadata…', 63);
  const jsonFiles = files.filter((f) => isTextPatchableFileName(f.name));
  for (let i = 0; i < jsonFiles.length; i++) {
    const f = jsonFiles[i]!;
    try {
      const raw = await (await drive.downloadFile(f.fileId)).text();
      let parsed: unknown = JSON.parse(raw);
      if (f.name === 'profile.json') {
        parsed = patchProfileJson(parsed as Record<string, unknown>, successor.pnIdentifier, successor.mlKemPublicKey);
      } else if (f.name.endsWith('.metadata.json') && (parsed as { owner?: unknown }).owner) {
        let companion = patchCompanionMetadata(
          parsed as { owner: { did?: string; identifier: string } },
          predecessor,
          successor
        );
        if ((companion as { publicToken?: unknown }).publicToken) {
          companion = {
            ...companion,
            publicToken: await patchPublicTokenShareEncrypted(
              (companion as { publicToken: NonNullable<Parameters<typeof patchPublicTokenShareEncrypted>[0]> }).publicToken,
              predecessor,
              successor
            ),
          };
        }
        parsed = companion;
      } else {
        parsed = replaceIdentityStringsInJson(
          parsed,
          predecessor.pnIdentifier,
          successor.pnIdentifier,
          predecessor.did,
          successor.did
        );
      }
      await drive.writeJsonFile(f.fileId, parsed);
      report = recordMigrationOutcome(report, { path: f.path, fileId: f.fileId, outcome: 'patched' });
    } catch (e) {
      report = recordMigrationOutcome(report, {
        path: f.path,
        fileId: f.fileId,
        outcome: 'failed',
        reason: e instanceof Error ? e.message : 'json_patch_failed',
      });
    }
    onProgress(`Updating metadata (${i + 1}/${jsonFiles.length})…`, 63 + Math.floor(((i + 1) / Math.max(jsonFiles.length, 1)) * 5));
  }

  const integratorsFolder = inventory.find((i) => i.isFolder && i.name === 'integrators');
  if (integratorsFolder) {
    const manifest = {
      migrationId,
      predecessorPnIdentifier: predecessor.pnIdentifier,
      successorPnIdentifier: successor.pnIdentifier,
      completedAt: new Date().toISOString(),
    };
    try {
      const integratorFiles = files.filter((f) => f.path.startsWith('integrators/'));
      const manifestPath = 'integrators/_pn_migration_manifest.json';
      const existingManifest = integratorFiles.find((f) => f.name === '_pn_migration_manifest.json');
      if (existingManifest) {
        await drive.writeJsonFile(existingManifest.fileId, manifest);
      } else {
        onProgress('Writing integrator migration manifest…', 69);
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
        const manifestFile = new File([manifestBlob], '_pn_migration_manifest.json', {
          type: 'application/json',
        });
        await drive.uploadFile(manifestFile, integratorsFolder.fileId);
      }
      report = recordMigrationOutcome(report, { path: 'integrators/_pn_migration_manifest.json', outcome: 'patched' });
    } catch (e) {
      report = recordMigrationOutcome(report, {
        path: 'integrators/',
        outcome: 'failed',
        reason: e instanceof Error ? e.message : 'integrator_manifest_failed',
      });
    }
  }

  onProgress('Migrating metadata sheets…', 72);
  await migrateSheetsViaApi(authToken, migrationId);
  report = recordMigrationOutcome(report, { path: '_metadata/sheets', outcome: 'patched' });

  onProgress('Publishing profile keys…', 74);
  await ownerFetch(authToken, 'POST', '/api/profile/ml-kem-public-key', {
    userPnIdentifier: successor.pnIdentifier,
    mlKemPublicKey: successor.mlKemPublicKey,
  }).catch(() => undefined);

  const newFolderName = `par Noir - ${successor.pnIdentifier}`;
  onProgress('Renaming Drive folder…', 76);
  try {
    await drive.renameFile(driveFolderId, newFolderName);
    report = recordMigrationOutcome(report, { path: '/', fileId: driveFolderId, outcome: 'patched' });
  } catch (e) {
    report = recordMigrationOutcome(report, {
      path: '/',
      outcome: 'failed',
      reason: e instanceof Error ? e.message : 'folder_rename_failed',
    });
  }

  report = { ...report, completedAt: new Date().toISOString() };

  const metadataFolder = inventory.find((i) => i.isFolder && i.name === '_metadata');
  if (metadataFolder) {
    try {
      onProgress('Writing migration report…', 77);
      const reportBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const reportFile = new File([reportBlob], `migration-${migrationId}-report.json`, {
        type: 'application/json',
      });
      await drive.uploadFile(reportFile, metadataFolder.fileId);
      report = recordMigrationOutcome(report, {
        path: `_metadata/migration-${migrationId}-report.json`,
        outcome: 'patched',
      });
    } catch (e) {
      report = recordMigrationOutcome(report, {
        path: `_metadata/migration-${migrationId}-report.json`,
        outcome: 'failed',
        reason: e instanceof Error ? e.message : 'migration_report_failed',
      });
    }
  }

  await patchDriveProgress(authToken, migrationId, { phase: 'complete' }, report);

  const failures = report.items.filter((i) => i.outcome === 'failed').map((i) => ({
    path: i.path,
    reason: i.reason || 'unknown',
  }));

  if (failures.length > 0 && !params.acknowledgeFailures) {
    throw new Error(
      `Drive migration completed with ${failures.length} failed item(s). Acknowledge to continue.`
    );
  }

  onProgress('Drive migration complete', 78);
  return { report, failures };
}

export type { DriveInventoryItem, MigrationReport };
