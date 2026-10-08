/**
 * Owner index, activity ledger, and owned-asset sheets on the device.
 * Column layouts match the sheets the API used to open with a Google token.
 */

import { deviceDriveCall } from './deviceDriveCall.js';
import { appendSheetValues, readSheetValues, writeSheetValues } from './deviceSheet.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3';

export type DeviceOwnerIndexFile = {
  fileId: string;
  googleDriveFileId: string;
  visibility: string;
  uploadedAt: string;
  entry: Record<string, unknown>;
};

export type DeviceActivity = {
  activity_id: string;
  user_pn_identifier: string;
  activity_type: string;
  target_type?: string;
  target_pn_identifier?: string;
  actor_pn_identifier?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DeviceOwnedAsset = {
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
};

export type DeviceAssetDelegation = {
  id: string;
  ownedAssetId: string;
  delegateePnIdentifier: string | null;
  delegateeClientId: string | null;
  scope: string;
  expiresAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const ASSET_HEADERS = [
  'id',
  'rootPnIdentifier',
  'subjectPnIdentifier',
  'kind',
  'status',
  'metadata',
  'apiKeyId',
  'createdAt',
  'updatedAt',
  'revokedAt',
];

const DELEGATION_HEADERS = [
  'id',
  'ownedAssetId',
  'delegateePnIdentifier',
  'delegateeClientId',
  'scope',
  'expiresAt',
  'status',
  'createdAt',
  'updatedAt',
];

function jsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function ownerRow(row: string[]): DeviceOwnerIndexFile | null {
  const fileId = row[0];
  if (!fileId) return null;
  return {
    fileId,
    googleDriveFileId: row[1] || '',
    visibility: row[2] || 'private',
    uploadedAt: row[3] || '',
    entry: jsonObject(row[4]),
  };
}

function ownerValues(file: DeviceOwnerIndexFile): string[] {
  return [
    file.fileId,
    file.googleDriveFileId,
    file.visibility,
    file.uploadedAt,
    JSON.stringify(file.entry),
  ];
}

export async function listDeviceOwnerFiles(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceOwnerIndexFile[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Files!A2:E', fetchImpl);
  return rows.map(ownerRow).filter((row): row is DeviceOwnerIndexFile => !!row);
}

export async function upsertDeviceOwnerFile(
  accessToken: string,
  spreadsheetId: string,
  file: DeviceOwnerIndexFile,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Files!A2:E', fetchImpl);
  const index = rows.findIndex((row) => row[0] === file.fileId);
  const values = ownerValues(file);
  if (index < 0) {
    await appendSheetValues(accessToken, spreadsheetId, 'Files!A:E', [values], fetchImpl);
    return;
  }
  rows[index] = values;
  await writeSheetValues(accessToken, spreadsheetId, 'Files!A2:E', rows, fetchImpl);
}

/** Public-file-index row (Files!A:E — same layout as IndexSheetsService.addFile). */
export function publicIndexRowFromEntry(entry: Record<string, unknown>): string[] {
  const fileId = typeof entry.fileId === 'string' ? entry.fileId : '';
  const googleDriveFileId =
    (typeof entry.googleDriveFileId === 'string' && entry.googleDriveFileId) ||
    (typeof entry.backendFileId === 'string' && entry.backendFileId) ||
    fileId;
  const visibility = entry.isPublic === true ? 'public' : 'private';
  const uploadedAt =
    (typeof entry.uploadedAt === 'string' && entry.uploadedAt) ||
    (typeof entry.uploadDate === 'string' && entry.uploadDate) ||
    new Date().toISOString();
  const { fileId: _f, googleDriveFileId: _g, backendFileId: _b, isPublic: _p, ...rest } = entry;
  return [fileId, googleDriveFileId, visibility, uploadedAt, JSON.stringify({ fileId, ...rest })];
}

export async function upsertDevicePublicIndexFile(
  accessToken: string,
  spreadsheetId: string,
  entry: Record<string, unknown>,
  fetchImpl?: typeof fetch
): Promise<void> {
  const fileId = typeof entry.fileId === 'string' ? entry.fileId : '';
  if (!fileId) {
    throw new Error('public index row requires fileId');
  }
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Files!A2:E', fetchImpl);
  const index = rows.findIndex((row) => row[0] === fileId);
  const values = publicIndexRowFromEntry(entry);
  if (index < 0) {
    await appendSheetValues(accessToken, spreadsheetId, 'Files!A:E', [values], fetchImpl);
    return;
  }
  rows[index] = values;
  await writeSheetValues(accessToken, spreadsheetId, 'Files!A2:E', rows, fetchImpl);
}

export async function listDeviceActivities(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceActivity[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Activities!A2:H', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      activity_id: row[0] || '',
      user_pn_identifier: row[1] || '',
      activity_type: row[2] || '',
      target_type: row[3] || undefined,
      target_pn_identifier: row[4] || undefined,
      actor_pn_identifier: row[5] || undefined,
      metadata: jsonObject(row[6]),
      created_at: row[7] || '',
    }));
}

function assetFromRow(row: string[]): DeviceOwnedAsset | null {
  if (!row[0]) return null;
  return {
    id: row[0],
    rootPnIdentifier: row[1] || '',
    subjectPnIdentifier: row[2]?.trim() || null,
    kind: row[3] || '',
    status: row[4] || 'active',
    metadata: jsonObject(row[5]),
    apiKeyId: row[6]?.trim() || null,
    createdAt: row[7] || '',
    updatedAt: row[8] || '',
    revokedAt: row[9]?.trim() || null,
  };
}

function assetValues(row: DeviceOwnedAsset): string[] {
  return [
    row.id,
    row.rootPnIdentifier,
    row.subjectPnIdentifier || '',
    row.kind,
    row.status,
    JSON.stringify(row.metadata ?? {}),
    row.apiKeyId || '',
    row.createdAt,
    row.updatedAt,
    row.revokedAt || '',
  ];
}

export async function listDeviceOwnedAssets(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceOwnedAsset[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Assets!A2:J', fetchImpl);
  return rows.map(assetFromRow).filter((row): row is DeviceOwnedAsset => !!row);
}

export async function upsertDeviceOwnedAsset(
  accessToken: string,
  spreadsheetId: string,
  asset: DeviceOwnedAsset,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Assets!A2:J', fetchImpl);
  const index = rows.findIndex((row) => row[0] === asset.id);
  const values = assetValues(asset);
  if (index < 0) {
    await appendSheetValues(accessToken, spreadsheetId, 'Assets!A:J', [values], fetchImpl);
    return;
  }
  rows[index] = values;
  await writeSheetValues(accessToken, spreadsheetId, 'Assets!A2:J', rows, fetchImpl);
}

function delegationFromRow(row: string[]): DeviceAssetDelegation | null {
  if (!row[0]) return null;
  return {
    id: row[0],
    ownedAssetId: row[1] || '',
    delegateePnIdentifier: row[2]?.trim() || null,
    delegateeClientId: row[3]?.trim() || null,
    scope: row[4] || '*',
    expiresAt: row[5]?.trim() || null,
    status: row[6] || 'active',
    createdAt: row[7] || '',
    updatedAt: row[8] || '',
  };
}

function delegationValues(row: DeviceAssetDelegation): string[] {
  return [
    row.id,
    row.ownedAssetId,
    row.delegateePnIdentifier || '',
    row.delegateeClientId || '',
    row.scope,
    row.expiresAt || '',
    row.status,
    row.createdAt,
    row.updatedAt,
  ];
}

export async function listDeviceAssetDelegations(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceAssetDelegation[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Delegations!A2:I', fetchImpl);
  return rows.map(delegationFromRow).filter((row): row is DeviceAssetDelegation => !!row);
}

export async function upsertDeviceAssetDelegation(
  accessToken: string,
  spreadsheetId: string,
  delegation: DeviceAssetDelegation,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Delegations!A2:I', fetchImpl);
  const index = rows.findIndex((row) => row[0] === delegation.id);
  const values = delegationValues(delegation);
  if (index < 0) {
    await appendSheetValues(accessToken, spreadsheetId, 'Delegations!A:I', [values], fetchImpl);
    return;
  }
  rows[index] = values;
  await writeSheetValues(accessToken, spreadsheetId, 'Delegations!A2:I', rows, fetchImpl);
}

/** Find `_metadata/owned-assets.xlsx`, or create the Assets and Delegations workbook on Google. */
export async function ensureDeviceOwnedAssetsSheet(
  accessToken: string,
  metadataFolderId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const q = `name='owned-assets.xlsx' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const listed = await deviceDriveCall(
    'GET',
    `/api/drive/files?q=${encodeURIComponent(q)}&pageSize=1`,
    undefined,
    { accessToken, fetchImpl }
  );
  if (listed.ok) {
    const body = (await listed.json()) as { files?: Array<{ id?: string }> };
    const existing = body.files?.find((file) => file.id)?.id;
    if (existing) return existing;
  }

  const created = await fetchImpl(SHEETS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'owned-assets.xlsx' },
      sheets: [
        { properties: { title: 'Assets' } },
        { properties: { title: 'Delegations' } },
      ],
    }),
  });
  if (!created.ok) {
    throw new Error(`owned-assets sheet create failed (${created.status})`);
  }
  const spreadsheet = (await created.json()) as { spreadsheetId?: string };
  const spreadsheetId = spreadsheet.spreadsheetId;
  if (!spreadsheetId) throw new Error('owned-assets sheet create returned no id');

  const parentsRes = await fetchImpl(
    `${DRIVE}/files/${encodeURIComponent(spreadsheetId)}?fields=parents`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const parents = parentsRes.ok
    ? ((await parentsRes.json()) as { parents?: string[] }).parents || []
    : [];
  const move = new URLSearchParams();
  move.set('addParents', metadataFolderId);
  if (parents.length) move.set('removeParents', parents.join(','));
  await fetchImpl(`${DRIVE}/files/${encodeURIComponent(spreadsheetId)}?${move.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  await writeSheetValues(accessToken, spreadsheetId, 'Assets!A1:J1', [ASSET_HEADERS], fetchImpl);
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    'Delegations!A1:I1',
    [DELEGATION_HEADERS],
    fetchImpl
  );
  return spreadsheetId;
}

/** Same cell rewrite the API used when it still opened Drive during migration. */
export function replaceIdentityInCell(
  value: string,
  predecessorPn: string,
  successorPn: string,
  predecessorDid?: string,
  successorDid?: string
): string {
  if (!value) return value;
  let out = value;
  if (out.includes(predecessorPn)) out = out.split(predecessorPn).join(successorPn);
  const predShort = predecessorPn.replace(/^pn-/, '');
  const succShort = successorPn.replace(/^pn-/, '');
  if (predShort && out.includes(predShort)) out = out.split(predShort).join(succShort);
  if (predecessorDid && successorDid && out.includes(predecessorDid)) {
    out = out.split(predecessorDid).join(successorDid);
  }
  return out;
}

/** Replace a predecessor identity in every cell of one spreadsheet. Returns how many tabs changed. */
export async function replaceIdentityInDeviceSheet(
  accessToken: string,
  spreadsheetId: string,
  predecessorPn: string,
  successorPn: string,
  fetchImpl: typeof fetch = fetch,
  predecessorDid?: string,
  successorDid?: string
): Promise<number> {
  const meta = await fetchImpl(`${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meta.ok) return 0;
  const body = (await meta.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  let updated = 0;
  for (const sheet of body.sheets || []) {
    const title = sheet.properties?.title;
    if (!title) continue;
    const range = `'${title.replace(/'/g, "''")}'!A:Z`;
    const rows = await readSheetValues(accessToken, spreadsheetId, range, fetchImpl);
    let changed = false;
    const next = rows.map((row) =>
      row.map((cell) => {
        const next = replaceIdentityInCell(
          cell,
          predecessorPn,
          successorPn,
          predecessorDid,
          successorDid
        );
        if (next !== cell) changed = true;
        return next;
      })
    );
    if (changed) {
      await writeSheetValues(accessToken, spreadsheetId, range, next, fetchImpl);
      updated += 1;
    }
  }
  return updated;
}
