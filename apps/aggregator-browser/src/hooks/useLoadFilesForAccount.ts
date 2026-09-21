/**
 * Builds the per-account file listing for FileStorageAggregator (browser app).
 * Storage access goes through the par Noir API only — never Google directly.
 */

import type React from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { listStorageFiles } from '../services/storageApiClient';
import type { DriveAccount, DriveFile } from '../components/storage/storageTypes';
import { mapCollectionEntry, mapNoteThumbnailEntry } from './mapStorageListEntries';
import { isNoteCollectionFileName, isNoteFileName, isNoteThumbnailFileName } from '../utils/noteFileName';

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

        // Separate note thumbnails (note- / historical thought-) from regular thumbnails
        const noteThumbnails = regularThumbnails.filter((thumb: DriveFile) =>
          isNoteThumbnailFileName(thumb.name)
        );

        const nonNoteThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          if (isNoteThumbnailFileName(thumb.name)) {
            return false;
          }
          // Exclude PDF page thumbnails (format: thumb_filename-page-N.png.encrypted)
          if (name.match(/thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i)) {
            return false;
          }
          return true;
        });

        // Map regular (non-note) thumbnails to their main files and create display entries
        const thumbnailEntries = nonNoteThumbnails.map((thumb: DriveFile) => {
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

        // Map note thumbnails to note files
        // Exclude note-collection files (they're handled separately)
        const noteFiles = mainFiles.filter((file: DriveFile) => {
          return isNoteFileName(file.name) && !isNoteCollectionFileName(file.name);
        });

        // Filter out note-collection files from main files (they should never appear individually)
        const noteCollectionFiles = mainFiles.filter((file: DriveFile) =>
          isNoteCollectionFileName(file.name)
        );

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Found ${noteCollectionFiles.length} note-collection files (will be excluded)`);

        // Map note thumbnails to note files and load metadata to check if they're part of collections.
        // Missing public-index metadata must NOT drop Drive thumbs from Storage (orphan after index purge).
        const noteThumbnailEntries = await Promise.all(
          noteThumbnails.map(async (thumb: DriveFile) => {
            // Remove "thumb_" prefix, ".encrypted" suffix, and file extension to get base name
            const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(note|thought|png)$/i, '');

            // Find the corresponding note file by comparing base names (ignoring extension differences)
            const noteFile = noteFiles.find((tf: DriveFile) => {
              const noteFileNameBase = tf.name.replace(/\.encrypted$/i, '').replace(/\.(note|thought|png)$/i, '');
              return noteFileNameBase === thumbNameBase;
            });

            let thumbMetadata: Record<string, unknown> | null = null;
            try {
              thumbMetadata = (await loadFileMetadata(thumb.id)) ?? null;
            } catch (err) {
              if (import.meta.env.DEV) console.warn(`[FileStorageAggregator] Failed to load thumbnail metadata for ${thumb.id}:`, err);
            }

            const entry = mapNoteThumbnailEntry({
              thumb,
              noteFileId: noteFile?.id,
              metadata: thumbMetadata,
            });

            if (
              noteFile?.name.toLowerCase().endsWith('.note-collection.encrypted') &&
              !entry.mainFileType
            ) {
              entry.mainFileType = 'note-collection';
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
                isNoteCollection: entry.isNoteCollection,
                collectionFileIds: (metadata?.collection as { collectionFileIds?: unknown[] } | undefined)?.collectionFileIds?.length || 0,
                indexMissing: entry.indexMissing === true,
              });
            }
            return entry;
          })
        );

        // Build set of fileIds (thumbnails and note files) that are part of NOTE COLLECTIONS (to exclude them from individual display)
        // Only filter out notes that are in note collections (multi-page notes), not regular collections or single notes
        // This way manually created collections still show their individual files, and single notes are visible
        const noteFilesInCollections = new Set<string>();
        const thumbnailIdsInCollections = new Set<string>(); // Track thumbnail IDs that are in note collections

        collectionFilesWithMetadata.forEach((collectionFile: any) => {
          const collectionData = collectionFile.collection;
          if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
            return; // Skip collections without valid collectionFileIds
          }

          // Only filter files from note collections, not regular collections
          // IMPORTANT: Only collections explicitly marked as note collections should filter their files
          // Regular collections (manually created) and collections without the flag should not filter
          const isNoteCollection = collectionFile.isNoteCollection === true;

          // FALLBACK: If isNoteCollection flag is not set, check if ALL collectionFileIds are note thumbnails
          // This handles cases where the flag wasn't saved correctly or collections created before the flag existed
          let shouldTreatAsNoteCollection = isNoteCollection;
          if (!shouldTreatAsNoteCollection) {
            // Check if all collectionFileIds are note thumbnails
            const allAreNoteThumbnails = collectionData.collectionFileIds.every((fileId: string) => {
              return noteThumbnailEntries.some((entry: any) => entry.id === fileId);
            });
            if (allAreNoteThumbnails && collectionData.collectionFileIds.length > 0) {
              shouldTreatAsNoteCollection = true;
              if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Collection ${collectionFile.id} detected as note collection (fallback: all ${collectionData.collectionFileIds.length} files are note thumbnails)`);
            }
          }

          if (!shouldTreatAsNoteCollection) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Skipping collection ${collectionFile.id} - not a note collection (isNoteCollection: ${isNoteCollection})`);
            return; // Skip regular collections - their files should still be visible
          }

          if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Processing note collection ${collectionFile.id} with ${collectionData.collectionFileIds.length} files`);
          // Check each fileId in the collection - EXCLUDE ALL OF THEM from individual display
          collectionData.collectionFileIds.forEach((fileId: string) => {
            // ALWAYS add the fileId to thumbnailIdsInCollections (for multi-page notes, collections use thumbnail fileIds)
            // This ensures the thumbnail itself is excluded
            thumbnailIdsInCollections.add(fileId);
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking thumbnail ${fileId} as part of note collection (direct exclusion)`);

            // Try to find the corresponding note thumbnail entry to get the mainFileId
            const noteThumbnail = noteThumbnailEntries.find((entry: any) => entry.id === fileId);
            if (noteThumbnail?.mainFileId) {
              noteFilesInCollections.add(noteThumbnail.mainFileId);
              if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking note file ${noteThumbnail.mainFileId} as part of note collection (via thumbnail ${fileId})`);
            } else {
              // If we can't find it in noteThumbnailEntries, check if it's a note file directly
              const fileInCollection = allFiles.find((f: DriveFile) => f.id === fileId);
              if (fileInCollection) {
                const fileName = fileInCollection.name.toLowerCase();
                if (isNoteFileName(fileName)) {
                  noteFilesInCollections.add(fileId);
                  if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Marking note file ${fileId} as part of note collection (direct file match)`);
                }
              }
            }
          });
        });

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering: ${noteThumbnailEntries.length} total note thumbnails, ${thumbnailIdsInCollections.size} in collections, ${noteFilesInCollections.size} note files in collections`);

        // Filter to show thumbnails (representing main files), note thumbnails, and collections
        // IMPORTANT: Exclude collections from allFiles since they're already added via collectionFilesWithMetadata
        // Exclude note-collection-thumbnail fileType (these are pages in multi-page note collections)
        // Single notes (fileType: 'image' with isNoteThumbnail) should remain visible
        const filteredNoteThumbnailEntries = noteThumbnailEntries.filter((entry: any) => {
          // Use fileType from entry (loaded during mapping) or fallback to fileMetadataMap
          const fileType = entry.fileType || fileMetadataMap.get(entry.id)?.fileType;
          const mainFileType = entry.mainFileType || (entry.mainFileId ? fileMetadataMap.get(entry.mainFileId)?.fileType : undefined);

          // Also check filename pattern as a fallback - note collection thumbnails have "-page-" in the name
          const isPageThumbnail = entry.name && /thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i.test(entry.name.toLowerCase());

          // Exclude if:
          // 1. fileType is 'note-collection-thumbnail' (collection note pages)
          // 2. mainFileType is 'note-collection' (thumbnails from note collections)
          // 3. Filename matches page thumbnail pattern (thumb_*-page-N.png.encrypted) AND it's a note thumbnail
          // 4. Thumbnail ID is in a note collection (fallback for existing data)
          // 5. mainFileId is in a note collection (fallback for existing data)
          const isCollectionNote = fileType === 'note-collection-thumbnail' ||
                                     mainFileType === 'note-collection' ||
                                     (isPageThumbnail && entry.name.toLowerCase().includes('thumb_note') || entry.name.toLowerCase().includes('thumb_thought')) ||
                                     thumbnailIdsInCollections.has(entry.id) ||
                                     noteFilesInCollections.has(entry.mainFileId);
          if (isCollectionNote) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering out note thumbnail ${entry.id} (name: ${entry.name}, fileType: ${fileType}, mainFileId: ${entry.mainFileId}, mainFileType: ${mainFileType}, isPageThumbnail: ${isPageThumbnail}) - collection note`);
          }
          return !isCollectionNote;
        });

        if (import.meta.env.DEV) console.log(`[FileStorageAggregator] After filtering: ${filteredNoteThumbnailEntries.length} note thumbnails will be displayed`);
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
          ...filteredNoteThumbnailEntries.filter((e): e is NonNullable<typeof e> => e != null),
          ...collectionFilesWithMetadata,
          ...allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();

          // Exclude collections - they're already added via collectionFilesWithMetadata
          if (collectionFileIds.has(file.id)) {
            return false;
          }

          // Exclude note files that are part of collections (multi-page notes)
          // Check fileType first - collection notes have fileType 'note-collection-page'
          // This prevents showing individual pages when they're already in a collection
          // Media files in collections are NOT excluded (so manually created collections still show their files)

          // Check metadata for fileType
          const fileMetadata = fileMetadataMap.get(file.id);
          const fileType = fileMetadata?.fileType;

          // Exclude if fileType is 'note-collection-page' or 'note-collection' (collection note pages or main collection file)
          if (fileType === 'note-collection-page' || fileType === 'note-collection') {
            return false;
          }

          // Fallback: exclude if in noteFilesInCollections (for existing data)
          if (noteFilesInCollections.has(file.id)) {
            return false;
          }

          // Exclude note-collection files by extension (they should never appear individually)
          if (name.endsWith('.note-collection.encrypted')) {
            if (import.meta.env.DEV) console.log(`[FileStorageAggregator] Filtering out note-collection file ${file.id} by extension`);
            return false;
          }

          // Legacy main-only notes (no thumb, no index) are Drive orphans — hide to avoid 404 metadata probes.
          if (isNoteFileName(name)) {
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
