/**
 * Reconciles a backend's owner index with a live Google Drive scan.
 *
 * Drops index entries whose blob no longer exists in Drive (orphans), folds in
 * files discovered by the scan that the index does not know about, and builds
 * the PublicMetadata map / share-token cache entries for the backend.
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

    // IMPORTANT: Always scan Google Drive to verify files exist before using owner index entries
    // This prevents showing orphaned files that were deleted from Drive but remain in the index
    let scannedFiles: any[] = [];
    try {
      scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
      console.debug('✅ [loadFiles] Scanned Google Drive to verify file existence', {
        backendId,
        scannedCount: scannedFiles.length,
        ownerIndexCount: ownerIndex.files.length
      });
    } catch (scanError) {
      console.warn('⚠️ [loadFiles] Failed to scan Drive for orphaned file cleanup (non-blocking)', {
        backendId,
        error: scanError,
      });
      // Continue with owner index entries if scan fails (better than showing nothing)
    }

    const backendProvider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
    const isPortableBackend = backendProvider !== 'google_drive';
    const existingFileIds = new Set(
      scannedFiles.map((f: any) => f.id).concat(scannedFiles.map((f: any) => f.name))
    );

    const ownerIndexFileIds = new Set(
      ownerIndex.files
        .map((entry: any) => entry.backendFileId || entry.googleDriveFileId)
        .filter(Boolean)
    );

    filesForBackend = ownerIndex.files
      .filter((entry: any) => {
        const blobId = entry.backendFileId || entry.googleDriveFileId;
        if (!isPortableBackend && blobId && !existingFileIds.has(blobId)) {
          console.debug('🗑️ [loadFiles] Filtering out orphaned file from files list', {
            backendId,
            fileId: blobId,
            fileName: entry.fileName || entry.originalName
          });
          return false;
        }
        return true;
      })
      .map((entry: any) => {
        const derivedMime =
          entry.mimeType ||
          (entry.fileName?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);

        const normalizedName = entry.fileName || entry.originalName || 'Untitled';
        const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size || 0);
        const fileId = entry.fileId || entry.backendFileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;

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

    // IMPORTANT: Also include files from Drive scan that aren't in the owner index
    // This ensures PDFs, thoughts, and other files uploaded directly to Drive are shown
    const filesNotInIndex = scannedFiles.filter((scannedFile: any) => {
      return !ownerIndexFileIds.has(scannedFile.id);
    });

    if (filesNotInIndex.length > 0) {
      // Add files not in index to filesForBackend
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

    // Process metadata from owner index, filtering out orphaned entries
    // Reuse existingFileIds from above
    const orphanedEntries: any[] = [];

    ownerIndex.files.forEach((entry: any) => {
      const googleDriveFileId = entry.googleDriveFileId;

      // Skip entries that don't exist in Google Drive (orphaned)
      if (googleDriveFileId && !existingFileIds.has(googleDriveFileId)) {
        orphanedEntries.push(entry);
        console.debug('🗑️ [loadFiles] Filtering out orphaned file from owner index', {
          backendId,
          fileId: googleDriveFileId,
          fileName: entry.fileName || entry.originalName
        });
        return; // Skip this entry
      }

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
        backendFileId: entry.googleDriveFileId,
        name,
        description: entry.description || '',
        keywords: entry.tags || [],
        uploadDate: entry.uploadedAt,
        fileType: schemaType === 'ImageObject' ? 'image' : schemaType === 'VideoObject' ? 'video' : schemaType === 'AudioObject' ? 'audio' : 'document',
        isPublic,
        creator: entry.owner?.did
          ? {
              "@type": "Person",
              "@id": entry.owner.did,
              identifier: {
                "@type": "PropertyValue",
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
        "@context": ["https://schema.org/", "https://parnoir.com/ns/v1#"],
        "@type": schemaType,
        "@id": `https://parnoir.com/resource/${fileId}`,
      };
      aggregatedMetadataMap.set(fileId, metadata);
      if (metadata.backendFileId && metadata.backendFileId !== fileId) {
        aggregatedMetadataMap.set(metadata.backendFileId, metadata);
      }

      if (entry.publicToken) {
        try {
          const shareToken = typeof entry.publicToken === 'string'
            ? JSON.parse(entry.publicToken)
            : entry.publicToken;
          const cacheKey = makeShareTokenCacheKey(backendId, entry.googleDriveFileId);
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

    // Log orphaned entries found and clean them up
    if (orphanedEntries.length > 0) {
      console.warn(`⚠️ [loadFiles] Found ${orphanedEntries.length} orphaned file(s) in owner index for ${(backendId || '').substring(0, 8)}...`, {
        orphanedFiles: orphanedEntries.map(e => ({
          fileId: e.googleDriveFileId,
          fileName: e.fileName || e.originalName
        }))
      });
    }
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
          const indexEntry = ownerIndex.files.find((entry: any) => entry.googleDriveFileId === file.backendFileId);
          if (indexEntry?.publicToken) {
            try {
              const shareToken = typeof indexEntry.publicToken === 'string'
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
      const scanMessage =
        scanError instanceof Error ? scanError.message : String(scanError);
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
