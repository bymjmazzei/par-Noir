/**
 * Keeps aggregator PostgreSQL cache aligned with owner-cloud public envelopes (SoT)
 * and secondarily with public Sheets ids when credentials allow.
 *
 * LIVE public post = publicContentRef envelope still fetchable OAuth-less.
 * That probe does not need owner cloud tokens (device custody safe).
 * Sheets ↔ Postgres id sync is secondary and must never define liveness.
 */

import type { IndexFileEntry } from './indexSheetsService';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { IndexStorageService } from './storage/indexStorageService';
import { isIndexSheetNotFoundError } from './indexSheetsService';
import { getOwnerStorageContext, type OwnerStorageContext } from './storage/ownerStorageContext';
import { storageCredentialsService } from './storageCredentialsService';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import { reconcilePublicCacheToCloud } from './storage/reconcilePublicCacheToCloud';

export interface ReconcilePublicAggregatorResult {
  usersChecked: number;
  usersPurged: number;
  filesRemoved: number;
  usersSkipped: number;
  errors: number;
  /** OAuth-less public envelope reconcile totals */
  envelopeChecked?: number;
  envelopeRemoved?: number;
  envelopeErrors?: number;
}

const CONTENT_CLASSES = ['media', 'thoughts', 'collections'] as const;

/** Skip reconcile removal while Sheets index catches up after publish (background writes). */
const RECONCILE_GRACE_MS = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.RECONCILE_GRACE_MINUTES || '15', 10) * 60 * 1000
);

function isWithinReconcileGrace(submittedAt: Date | undefined): boolean {
  if (!submittedAt) return false;
  return Date.now() - submittedAt.getTime() < RECONCILE_GRACE_MS;
}

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
  try {
    const root = await IndexStorageService.getPublicFileIndex(
      normalized,
      token,
      metadataFolderId,
      accountId
    );
    for (const id of collectPublicFileIds(root.files)) authorized.add(id);
  } catch (error) {
    if (isIndexSheetNotFoundError(error)) {
      return authorized;
    }
    throw error;
  }
  return authorized;
}

export async function reconcilePublicAggregator(): Promise<ReconcilePublicAggregatorResult> {
  const metadataService = AggregatorMetadataServiceDB.getInstance();

  let usersChecked = 0;
  let usersPurged = 0;
  let filesRemoved = 0;
  let usersSkipped = 0;
  let errors = 0;
  let envelopeChecked = 0;
  let envelopeRemoved = 0;
  let envelopeErrors = 0;

  // Primary live SoT: OAuth-less publicContentRef probe (no owner cloud token).
  try {
    const envelope = await reconcilePublicCacheToCloud();
    envelopeChecked = envelope.checked;
    envelopeRemoved = envelope.removed;
    envelopeErrors = envelope.errors;
    filesRemoved += envelope.removed;
    errors += envelope.errors;
    if (envelope.removed > 0 || envelope.checked > 0) {
      safeLogger.info('[Reconcile] Public envelope OAuth-less reconcile', {
        checked: envelope.checked,
        removed: envelope.removed,
        errors: envelope.errors,
      });
    }
  } catch (envelopeErr) {
    errors++;
    safeLogger.warn('[Reconcile] Public envelope reconcile failed', {
      error: envelopeErr as Error,
    });
  }

  // Drop public rows that can never be served (missing publicContentRef).
  try {
    const missingRefRemoved = await metadataService.purgePublicRowsMissingContentRef();
    filesRemoved += missingRefRemoved;
    if (missingRefRemoved > 0) {
      safeLogger.info('[Reconcile] Purged public rows missing publicContentRef', {
        removed: missingRefRemoved,
      });
    }
  } catch (purgeError) {
    safeLogger.warn('[Reconcile] Missing-ref purge failed', {
      error: purgeError as Error,
    });
  }

  const pnIdentifiers = await metadataService.listPnIdentifiersWithPublicFiles();

  for (const rawPn of pnIdentifiers) {
    const pnIdentifier = normalizePn(rawPn);
    usersChecked++;

    try {
      const { isDeviceCloudCustodyEnabled } = await import('./socialMailboxService');
      if (isDeviceCloudCustodyEnabled()) {
        // Device custody: skip Sheets credential crawl. Live SoT already handled OAuth-less above.
        usersSkipped++;
        continue;
      }

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
        if (isIndexSheetNotFoundError(error)) {
          usersSkipped++;
          safeLogger.warn('[Reconcile] Skipping user — public index sheet missing', {
            pnHash: hashIdentifier(pnIdentifier),
          });
          continue;
        }
        throw error;
      }

      if (authorized.size === 0) {
        const submissions = await metadataService.listPublicFileSubmissionsForUser(pnIdentifier);
        const hasRecent = submissions.some((s) => isWithinReconcileGrace(s.submittedAt));
        if (hasRecent) {
          safeLogger.warn('[Reconcile] Skipping purge — public index empty but Postgres has recent publishes', {
            pnHash: hashIdentifier(pnIdentifier),
            dbFileCount: submissions.length,
          });
          continue;
        }
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

      const submissions = await metadataService.listPublicFileSubmissionsForUser(pnIdentifier);
      const submittedAtById = new Map(submissions.map((s) => [s.fileId, s.submittedAt]));
      const dbFileIds = submissions.map((s) => s.fileId);
      for (const fileId of dbFileIds) {
        if (!authorized.has(fileId)) {
          if (isWithinReconcileGrace(submittedAtById.get(fileId))) {
            safeLogger.info('[Reconcile] Skipping removal — file not yet in public index (grace period)', {
              pnHash: hashIdentifier(pnIdentifier),
              fileIdHash: hashIdentifier(fileId),
            });
            continue;
          }
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
    envelopeChecked,
    envelopeRemoved,
    envelopeErrors,
  });

  return {
    usersChecked,
    usersPurged,
    filesRemoved,
    usersSkipped,
    errors,
    envelopeChecked,
    envelopeRemoved,
    envelopeErrors,
  };
}
