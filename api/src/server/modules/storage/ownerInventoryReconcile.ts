/**
 * Owner inventory helpers (Sheets merge + optional private blob probe).
 *
 * LIVE public posts use OAuth-less publicContentRef reconcile
 * (reconcilePublicCacheToCloud / publicCloudSot) — not this module's Drive files.get path.
 */

import {
  getContentClassOwnerIndex,
  getOwnerFileIndex,
  type DriveToken,
} from './fileIndexHelpers';
import { purgeInventoryForFileIds } from './purgeInventoryForFileIds';
import { hashIdentifier, safeLogger } from '../../../utils/logger';

export interface OwnerIndexEntry {
  fileId?: string;
  googleDriveFileId?: string;
  backendFileId?: string;
  mainFileId?: string;
  thumbnailFileId?: string;
  publicContentObjectId?: string;
  publicContentRef?: { objectId?: string };
  contentClass?: string;
  isThoughtThumbnail?: boolean;
  thought?: unknown;
  textPost?: unknown;
  collection?: { collectionFileIds?: string[] };
  collectionFileIds?: string[];
}

export interface OwnerInventoryReconcileResult {
  checked: number;
  removed: number;
  errors: number;
  removedFileIds: string[];
}

export type DriveBlobProbeResult = 'ok' | 'missing' | 'error';

/** Load merged owner-index files (content-class sheets, then root fallback). */
export async function loadMergedOwnerIndexFiles(params: {
  token: DriveToken;
  pnIdentifier: string;
  metadataFolderId: string;
  accountId?: string;
  contentClassFilter?: 'media' | 'thoughts' | 'collections';
}): Promise<OwnerIndexEntry[]> {
  const { token, pnIdentifier, metadataFolderId, accountId, contentClassFilter } = params;
  const accessToken = token.access_token;
  const contentTypes: Array<'media' | 'thoughts' | 'collections'> =
    contentClassFilter === 'media' ||
    contentClassFilter === 'thoughts' ||
    contentClassFilter === 'collections'
      ? [contentClassFilter]
      : ['media', 'thoughts', 'collections'];

  const allFiles: OwnerIndexEntry[] = [];
  for (const contentType of contentTypes) {
    const folderQuery = `name='${contentType}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folderRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!folderRes.ok) continue;
    const folderData = (await folderRes.json()) as { files?: Array<{ id: string }> };
    if (!folderData.files?.length) continue;
    const idx = await getContentClassOwnerIndex(
      token,
      folderData.files[0].id,
      pnIdentifier,
      contentType,
      accountId
    );
    if (idx?.files?.length) allFiles.push(...(idx.files as OwnerIndexEntry[]));
  }

  if (allFiles.length > 0) return allFiles;

  const rootIndex = await getOwnerFileIndex(token, metadataFolderId, pnIdentifier, accountId);
  return (rootIndex?.files as OwnerIndexEntry[]) || [];
}

export async function probeGoogleDriveBlob(
  accessToken: string,
  blobId: string
): Promise<DriveBlobProbeResult> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(blobId)}?fields=id`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 404) return 'missing';
    if (res.ok) return 'ok';
    if (res.status === 403) {
      try {
        const body = (await res.json()) as { error?: { errors?: Array<{ reason?: string }> } };
        const reason = body?.error?.errors?.[0]?.reason;
        if (reason === 'notFound') return 'missing';
      } catch {
        /* ignore */
      }
    }
    safeLogger.warn('[ownerInventoryReconcile] Drive probe non-ok', {
      blobIdHash: hashIdentifier(blobId),
      status: res.status,
    });
    return 'error';
  } catch (err) {
    safeLogger.warn('[ownerInventoryReconcile] Drive probe failed', {
      blobIdHash: hashIdentifier(blobId),
      error: err instanceof Error ? err.message : String(err),
    });
    return 'error';
  }
}

function blobIdsToProbe(entry: OwnerIndexEntry): string[] {
  const ids = new Set<string>();
  const primary = entry.googleDriveFileId || entry.backendFileId;
  if (primary) ids.add(primary);
  const contentRef =
    entry.publicContentObjectId ||
    (typeof entry.publicContentRef?.objectId === 'string' ? entry.publicContentRef.objectId : undefined);
  if (contentRef) ids.add(contentRef);
  return [...ids];
}

function inventoryIdsToPurge(entry: OwnerIndexEntry, probedMissing: string[]): string[] {
  const ids = new Set<string>(probedMissing);
  if (entry.fileId) ids.add(entry.fileId);
  if (entry.googleDriveFileId) ids.add(entry.googleDriveFileId);
  if (entry.backendFileId) ids.add(entry.backendFileId);
  if (entry.mainFileId) ids.add(entry.mainFileId);
  if (entry.thumbnailFileId) ids.add(entry.thumbnailFileId);
  const contentRef =
    entry.publicContentObjectId ||
    (typeof entry.publicContentRef?.objectId === 'string' ? entry.publicContentRef.objectId : undefined);
  if (contentRef) ids.add(contentRef);
  const collectionIds = entry.collectionFileIds || entry.collection?.collectionFileIds;
  if (Array.isArray(collectionIds)) {
    for (const id of collectionIds) {
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return [...ids];
}

function entryKey(entry: OwnerIndexEntry): string {
  return (
    entry.fileId ||
    entry.googleDriveFileId ||
    entry.backendFileId ||
    entry.publicContentObjectId ||
    ''
  );
}

/** Merge Sheets owner-index with Postgres public rows (dedupe by fileId / blob). */
export function mergeInventoryEntries(
  sheetsFiles: OwnerIndexEntry[],
  postgresPublic: OwnerIndexEntry[]
): OwnerIndexEntry[] {
  const byKey = new Map<string, OwnerIndexEntry>();

  const upsert = (entry: OwnerIndexEntry) => {
    const key = entryKey(entry);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...entry });
      return;
    }
    byKey.set(key, {
      ...existing,
      ...entry,
      fileId: existing.fileId || entry.fileId,
      googleDriveFileId: existing.googleDriveFileId || entry.googleDriveFileId,
      backendFileId: existing.backendFileId || entry.backendFileId,
      publicContentObjectId: existing.publicContentObjectId || entry.publicContentObjectId,
      publicContentRef: existing.publicContentRef || entry.publicContentRef,
      mainFileId: existing.mainFileId || entry.mainFileId,
      thumbnailFileId: existing.thumbnailFileId || entry.thumbnailFileId,
    });
  };

  for (const e of sheetsFiles) upsert(e);
  for (const e of postgresPublic) upsert(e);
  return [...byKey.values()];
}

/**
 * Probe each inventory entry's blob(s); purge when any required blob is missing.
 * Does not delete live Drive files.
 */
export async function reconcileOwnerInventory(params: {
  token: DriveToken;
  pnIdentifier: string;
  metadataFolderId: string;
  files: OwnerIndexEntry[];
  accountId?: string;
  /** Inject for tests; default probes Google Drive with token. */
  probeBlob?: (blobId: string) => Promise<DriveBlobProbeResult>;
}): Promise<OwnerInventoryReconcileResult> {
  const { token, pnIdentifier, metadataFolderId, files, accountId } = params;
  const probe =
    params.probeBlob || ((blobId: string) => probeGoogleDriveBlob(token.access_token, blobId));

  let checked = 0;
  let removed = 0;
  let errors = 0;
  const removedFileIds: string[] = [];

  for (const entry of files) {
    const probeIds = blobIdsToProbe(entry);
    if (probeIds.length === 0) {
      safeLogger.warn('[ownerInventoryReconcile] skipping entry with no blob id', {
        fileIdHash: entry.fileId ? hashIdentifier(entry.fileId) : undefined,
      });
      continue;
    }

    checked++;
    const missing: string[] = [];
    let hadError = false;
    for (const blobId of probeIds) {
      const status = await probe(blobId);
      if (status === 'missing') missing.push(blobId);
      else if (status === 'error') hadError = true;
    }

    if (missing.length === 0) {
      if (hadError) errors++;
      continue;
    }

    const ids = inventoryIdsToPurge(entry, missing);
    try {
      const result = await purgeInventoryForFileIds({
        token,
        pnIdentifier,
        metadataFolderId,
        fileIds: ids,
        accountId,
        removePostgres: true,
      });
      if (result.sheetsErrors > 0 || result.postgresErrors > 0) {
        errors++;
      }
      removed++;
      if (entry.fileId) removedFileIds.push(entry.fileId);
      else removedFileIds.push(missing[0]);
    } catch (err) {
      errors++;
      safeLogger.warn('[ownerInventoryReconcile] purge failed', {
        blobIdHash: hashIdentifier(missing[0]),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked, removed, errors, removedFileIds };
}

/** Load Postgres public rows for this owner as inventory entries. */
export async function loadOwnerPublicPostgresEntries(
  pnIdentifier: string
): Promise<OwnerIndexEntry[]> {
  const { AggregatorMetadataServiceDB } = await import('../aggregatorMetadataServiceDB');
  const rows = await AggregatorMetadataServiceDB.getInstance().listPublicInventoryBlobRefsForUser(
    pnIdentifier
  );
  return rows.map((row) => ({
    fileId: row.fileId,
    backendFileId: row.backendFileId,
    googleDriveFileId: row.googleDriveFileId || row.backendFileId,
    publicContentObjectId: row.publicContentObjectId,
    mainFileId: row.mainFileId,
    thumbnailFileId: row.thumbnailFileId,
  }));
}
