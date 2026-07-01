/**
 * PnDriveIndex — sole runtime source for Google Drive folder and spreadsheet IDs.
 * Written atomically at storage init; patched when API creates new resources.
 */

import { normalizePnIdentifier } from './integratorStoragePaths';
import { storageCredentialsService } from './storageCredentialsService';

export const PN_DRIVE_INDEX_SCHEMA_VERSION = 1 as const;

/** Logical sheet keys (stable); align with init and TABLE_PATHS filenames. */
export const PN_DRIVE_SHEET_KEYS = {
  CONNECTIONS: 'connections',
  THIRD_PARTY_PERMISSIONS: 'third-party-permissions',
  DEVICES: 'devices',
  GROUPS: 'groups',
  NOTIFICATIONS: 'notifications',
  ACTIVITY_LEDGER: 'activity_ledger',
  MESSAGING_LEDGER: 'messaging_ledger',
  MESSAGE_REQUESTS: 'message_requests',
  DATA_POINT_REQUESTS: 'data-point-requests',
  ZKP_DATA_POINTS: 'zkp-data-points',
  PREFERENCES: 'preferences',
  ENGAGEMENT: 'engagement',
  PRISM_LEDGER: 'prism_ledger',
  PUBLIC_FILE_INDEX: 'public-file-index',
  OWNER_FILE_INDEX: 'owner-file-index',
  FOLLOWERS: 'followers',
  FOLLOWING: 'following',
} as const;

export type PnDriveSheetKey = (typeof PN_DRIVE_SHEET_KEYS)[keyof typeof PN_DRIVE_SHEET_KEYS];

export const REQUIRED_PN_DRIVE_SHEET_KEYS: PnDriveSheetKey[] = Object.values(PN_DRIVE_SHEET_KEYS);

export interface PnDriveIndex {
  schemaVersion: typeof PN_DRIVE_INDEX_SCHEMA_VERSION;
  pnFolderId: string;
  metadataFolderId: string;
  integratorsRootId: string;
  messagesFolderId: string;
  inboxSheetId: string;
  sheetIds: Record<string, string>;
  conversationSheets: Record<string, string>;
}

export class DriveIndexError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'DRIVE_NOT_INITIALIZED'
      | 'DRIVE_INDEX_INCOMPLETE'
      | 'DRIVE_INDEX_STALE' = 'DRIVE_NOT_INITIALIZED'
  ) {
    super(message);
    this.name = 'DriveIndexError';
  }
}

/** True when indexed pN / _metadata folders still exist on Drive. */
export async function pnDriveFoldersExistOnDrive(
  accessToken: string,
  pnFolderId: string,
  metadataFolderId: string
): Promise<boolean> {
  for (const folderId of [pnFolderId, metadataFolderId]) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 404) return false;
    if (res.ok) {
      const data = (await res.json()) as { trashed?: boolean };
      if (data.trashed) return false;
    }
  }
  return true;
}

/** Remove stale pnDriveIndex from stored credentials (e.g. after Drive folders deleted). */
export async function clearPnDriveIndex(pnIdentifier: string): Promise<void> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) return;
  const credentials = { ...(record.credentials as Record<string, unknown>) };
  delete credentials.pnDriveIndex;
  delete credentials.cachedFolderIds;
  delete credentials.driveFolderId;
  await storageCredentialsService.upsertCredentials(normalized, credentials, record.cid ?? undefined);
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function readPnDriveIndex(credentials: Record<string, unknown> | null | undefined): PnDriveIndex | null {
  const raw = credentials?.pnDriveIndex;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const sheetIdsRaw = o.sheetIds;
  const sheetIds: Record<string, string> = {};
  if (sheetIdsRaw && typeof sheetIdsRaw === 'object') {
    for (const [k, v] of Object.entries(sheetIdsRaw as Record<string, unknown>)) {
      const id = pickString(v);
      if (id) sheetIds[k] = id;
    }
  }
  const convRaw = o.conversationSheets;
  const conversationSheets: Record<string, string> = {};
  if (convRaw && typeof convRaw === 'object') {
    for (const [k, v] of Object.entries(convRaw as Record<string, unknown>)) {
      const id = pickString(v);
      if (id) conversationSheets[k] = id;
    }
  }
  const pnFolderId = pickString(o.pnFolderId);
  const metadataFolderId = pickString(o.metadataFolderId);
  const integratorsRootId = pickString(o.integratorsRootId);
  const messagesFolderId = pickString(o.messagesFolderId);
  const inboxSheetId = pickString(o.inboxSheetId);
  if (!pnFolderId || !metadataFolderId || !integratorsRootId || !messagesFolderId || !inboxSheetId) {
    return null;
  }
  return {
    schemaVersion: PN_DRIVE_INDEX_SCHEMA_VERSION,
    pnFolderId,
    metadataFolderId,
    integratorsRootId,
    messagesFolderId,
    inboxSheetId,
    sheetIds,
    conversationSheets,
  };
}

export function isPnDriveIndexComplete(index: PnDriveIndex | null): index is PnDriveIndex {
  if (!index) return false;
  for (const key of REQUIRED_PN_DRIVE_SHEET_KEYS) {
    if (!index.sheetIds[key]?.trim()) return false;
  }
  return true;
}

export function assertPnDriveIndexComplete(index: PnDriveIndex | null): asserts index is PnDriveIndex {
  if (!isPnDriveIndexComplete(index)) {
    throw new DriveIndexError(
      'Google Drive index incomplete. Re-initialize storage in the dashboard.',
      'DRIVE_INDEX_INCOMPLETE'
    );
  }
}

export function getSheetIdFromIndex(index: PnDriveIndex, key: PnDriveSheetKey): string {
  const id = index.sheetIds[key];
  if (!id?.trim()) {
    throw new DriveIndexError(`Missing sheet id for ${key} in pnDriveIndex`, 'DRIVE_INDEX_INCOMPLETE');
  }
  return id;
}

export function mergePnDriveIndex(
  existing: PnDriveIndex | null,
  patch: Partial<PnDriveIndex> & { sheetIds?: Record<string, string>; conversationSheets?: Record<string, string> }
): PnDriveIndex {
  const base = existing ?? {
    schemaVersion: PN_DRIVE_INDEX_SCHEMA_VERSION,
    pnFolderId: '',
    metadataFolderId: '',
    integratorsRootId: '',
    messagesFolderId: '',
    inboxSheetId: '',
    sheetIds: {},
    conversationSheets: {},
  };
  return {
    schemaVersion: PN_DRIVE_INDEX_SCHEMA_VERSION,
    pnFolderId: patch.pnFolderId ?? base.pnFolderId,
    metadataFolderId: patch.metadataFolderId ?? base.metadataFolderId,
    integratorsRootId: patch.integratorsRootId ?? base.integratorsRootId,
    messagesFolderId: patch.messagesFolderId ?? base.messagesFolderId,
    inboxSheetId: patch.inboxSheetId ?? base.inboxSheetId,
    sheetIds: { ...base.sheetIds, ...(patch.sheetIds ?? {}) },
    conversationSheets: { ...base.conversationSheets, ...(patch.conversationSheets ?? {}) },
  };
}

export async function loadPnDriveIndex(pnIdentifier: string): Promise<PnDriveIndex | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) return null;
  return readPnDriveIndex(record.credentials as Record<string, unknown>);
}

export async function persistPnDriveIndex(
  pnIdentifier: string,
  credentials: Record<string, unknown>,
  index: PnDriveIndex
): Promise<PnDriveIndex> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  credentials.pnDriveIndex = index;
  delete credentials.cachedFolderIds;
  if (index.pnFolderId) {
    credentials.driveFolderId = index.pnFolderId;
  }
  await storageCredentialsService.upsertCredentials(normalized, credentials);
  return index;
}

export async function loadPnDriveFolders(
  pnIdentifier: string
): Promise<{ metadataFolderId: string; pnFolderId: string } | null> {
  const index = await loadPnDriveIndex(pnIdentifier);
  if (!isPnDriveIndexComplete(index)) return null;
  return { metadataFolderId: index.metadataFolderId, pnFolderId: index.pnFolderId };
}

export async function patchPnDriveIndex(
  pnIdentifier: string,
  patch: Partial<PnDriveIndex> & { sheetIds?: Record<string, string>; conversationSheets?: Record<string, string> }
): Promise<PnDriveIndex> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) {
    throw new DriveIndexError('No storage credentials', 'DRIVE_NOT_INITIALIZED');
  }
  const credentials = record.credentials as Record<string, unknown>;
  const merged = mergePnDriveIndex(readPnDriveIndex(credentials), patch);
  return persistPnDriveIndex(normalized, credentials, merged);
}
