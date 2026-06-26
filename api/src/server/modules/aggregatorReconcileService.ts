/**
 * Keeps aggregator PostgreSQL cache aligned with each owner's public-file-index.
 * DB-scoped: only identities with public rows in aggregator_* tables are checked.
 */

import type { IndexFileEntry } from './indexSheetsService';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { IndexStorageService } from './storage/indexStorageService';
import { getOwnerStorageContext, type OwnerStorageContext } from './storage/ownerStorageContext';
import { storageCredentialsService } from './storageCredentialsService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

export interface ReconcilePublicAggregatorResult {
  usersChecked: number;
  usersPurged: number;
  filesRemoved: number;
  usersSkipped: number;
  errors: number;
}

const CONTENT_CLASSES = ['media', 'thoughts', 'collections'] as const;

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function isDriveAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Google Drive authentication failed') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('invalid_grant')
  );
}

function collectPublicFileIds(files: IndexFileEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const file of files) {
    if (file.visibility !== 'public') continue;
    if (file.fileId) ids.add(file.fileId);
  }
  return ids;
}

export async function loadAuthorizedPublicFileIds(
  pnIdentifier: string,
  ctx: OwnerStorageContext
): Promise<Set<string>> {
  const normalized = normalizePn(pnIdentifier);
  const authorized = new Set<string>();

  if (ctx.kind === 'portable') {
    for (const cc of CONTENT_CLASSES) {
      const idx = await IndexStorageService.getContentClassPublicIndex(normalized, cc);
      if (idx?.files?.length) {
        for (const id of collectPublicFileIds(idx.files)) authorized.add(id);
      }
    }
    if (authorized.size === 0) {
      const root = await IndexStorageService.getPublicFileIndex(normalized);
      for (const id of collectPublicFileIds(root.files)) authorized.add(id);
    }
    return authorized;
  }

  const { token, metadataFolderId, accountId } = ctx;
  for (const cc of CONTENT_CLASSES) {
    const idx = await IndexStorageService.getContentClassPublicIndex(
      normalized,
      cc,
      token,
      metadataFolderId,
      accountId
    );
    if (idx?.files?.length) {
      for (const id of collectPublicFileIds(idx.files)) authorized.add(id);
    }
  }
  if (authorized.size === 0) {
    const root = await IndexStorageService.getPublicFileIndex(
      normalized,
      token,
      metadataFolderId,
      accountId
    );
    for (const id of collectPublicFileIds(root.files)) authorized.add(id);
  }
  return authorized;
}

export async function reconcilePublicAggregator(): Promise<ReconcilePublicAggregatorResult> {
  const metadataService = AggregatorMetadataServiceDB.getInstance();
  const pnIdentifiers = await metadataService.listPnIdentifiersWithPublicFiles();

  let usersChecked = 0;
  let usersPurged = 0;
  let filesRemoved = 0;
  let usersSkipped = 0;
  let errors = 0;

  for (const rawPn of pnIdentifiers) {
    const pnIdentifier = normalizePn(rawPn);
    usersChecked++;

    try {
      const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
      if (!credentials?.credentials) {
        const removed = await metadataService.removeAllMetadataForUser(pnIdentifier);
        if (removed > 0) {
          usersPurged++;
          filesRemoved += removed;
        }
        safeLogger.info('[Reconcile] Purged user with no storage credentials', {
          pnHash: hashIdentifier(pnIdentifier),
          removed,
        });
        continue;
      }

      let ctx: OwnerStorageContext | null;
      try {
        ctx = await getOwnerStorageContext(pnIdentifier);
      } catch (error) {
        if (isDriveAuthError(error)) {
          usersSkipped++;
          safeLogger.warn('[Reconcile] Skipping user due to Drive auth error', {
            pnHash: hashIdentifier(pnIdentifier),
            error: error as Error,
          });
          continue;
        }
        throw error;
      }

      if (!ctx) {
        const removed = await metadataService.removeAllMetadataForUser(pnIdentifier);
        if (removed > 0) {
          usersPurged++;
          filesRemoved += removed;
        }
        safeLogger.info('[Reconcile] Purged user — pn folder or metadata missing', {
          pnHash: hashIdentifier(pnIdentifier),
          removed,
        });
        continue;
      }

      let authorized: Set<string>;
      try {
        authorized = await loadAuthorizedPublicFileIds(pnIdentifier, ctx);
      } catch (error) {
        if (isDriveAuthError(error)) {
          usersSkipped++;
          safeLogger.warn('[Reconcile] Skipping user — could not read public index (auth)', {
            pnHash: hashIdentifier(pnIdentifier),
            error: error as Error,
          });
          continue;
        }
        throw error;
      }

      if (authorized.size === 0) {
        const removed = await metadataService.removeAllMetadataForUser(pnIdentifier);
        if (removed > 0) {
          usersPurged++;
          filesRemoved += removed;
        }
        safeLogger.info('[Reconcile] Purged user — empty public index', {
          pnHash: hashIdentifier(pnIdentifier),
          removed,
        });
        continue;
      }

      const dbFileIds = await metadataService.listPublicFileIdsForUser(pnIdentifier);
      for (const fileId of dbFileIds) {
        if (!authorized.has(fileId)) {
          const removed = await metadataService.removeMetadata(fileId);
          if (removed) filesRemoved++;
        }
      }
    } catch (error) {
      errors++;
      safeLogger.error('[Reconcile] Error reconciling user', {
        pnHash: hashIdentifier(pnIdentifier),
        error: error as Error,
      });
    }
  }

  if (filesRemoved > 0 || usersPurged > 0) {
    try {
      const { invalidateIndexCache } = await import('../utils/cache');
      await invalidateIndexCache();
    } catch (cacheError) {
      safeLogger.warn('[Reconcile] Cache invalidation failed (non-critical)', {
        error: cacheError as Error,
      });
    }
  }

  safeLogger.info('[Reconcile] Complete', {
    usersChecked,
    usersPurged,
    filesRemoved,
    usersSkipped,
    errors,
  });

  return { usersChecked, usersPurged, filesRemoved, usersSkipped, errors };
}
