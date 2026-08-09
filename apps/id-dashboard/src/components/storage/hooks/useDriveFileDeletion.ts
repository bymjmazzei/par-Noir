/**
 * File deletion (single + bulk) and the selection state it runs on.
 *
 * Deletion prefers the par Noir API endpoint because it removes the file, its
 * thumbnail, and its metadata in one call. If that endpoint is unreachable or
 * the owner token has expired, it falls back to deleting straight through the
 * storage backend so the file never gets stranded.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { ownerFetch } from '../../../services/ownerApiService';
import { AggregatedFile } from '../../../types/aggregator';
import type { DriveAccountState } from '../FileStorageAggregatorTypes';

export interface UseDriveFileDeletionParams {
  aggregatorService: FileAggregatorService | null;
  driveAccounts: DriveAccountState[];
  filesByBackend: Map<string, AggregatedFile[]>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
}

export function useDriveFileDeletion({
  aggregatorService,
  driveAccounts,
  filesByBackend,
  selectedFiles,
  setSelectedFiles,
  setIsBulkDeleteMode,
  setError,
  setIsLoading,
  checkDeviceCapability,
  resolveOwnerApiToken,
  loadFilesRef,
}: UseDriveFileDeletionParams) {
  // Bulk delete handler
  const handleBulkDelete = async (backendId: string) => {
    if (!checkDeviceCapability('drive.upload')) return;

    const accountFiles = filesByBackend.get(backendId) || [];
    const filesToDelete = accountFiles.filter(file => selectedFiles.has(file.id));

    if (filesToDelete.length === 0) return;

    const fileCount = filesToDelete.length;
    if (!window.confirm(`Are you sure you want to delete ${fileCount} file${fileCount > 1 ? 's' : ''}? This action cannot be undone.`)) return;

    setIsLoading(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;

      // Delete files sequentially
      for (const file of filesToDelete) {
        try {
          await handleDelete(file, true); // Skip confirmation for bulk delete
          successCount++;
        } catch (err: any) {
          failCount++;
          console.error(`[FileStorageAggregator] Error deleting file ${file.id}:`, err);
        }
      }

      // Clear selection and exit bulk delete mode
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);

      if (failCount > 0) {
        setError(`Deleted ${successCount} file${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete files');
      console.error('[FileStorageAggregator] Bulk delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Select all files in current backend
  const selectAllFiles = (backendId: string) => {
    const accountFiles = filesByBackend.get(backendId) || [];
    const accountFilesIds = accountFiles.map(f => f.id);
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      accountFilesIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const handleDelete = async (file: AggregatedFile, skipConfirm: boolean = false) => {
    if (!file.backendFileId) {
      setError('Cannot delete file: missing file ID');
      return;
    }
    if (!checkDeviceCapability('drive.upload')) return;

    // Confirm deletion (skip confirmation if called from bulk delete)
    if (!skipConfirm) {
      const confirmed = window.confirm(`Are you sure you want to delete "${file.originalName || file.name}"? This action cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use backend directly to delete file (bypasses API token validation)
      const backend = aggregatorService?.getBackend(file.backend);
      if (!backend) {
        throw new Error(`Backend not found for ${file.backend}`);
      }

      if (!backend.isConnected()) {
        throw new Error('Backend is not connected');
      }

      console.log('🗑️ [Delete] Deleting file via API endpoint...', {
        fileId: file.backendFileId,
        fileName: file.name,
        backend: file.backend
      });

      // Use API endpoint for complete deletion (handles file, thumbnail, and metadata)
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const account = driveAccounts.find(acc => acc.backendId === file.backend);
      const accountId = account?.backendId;
      const accountIdParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';

      try {
        const deletePath = `/api/drive/files/${file.backendFileId}${accountIdParam}`;
        const response = await ownerFetch(accessToken, 'DELETE', deletePath);

        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          console.log('✅ [Delete] File deleted successfully via API (includes file, thumbnail, and metadata)', result);
        } else if (response.status === 401) {
          throw new Error('Google Drive authentication expired. Unlock again and retry.');
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Failed to delete file via API: ${errorText}`);
        }
      } catch (apiError) {
        throw new Error(
          `Failed to delete file: ${apiError instanceof Error ? apiError.message : 'API error'}`
        );
      }

      // Reload files after deletion
      if (loadFilesRef.current) {
        await loadFilesRef.current({ verifyWithDrive: true });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete file';
      console.error('❌ [Delete] Delete failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    handleDelete,
  };
}

export type UseDriveFileDeletionResult = ReturnType<typeof useDriveFileDeletion>;
