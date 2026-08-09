/**
 * Builds the per-account file listing for FileStorageAggregator (browser app).
 * Storage access goes through the par Noir API only — never Google directly.
 */

import type React from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { listStorageFiles } from '../services/storageApiClient';
import type { DriveAccount, DriveFile } from '../components/storage/storageTypes';
import { mapCollectionEntry, mapThoughtThumbnailEntry } from './mapStorageListEntries';

export interface UseLoadFilesForAccountParams {
  authenticatedUserId: string | undefined;
  pnIdentifier: string | undefined;
  driveAccounts: DriveAccount[];
  fileMetadataMap: Map<string, any>;
  loadFileMetadata: (fileId: string) => Promise<any>;
  setFilesByAccount: React.Dispatch<React.SetStateAction<Map<string, DriveFile[]>>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useLoadFilesForAccount({
  authenticatedUserId,
  pnIdentifier,
  driveAccounts,
  fileMetadataMap,
  loadFileMetadata,
  setFilesByAccount,
  setError,
}: UseLoadFilesForAccountParams) {
  // Load files for a specific account
  const loadFilesForAccount = async (accountId: string) => {
    if (!authenticatedUserId) {
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        setError('Please connect your pN to view files');
        return;
      }

      const account = driveAccounts.find((a) => a.accountId === accountId);
      const provider = account?.provider || 'google_drive';
      if (!pnIdentifier) {
        setError('Please unlock your pN to view files');
        return;
      }

      const loadListedFiles = async (token: string) =>
        listStorageFiles(token, pnIdentifier, provider, accountId);

      let listedFiles;
      try {
        listedFiles = await loadListedFiles(accessToken);
      } catch {
        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
        if (!refreshedToken) {
          setError('Your session has expired. Please unlock your pN again to continue.');
          return;
        }
        listedFiles = await loadListedFiles(refreshedToken);
      }

      const allFiles = listedFiles.map((file) => ({
        ...file,
        accountId,
        provider,
        displayName: file.name.replace(/\.encrypted$/i, '')
      }));

      if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Loaded ${allFiles.length} files from API, checking for folders...`);
        const folders = allFiles.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Found ${folders.length} folders:`, folders.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] All files:`, allFiles.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));

        // Separate thumbnails and main files
        const thumbnails = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thumb_') && name.endsWith('.encrypted');
        });

        const mainFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return !name.startsWith('thumb_');
        });

        const regularThumbnails = thumbnails;

        // Separate thought thumbnails from regular thumbnails
        const thoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return name.startsWith('thumb_thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'));
        });

        const nonThoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          // Exclude thought thumbnails
          if (name.startsWith('thumb_thought-')) {
            return false;
          }
          // Exclude PDF page thumbnails (format: thumb_filename-page-N.png.encrypted)
          if (name.match(/thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i)) {
            return false;
          }
          return true;
        });

        // Map regular (non-thought) thumbnails to their main files and create display entries
        const thumbnailEntries = nonThoughtThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find main file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');

          // Find the corresponding main file
          const mainFile = mainFiles.find((mf: DriveFile) => {
            const mainFileName = mf.name.replace(/\.encrypted$/i, '');
            return mainFileName === thumbNameWithoutPrefix;
          });

          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');

          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: mainFile?.id || thumb.id, // Use main file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });

        // Map thought thumbnails to thought files
        // Exclude thought-collection files (they're handled separately)
        const thoughtFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thought-') &&
                 (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted')) &&
                 !name.endsWith('.thought-collection.encrypted'); // Exclude thought collections
        });

        // Filter out thought-collection files from main files (they should never appear individually)
        const thoughtCollectionFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.endsWith('.thought-collection.encrypted');
        });

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Found ${thoughtCollectionFiles.length} thought-collection files (will be excluded)`);

        // Map thought thumbnails to thought files and load metadata to check if they're part of collections.
        // Missing public-index metadata must NOT drop Drive thumbs from Storage (orphan after index purge).
        const thoughtThumbnailEntries = await Promise.all(
          thoughtThumbnails.map(async (thumb: DriveFile) => {
            // Remove "thumb_" prefix, ".encrypted" suffix, and file extension to get base name
            const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');

            // Find the corresponding thought file by comparing base names (ignoring extension differences)
            const thoughtFile = thoughtFiles.find((tf: DriveFile) => {
              const thoughtFileNameBase = tf.name.replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
              return thoughtFileNameBase === thumbNameBase;
            });

            let thumbMetadata: Record<string, unknown> | null = null;
            try {
              thumbMetadata = (await loadFileMetadata(thumb.id)) ?? null;
            } catch (err) {
              if (import.meta.env.DEV) console.warn(`[FileStorageAggregator] Failed to load thumbnail metadata for ${thumb.id}:`, err);
            }

            const entry = mapThoughtThumbnailEntry({
              thumb,
              thoughtFileId: thoughtFile?.id,
              metadata: thumbMetadata,
            });

            if (
              thoughtFile?.name.toLowerCase().endsWith('.thought-collection.encrypted') &&
              !entry.mainFileType
            ) {
              entry.mainFileType = 'thought-collection';
            }

            if (import.meta.env.DEV) {
              console.log(
                `[FileStorageAggregator] Thumbnail ${thumb.id} (${thumb.name}): fileType=${entry.fileType}, isPartOfCollection=${entry.isPartOfCollection}, mainFileId=${entry.mainFileId}, mainFileType=${entry.mainFileType}, indexMissing=${entry.indexMissing === true}`
              );
            }

            return entry;
          })
        );

        // Detect collections by filename pattern
        const collectionFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('collection-') && name.endsWith('.collection.encrypted');
        });

        // Load metadata for collections; keep Drive orphans when public index is missing
        const collectionFilesWithMetadata = await Promise.all(
          collectionFiles.map(async (file: DriveFile) => {
            let metadata: Record<string, unknown> | null = null;
            try {
              metadata = (await loadFileMetadata(file.id)) ?? null;
            } catch (err) {
              if (import.meta.env.DEV) console.warn(`[FileStorageAggregator] Failed to load metadata for collection ${file.id}:`, err);
            }

            const entry = mapCollectionEntry({ file, metadata });
            if (import.meta.env.DEV && metadata) {
              console.log(`[FileStorageAggregator] Loaded collection metadata for ${file.id}:`, {
                name: metadata?.name || metadata?.title,
                isThoughtCollection: entry.isThoughtCollection,
                collectionFileIds: (metadata?.collection as { collectionFileIds?: unknown[] } | undefined)?.collectionFileIds?.length || 0,
                indexMissing: entry.indexMissing === true,
              });
            }
            return entry;
          })
        );

        // Build set of fileIds (thumbnails and thought files) that are part of THOUGHT COLLECTIONS (to exclude them from individual display)
        // Only filter out thoughts that are in thought collections (multi-page thoughts), not regular collections or single thoughts
        // This way manually created collections still show their individual files, and single thoughts are visible
        const thoughtFilesInCollections = new Set<string>();
        const thumbnailIdsInCollections = new Set<string>(); // Track thumbnail IDs that are in thought collections

        collectionFilesWithMetadata.forEach((collectionFile: any) => {
          const collectionData = collectionFile.collection;
          if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
            return; // Skip collections without valid collectionFileIds
          }

          // Only filter files from thought collections, not regular collections
          // IMPORTANT: Only collections explicitly marked as thought collections should filter their files
          // Regular collections (manually created) and collections without the flag should not filter
          const isThoughtCollection = collectionFile.isThoughtCollection === true;

          // FALLBACK: If isThoughtCollection flag is not set, check if ALL collectionFileIds are thought thumbnails
          // This handles cases where the flag wasn't saved correctly or collections created before the flag existed
          let shouldTreatAsThoughtCollection = isThoughtCollection;
          if (!shouldTreatAsThoughtCollection) {
            // Check if all collectionFileIds are thought thumbnails
            const allAreThoughtThumbnails = collectionData.collectionFileIds.every((fileId: string) => {
              return thoughtThumbnailEntries.some((entry: any) => entry.id === fileId);
            });
            if (allAreThoughtThumbnails && collectionData.collectionFileIds.length > 0) {
              shouldTreatAsThoughtCollection = true;
              if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Collection ${collectionFile.id} detected as thought collection (fallback: all ${collectionData.collectionFileIds.length} files are thought thumbnails)`);
            }
          }

          if (!shouldTreatAsThoughtCollection) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Skipping collection ${collectionFile.id} - not a thought collection (isThoughtCollection: ${isThoughtCollection})`);
            return; // Skip regular collections - their files should still be visible
          }

          if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Processing thought collection ${collectionFile.id} with ${collectionData.collectionFileIds.length} files`);
          // Check each fileId in the collection - EXCLUDE ALL OF THEM from individual display
          collectionData.collectionFileIds.forEach((fileId: string) => {
            // ALWAYS add the fileId to thumbnailIdsInCollections (for multi-page thoughts, collections use thumbnail fileIds)
            // This ensures the thumbnail itself is excluded
            thumbnailIdsInCollections.add(fileId);
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking thumbnail ${fileId} as part of thought collection (direct exclusion)`);

            // Try to find the corresponding thought thumbnail entry to get the mainFileId
            const thoughtThumbnail = thoughtThumbnailEntries.find((entry: any) => entry.id === fileId);
            if (thoughtThumbnail?.mainFileId) {
              thoughtFilesInCollections.add(thoughtThumbnail.mainFileId);
              if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking thought file ${thoughtThumbnail.mainFileId} as part of thought collection (via thumbnail ${fileId})`);
            } else {
              // If we can't find it in thoughtThumbnailEntries, check if it's a thought file directly
              const fileInCollection = allFiles.find((f: DriveFile) => f.id === fileId);
              if (fileInCollection) {
                const fileName = fileInCollection.name.toLowerCase();
                if (fileName.startsWith('thought-') && (fileName.endsWith('.thought.encrypted') || fileName.endsWith('.png.encrypted'))) {
                  thoughtFilesInCollections.add(fileId);
                  if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking thought file ${fileId} as part of thought collection (direct file match)`);
                }
              }
            }
          });
        });

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering: ${thoughtThumbnailEntries.length} total thought thumbnails, ${thumbnailIdsInCollections.size} in collections, ${thoughtFilesInCollections.size} thought files in collections`);

        // Filter to show thumbnails (representing main files), thought thumbnails, and collections
        // IMPORTANT: Exclude collections from allFiles since they're already added via collectionFilesWithMetadata
        // Exclude thought-collection-thumbnail fileType (these are pages in multi-page thought collections)
        // Single thoughts (fileType: 'image' with isThoughtThumbnail) should remain visible
        const filteredThoughtThumbnailEntries = thoughtThumbnailEntries.filter((entry: any) => {
          // Use fileType from entry (loaded during mapping) or fallback to fileMetadataMap
          const fileType = entry.fileType || fileMetadataMap.get(entry.id)?.fileType;
          const mainFileType = entry.mainFileType || (entry.mainFileId ? fileMetadataMap.get(entry.mainFileId)?.fileType : undefined);

          // Also check filename pattern as a fallback - thought collection thumbnails have "-page-" in the name
          const isPageThumbnail = entry.name && /thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i.test(entry.name.toLowerCase());

          // Exclude if:
          // 1. fileType is 'thought-collection-thumbnail' (collection thought pages)
          // 2. mainFileType is 'thought-collection' (thumbnails from thought collections)
          // 3. Filename matches page thumbnail pattern (thumb_*-page-N.png.encrypted) AND it's a thought thumbnail
          // 4. Thumbnail ID is in a thought collection (fallback for existing data)
          // 5. mainFileId is in a thought collection (fallback for existing data)
          const isCollectionThought = fileType === 'thought-collection-thumbnail' ||
                                     mainFileType === 'thought-collection' ||
                                     (isPageThumbnail && entry.name.toLowerCase().includes('thumb_thought')) ||
                                     thumbnailIdsInCollections.has(entry.id) ||
                                     thoughtFilesInCollections.has(entry.mainFileId);
          if (isCollectionThought) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering out thought thumbnail ${entry.id} (name: ${entry.name}, fileType: ${fileType}, mainFileId: ${entry.mainFileId}, mainFileType: ${mainFileType}, isPageThumbnail: ${isPageThumbnail}) - collection thought`);
          }
          return !isCollectionThought;
        });

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] After filtering: ${filteredThoughtThumbnailEntries.length} thought thumbnails will be displayed`);
        const collectionFileIds = new Set(collectionFiles.map((f: { id: string }) => f.id));
        const mediaFiles: Array<{
          id: string;
          name: string;
          mimeType: string;
          size: string;
          displayName?: string;
          isThumbnail?: boolean;
          mainFileId?: string;
          thumbnailLink?: string;
          webViewLink?: string;
          accountId?: string;
          provider?: string;
          [key: string]: unknown;
        }> = [
          ...thumbnailEntries,
          ...filteredThoughtThumbnailEntries.filter((e): e is NonNullable<typeof e> => e != null),
          ...collectionFilesWithMetadata,
          ...allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();

          // Exclude collections - they're already added via collectionFilesWithMetadata
          if (collectionFileIds.has(file.id)) {
            return false;
          }

          // Exclude thought files that are part of collections (multi-page thoughts)
          // Check fileType first - collection thoughts have fileType 'thought-collection-page'
          // This prevents showing individual pages when they're already in a collection
          // Media files in collections are NOT excluded (so manually created collections still show their files)

          // Check metadata for fileType
          const fileMetadata = fileMetadataMap.get(file.id);
          const fileType = fileMetadata?.fileType;

          // Exclude if fileType is 'thought-collection-page' or 'thought-collection' (collection thought pages or main collection file)
          if (fileType === 'thought-collection-page' || fileType === 'thought-collection') {
            return false;
          }

          // Fallback: exclude if in thoughtFilesInCollections (for existing data)
          if (thoughtFilesInCollections.has(file.id)) {
            return false;
          }

          // Exclude thought-collection files by extension (they should never appear individually)
          if (name.endsWith('.thought-collection.encrypted')) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering out thought-collection file ${file.id} by extension`);
            return false;
          }

          // Legacy main-only thoughts (no thumb, no index) are Drive orphans — hide to avoid 404 metadata probes.
          if (name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'))) {
            return false;
          }

          // Exclude everything else (main files already have thumbnails, collections already included)
          return false;
        })
        ];

      setFilesByAccount(prev => {
        const next = new Map(prev);
        next.set(accountId, mediaFiles);
        return next;
      });
      setError(null);
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[FileStorageAggregator] Failed to load files:', err);
      // Only set error if it's a real error, not just empty files
      if (err.message && !err.message.includes('No valid access token')) {
        setError(err.message || 'Failed to load files');
      }
    }
  };

  return loadFilesForAccount;
}
