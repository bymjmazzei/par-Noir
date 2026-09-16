/**
 * Keeps aggregator PostgreSQL cache aligned with owner-cloud public envelopes (SoT).
 *
 * LIVE public post = publicContentRef envelope still fetchable OAuth-less.
 * That probe does not need owner cloud tokens (device custody safe).
 * Sheets credential crawl removed — custody is permanent; never soft-assemble owner AT.
 */

import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
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

  // Custody-forever: no Sheets crawl via getOwnerStorageContext without AT.
  const pnIdentifiers = await metadataService.listPnIdentifiersWithPublicFiles();
  usersChecked = pnIdentifiers.length;
  usersSkipped = pnIdentifiers.length;

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

  const hasWork =
    usersPurged > 0 ||
    filesRemoved > 0 ||
    errors > 0 ||
    envelopeRemoved > 0 ||
    envelopeErrors > 0;
  if (hasWork) {
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
  } else {
    safeLogger.info('[Reconcile] Envelope-only pass (no Sheets crawl under custody)', {
      usersChecked,
      pnIdSampleHash: pnIdentifiers[0] ? hashIdentifier(pnIdentifiers[0]) : undefined,
    });
  }

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
