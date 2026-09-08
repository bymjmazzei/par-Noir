/**
 * Shared inventory purge: remove rows from owner Sheets, public Sheets, and Postgres.
 * Used by Drive delete, metadata-index DELETE, and owner inventory reconcile.
 * Does not delete Drive blobs — callers that need blob deletion do that separately.
 */

import type { DriveToken } from './fileIndexHelpers';
import { removeFromOwnerIndex, removeFromPublicIndex } from './fileIndexHelpers';
import { hashIdentifier, safeLogger } from '../../../utils/logger';

export interface PurgeInventoryResult {
  sheetsAttempted: number;
  sheetsErrors: number;
  postgresRemoved: number;
  postgresErrors: number;
}

export async function purgeInventoryForFileIds(params: {
  token: DriveToken;
  pnIdentifier: string;
  metadataFolderId: string;
  fileIds: string[];
  accountId?: string;
  /** When false, skip AggregatorMetadataServiceDB.removeMetadata. Default true. */
  removePostgres?: boolean;
}): Promise<PurgeInventoryResult> {
  const {
    token,
    pnIdentifier,
    metadataFolderId,
    accountId,
    removePostgres = true,
  } = params;

  const uniqueIds = [...new Set(params.fileIds.filter((id) => typeof id === 'string' && id.length > 0))];
  let sheetsErrors = 0;
  let postgresRemoved = 0;
  let postgresErrors = 0;

  for (const fileId of uniqueIds) {
    try {
      await removeFromOwnerIndex(token, pnIdentifier, metadataFolderId, fileId, accountId);
    } catch (err) {
      sheetsErrors++;
      safeLogger.warn('[purgeInventory] removeFromOwnerIndex failed', {
        fileIdHash: hashIdentifier(fileId),
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      await removeFromPublicIndex(token, pnIdentifier, metadataFolderId, fileId, accountId);
    } catch (err) {
      sheetsErrors++;
      safeLogger.warn('[purgeInventory] removeFromPublicIndex failed', {
        fileIdHash: hashIdentifier(fileId),
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (removePostgres) {
      try {
        const { AggregatorMetadataServiceDB } = await import('../aggregatorMetadataServiceDB');
        const removed = await AggregatorMetadataServiceDB.getInstance().removeMetadata(fileId);
        if (removed) postgresRemoved++;
      } catch (err) {
        postgresErrors++;
        safeLogger.warn('[purgeInventory] removeMetadata failed', {
          fileIdHash: hashIdentifier(fileId),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    sheetsAttempted: uniqueIds.length,
    sheetsErrors,
    postgresRemoved,
    postgresErrors,
  };
}
