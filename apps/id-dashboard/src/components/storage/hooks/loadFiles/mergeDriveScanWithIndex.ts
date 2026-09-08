/**
 * Merges a backend's owner index with an optional live Google Drive scan.
 *
 * When verifyWithDrive is true, discovers Drive files that the index does not
 * know about. Orphan inventory cleanup (index row, blob gone) is owned by
 * POST /api/storage/owner-index/:id/reconcile — this module does not filter or
 * delete ghosts from Sheets.
 */
import React from 'react';
import { GoogleDriveBackend } from '../../../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../../../types/aggregator';
import { normalizeVisibility } from '../../storageHelpers';

export interface MergeDriveScanWithIndexParams {
  backendId: string;
  backend: GoogleDriveBackend;
  currentPnIdentifier: string | undefined;
  ownerIndex: any;
  ownerIndexFromApi: boolean;
  /**
   * When false (default), trust owner-index for listing and skip live Drive scan.
   * When true (Refresh / mutations), scan Drive to discover unindexed files.
   */
  verifyWithDrive?: boolean;
  /** Mutated in place: fileId/backendFileId → metadata for the whole load pass. */
  aggregatedMetadataMap: Map<string, PublicMetadata>;
  /** Mutated in place: files that still need a metadata lookup. */
  filesNeedingMetadata: AggregatedFile[];
  /** Mutated in place: backends to retry once tokens refresh. */
  retryBackends: Set<string>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
}

export interface MergeDriveScanWithIndexResult {
  filesForBackend: AggregatedFile[];
  /** Drive scan failed for auth/rate-limit reasons: the caller must skip this backend. */
  skipBackend: boolean;
}

export async function mergeDriveScanWithIndex({
  backendId,
  backend,
  currentPnIdentifier,
  ownerIndex,
  ownerIndexFromApi,
  verifyWithDrive = false,
  aggregatedMetadataMap,
  filesNeedingMetadata,
  retryBackends,
  rateLimitedBackendsRef,
  ownerIndexRetryCountsRef,
  shareTokenCache,
  makeShareTokenCacheKey,
}: MergeDriveScanWithIndexParams): Promise<MergeDriveScanWithIndexResult> {
  let filesForBackend: AggregatedFile[] = [];

  if (ownerIndexFromApi && (!ownerIndex?.files || ownerIndex.files.length === 0)) {
    console.debug('ℹ️ [loadFiles] Owner index empty from API; skipping Drive scan', { backendId });
    filesForBackend = [];
  } else if (ownerIndex?.files?.length) {
    ownerIndexRetryCountsRef.current.delete(backendId);

    let scannedFiles: any[] = [];
    if (verifyWithDrive) {
      try {
        scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
        console.debug('✅ [loadFiles] Scanned Google Drive to discover unindexed files', {
          backendId,
          scannedCount: scannedFiles.length,
          ownerIndexCount: ownerIndex.files.length,
        });
      } catch (scanError) {
        console.warn('⚠️ [loadFiles] Failed to scan Drive for unindexed discovery (non-blocking)', {
          backendId,
          error: scanError,
        });
      }
    } else {
      console.debug('ℹ️ [loadFiles] Index-only load; skipping Drive discover scan', { backendId });
    }

    const ownerIndexFileIds = new Set(
      ownerIndex.files
        .map((entry: any) => entry.backendFileId || entry.googleDriveFileId)
        .filter(Boolean)
    );

    filesForBackend = ownerIndex.files.map((entry: any) => {
      const derivedMime =
        entry.mimeType ||
        (entry.fileName?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);

      const normalizedName = entry.fileName || entry.originalName || 'Untitled';
      const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size || 0);
      const fileId =
        entry.fileId || entry.backendFileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;

      return {
        id: fileId,
        backend: backendId,
        backendFileId: entry.backendFileId || entry.googleDriveFileId,
        storageProvider: entry.backend || backendId.split('::')[0],
        name: normalizedName,
        originalName: entry.originalName || normalizedName,
        mimeType: derivedMime,
        size: Number.isFinite(parsedSize) ? parsedSize.toString() : '0',
        encrypted: true,
        visibility: normalizeVisibility(entry.visibility),
        aggregatedAt: entry.uploadedAt || new Date().toISOString(),
      };
    });

    if (verifyWithDrive && scannedFiles.length > 0) {
      const filesNotInIndex = scannedFiles.filter((scannedFile: any) => {
        return !ownerIndexFileIds.has(scannedFile.id);
      });

      if (filesNotInIndex.length > 0) {
        const additionalFiles = filesNotInIndex.map((file: any) => ({
          id: file.id,
          backend: backendId,
          backendFileId: file.id,
          name: file.name,
          originalName: file.originalName || file.name.replace('.encrypted', ''),
          mimeType: file.mimeType,
          size: file.size?.toString() || '0',
          encrypted: file.name.endsWith('.encrypted'),
          visibility: 'private' as const,
          aggregatedAt: file.modifiedTime || new Date().toISOString(),
        }));

        filesForBackend.push(...additionalFiles);
        filesNeedingMetadata.push(...additionalFiles);
      }
    }

    ownerIndex.files.forEach((entry: any) => {
      const fileId = entry.fileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;
      const name = entry.originalName || entry.fileName || 'Untitled';
      const mime =
        entry.mimeType ||
        (name?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);
      const schemaType =
        mime?.startsWith('image/')
          ? 'ImageObject'
          : mime?.startsWith('video/')
          ? 'VideoObject'
          : mime?.startsWith('audio/')
          ? 'AudioObject'
          : 'CreativeWork';
      const isPublic = entry.visibility === 'public';
      const publicToken =
        typeof entry.publicToken === 'string'
          ? entry.publicToken
          : entry.publicToken
          ? JSON.stringify(entry.publicToken)
          : undefined;

      const metadata: PublicMetadata = {
        fileId,
        backend: backendId,
        backendFileId: entry.googleDriveFileId || entry.backendFileId,
        name,
        description: entry.description || '',
        keywords: entry.tags || [],
        uploadDate: entry.uploadedAt,
        fileType:
          schemaType === 'ImageObject'
            ? 'image'
            : schemaType === 'VideoObject'
            ? 'video'
            : schemaType === 'AudioObject'
            ? 'audio'
            : 'document',
        isPublic,
        creator: entry.owner?.did
          ? {
              '@type': 'Person',
              '@id': entry.owner.did,
              identifier: {
                '@type': 'PropertyValue',
                name: 'DID',
                value: entry.owner.did,
              },
            }
          : undefined,
        thumbnail: entry.thumbnail,
        publicToken,
        engagement: entry.engagement,
        inReplyTo: entry.inReplyTo,
        repostOf: entry.repostOf,
        isPartOf: entry.isPartOf,
        '@context': ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
        '@type': schemaType,
        '@id': `https://parnoir.com/resource/${fileId}`,
      };
      aggregatedMetadataMap.set(fileId, metadata);
      if (metadata.backendFileId && metadata.backendFileId !== fileId) {
        aggregatedMetadataMap.set(metadata.backendFileId, metadata);
      }

      if (entry.publicToken) {
        try {
          const shareToken =
            typeof entry.publicToken === 'string' ? JSON.parse(entry.publicToken) : entry.publicToken;
          const cacheKey = makeShareTokenCacheKey(
            backendId,
            entry.googleDriveFileId || entry.backendFileId
          );
          shareTokenCache.current.set(cacheKey, shareToken);
          console.debug('💾 [loadFiles] Cached share token from owner index', { backendId, fileId });
        } catch (tokenError) {
          console.warn('⚠️ [loadFiles] Failed to cache owner index share token', {
            backendId,
            fileId,
            error: tokenError,
          });
        }
      }
    });
  } else if (!ownerIndexFromApi) {
    console.debug('ℹ️ [loadFiles] No API owner index; scanning Drive contents', { backendId });
    try {
      const scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
      filesForBackend = scannedFiles.map((file: any) => ({
        ...file,
        backend: backendId,
        backendFileId: file.id,
      }));
      filesNeedingMetadata.push(...filesForBackend);

      if (ownerIndex?.files?.length) {
        filesForBackend.forEach((file) => {
          const indexEntry = ownerIndex.files.find(
            (entry: any) => entry.googleDriveFileId === file.backendFileId
          );
          if (indexEntry?.publicToken) {
            try {
              const shareToken =
                typeof indexEntry.publicToken === 'string'
                  ? JSON.parse(indexEntry.publicToken)
                  : indexEntry.publicToken;
              const cacheKey = makeShareTokenCacheKey(backendId, file.backendFileId);
              shareTokenCache.current.set(cacheKey, shareToken);
            } catch (tokenError) {
              console.warn('⚠️ [loadFiles] Unable to parse share token for scanned file', {
                backendId,
                fileId: file.id,
                error: tokenError,
              });
            }
          }
        });
      }
    } catch (scanError) {
      const scanMessage = scanError instanceof Error ? scanError.message : String(scanError);
      const scanCode = (scanError as any)?.code;

      if (
        scanCode === 'GOOGLE_DRIVE_REFRESH_COOLDOWN' ||
        scanMessage.includes('token refresh is temporarily rate limited') ||
        scanMessage.includes('Google Drive authentication expired')
      ) {
        retryBackends.add(backendId);
        rateLimitedBackendsRef.current.add(backendId);
      }

      console.warn('⚠️ [loadFiles] Drive scan failed (non-blocking)', {
        backendId,
        error: scanError,
      });
      return { filesForBackend, skipBackend: true };
    }
  }

  return { filesForBackend, skipBackend: false };
}
