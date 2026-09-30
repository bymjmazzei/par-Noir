/**
 * Owned-asset registry on the device sheet. The API stores the sheet id only.
 */

import {
  ensureDeviceOwnedAssetsSheet,
  listDeviceAssetDelegations,
  listDeviceOwnedAssets,
  setSessionDriveIndex,
  upsertDeviceAssetDelegation,
  upsertDeviceOwnedAsset,
  type DeviceAssetDelegation,
  type DeviceOwnedAsset,
} from '@par-noir/device-cloud-credentials';
import { ownerFetch } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';
import { isDriveLayoutInitActive } from './storage/driveLayoutInitGate';

export interface OwnedAssetDto {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: string;
  status: string;
  metadata: Record<string, unknown>;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

function pnKey(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

async function ownedAssetsWorkbook(
  apiToken: string,
  pnIdentifier: string
): Promise<{ accessToken: string; spreadsheetId: string }> {
  const key = pnKey(pnIdentifier);
  const drive = await sessionDriveFor(key, apiToken);
  let spreadsheetId = drive.index.sheetIds['owned-assets'];
  if (!spreadsheetId) {
    spreadsheetId = await ensureDeviceOwnedAssetsSheet(
      drive.accessToken,
      drive.index.metadataFolderId
    );
    const next = {
      ...drive.index,
      sheetIds: { ...drive.index.sheetIds, 'owned-assets': spreadsheetId },
    };
    setSessionDriveIndex(key, next);
    await ownerFetch(
      apiToken,
      'POST',
      `/api/storage/initialize/${encodeURIComponent(key)}`,
      { pnDriveIndex: next },
      { pnIdentifier: key }
    );
  }
  return { accessToken: drive.accessToken, spreadsheetId };
}

const ownedAssetsInFlight = new Map<string, Promise<OwnedAssetDto[]>>();

export async function fetchOwnedAssets(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<OwnedAssetDto[]> {
  const key = pnKey(pnIdentifier);
  if (!opts?.force && isDriveLayoutInitActive()) return [];

  const existing = ownedAssetsInFlight.get(key);
  if (existing && !opts?.force) return existing;

  const run = (async (): Promise<OwnedAssetDto[]> => {
    if (!opts?.force && isDriveLayoutInitActive()) return [];
    const book = await ownedAssetsWorkbook(accessToken, key);
    return listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  })();

  ownedAssetsInFlight.set(key, run);
  try {
    return await run;
  } catch {
    return [];
  } finally {
    if (ownedAssetsInFlight.get(key) === run) ownedAssetsInFlight.delete(key);
  }
}

export async function createOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  body: {
    kind: string;
    subjectPnIdentifier?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<OwnedAssetDto> {
  const key = pnKey(pnIdentifier);
  const book = await ownedAssetsWorkbook(accessToken, key);
  const now = new Date().toISOString();
  const asset: DeviceOwnedAsset = {
    id: crypto.randomUUID(),
    rootPnIdentifier: key,
    subjectPnIdentifier: body.subjectPnIdentifier ?? null,
    kind: body.kind,
    status: 'active',
    metadata: body.metadata ?? {},
    apiKeyId: null,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  };
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, asset);
  return asset;
}

export async function rekeyOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string,
  body: {
    newSubjectPnIdentifier: string;
    newSubjectPublicKey?: string;
    reason?: string;
    migrateDelegations?: boolean;
  }
): Promise<OwnedAssetDto> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const assets = await listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  const current = assets.find((asset) => asset.id === id);
  if (!current) throw new Error('owned asset not found');
  const next: DeviceOwnedAsset = {
    ...current,
    subjectPnIdentifier: body.newSubjectPnIdentifier,
    updatedAt: new Date().toISOString(),
  };
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, next);
  return next;
}

export async function revokeOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string
): Promise<void> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const assets = await listDeviceOwnedAssets(book.accessToken, book.spreadsheetId);
  const current = assets.find((asset) => asset.id === id);
  if (!current) return;
  const now = new Date().toISOString();
  await upsertDeviceOwnedAsset(book.accessToken, book.spreadsheetId, {
    ...current,
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
}

export async function auditSubExport(
  _accessToken: string,
  _pnIdentifier: string,
  _assetId: string
): Promise<void> {
  /* Audit rows stay on the device sheet with the asset. No API Drive open. */
}

export async function fetchDelegations(
  accessToken: string,
  pnIdentifier: string,
  assetId: string
) {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const rows = await listDeviceAssetDelegations(book.accessToken, book.spreadsheetId);
  return {
    delegations: rows
      .filter((row) => row.ownedAssetId === assetId)
      .map((row) => ({
        id: row.id,
        delegateePnIdentifier: row.delegateePnIdentifier,
        delegateeClientId: row.delegateeClientId,
        scope: row.scope,
        expiresAt: row.expiresAt,
        status: row.status,
        createdAt: row.createdAt,
      })),
  };
}

export async function createDelegation(
  accessToken: string,
  pnIdentifier: string,
  assetId: string,
  body: {
    delegateePnIdentifier?: string;
    delegateeClientId?: string;
    scope?: string;
    expiresAt?: string | null;
  }
): Promise<string> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const now = new Date().toISOString();
  const row: DeviceAssetDelegation = {
    id: crypto.randomUUID(),
    ownedAssetId: assetId,
    delegateePnIdentifier: body.delegateePnIdentifier ?? null,
    delegateeClientId: body.delegateeClientId ?? null,
    scope: body.scope || '*',
    expiresAt: body.expiresAt ?? null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, row);
  return row.id;
}

export async function revokeDelegation(
  accessToken: string,
  pnIdentifier: string,
  delegationId: string
): Promise<void> {
  const book = await ownedAssetsWorkbook(accessToken, pnIdentifier);
  const rows = await listDeviceAssetDelegations(book.accessToken, book.spreadsheetId);
  const current = rows.find((row) => row.id === delegationId);
  if (!current) return;
  await upsertDeviceAssetDelegation(book.accessToken, book.spreadsheetId, {
    ...current,
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  });
}
