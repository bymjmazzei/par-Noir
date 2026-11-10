/**
 * Per-file actions for FileStorageAggregator.
 *
 * Covers everything the user can do to an already-uploaded file except viewing and
 * downloading, which the shared owner explorer handles. This hook owns
 * move-to-another-cloud and composes `useEditFileMetadata` and `useDriveFileDeletion`.
 */
import React from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { ownerFetch } from '../../../services/ownerApiService';
import { AggregatedFile, PublicMetadata } from '../../../types/aggregator';
import {
  type DriveAccountState,
  type EditFormState,
} from '../FileStorageAggregatorTypes';
import { useEditFileMetadata } from './useEditFileMetadata';
import { useDriveFileDeletion } from './useDriveFileDeletion';

export interface UseDriveFileActionsParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  driveAccounts: DriveAccountState[];
  filesByBackend: Map<string, AggregatedFile[]>;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  editingFile: AggregatedFile | null;
  setEditingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  cloudPnIdentifier: string | null;
  moveDestKey: string;
  setMoveDestKey: React.Dispatch<React.SetStateAction<string>>;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
  loadFiles: (opts?: { verifyWithDrive?: boolean }) => Promise<void>;
}

export function useDriveFileActions({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  driveAccounts,
  filesByBackend,
  fileMetadataMap,
  setFileMetadataMap,
  editingFile,
  setEditingFile,
  editForm,
  setEditForm,
  selectedFiles,
  setSelectedFiles,
  setIsBulkDeleteMode,
  setError,
  setSuccessMessage,
  setIsLoading,
  cloudPnIdentifier,
  moveDestKey,
  setMoveDestKey,
  checkDeviceCapability,
  requireDeviceCapability,
  resolveOwnerApiToken,
  loadFilesRef,
  loadFiles,
}: UseDriveFileActionsParams) {
  const { handleEditMetadata, handleSaveMetadata } = useEditFileMetadata({
    authenticatedUser,
    resolvedAuth,
    aggregatorService,
    fileMetadataMap,
    setFileMetadataMap,
    editingFile,
    setEditingFile,
    editForm,
    setEditForm,
    setError,
    setIsLoading,
    requireDeviceCapability,
    resolveOwnerApiToken,
    loadFilesRef,
  });

  const {
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    handleDelete,
  } = useDriveFileDeletion({
    cloudPnIdentifier,
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
  });

  const handleMoveToCloud = async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !moveDestKey) {
      setError('Select a destination cloud and unlock your identity.');
      return;
    }
    const sep = moveDestKey.indexOf('|||');
    if (sep < 0) return;
    const destProvider = moveDestKey.slice(0, sep);
    const destAccountId = moveDestKey.slice(sep + 3);
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        ownerToken,
        'POST',
        '/api/storage/migrate/files/start',
        {
          pnIdentifier: cloudPnIdentifier,
          fileIds,
          destProvider,
          destAccountId,
          mode: 'move'
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Move failed');
      }
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      setMoveDestKey('');
      await loadFiles({ verifyWithDrive: true });
      setSuccessMessage(`Moved ${fileIds.length} file(s) to ${destProvider}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleEditMetadata,
    handleSaveMetadata,
    handleMoveToCloud,
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    handleDelete,
  };
}

export type UseDriveFileActionsResult = ReturnType<typeof useDriveFileActions>;
