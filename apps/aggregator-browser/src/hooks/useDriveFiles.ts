/**
 * Hook to expose files for the selected drive account and loadFiles.
 * File loading and upload-queue logic remain in FileStorageAggregator;
 * this hook provides a simple interface.
 */

import { useMemo } from 'react';
import type { DriveFile } from '../components/storage/storageTypes';

export function useDriveFiles(
  selectedAccountId: string | null,
  filesByAccount: Map<string, DriveFile[]>,
  loadFilesForAccount: (accountId: string) => Promise<void>
) {
  const files = useMemo(
    () => (selectedAccountId ? filesByAccount.get(selectedAccountId) || [] : []),
    [selectedAccountId, filesByAccount]
  );

  const loadFiles = useMemo(
    () => (accountId: string) => loadFilesForAccount(accountId),
    [loadFilesForAccount]
  );

  return { files, loadFiles };
}
