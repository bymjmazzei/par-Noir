/**
 * Reconcile public Postgres cache to owner-cloud publicContentRef (OAuth-less).
 *
 * LIVE ⇔ envelope fetchable via publicUrl. No owner cloud token. No backendFileId probe.
 */

import { isPublicContentRef, type PublicContentRef } from '@par-noir/aggregator-domain';
import {
  probePublicEnvelope,
  purgePublicCacheForFileIds,
  type PublicEnvelopeProbeResult,
} from './publicCloudSot';
import { hashIdentifier, safeLogger } from '../../../utils/logger';

export interface PublicCacheReconcileResult {
  checked: number;
  removed: number;
  errors: number;
  removedFileIds: string[];
}

export interface PublicCacheReconcileRow {
  fileId: string;
  pnIdentifier?: string;
  publicContentRef?: unknown;
}

/**
 * Reconcile one set of public cache rows (missing ref → purge; NOT_FOUND → purge).
 */
export async function reconcilePublicCacheRows(
  rows: PublicCacheReconcileRow[],
  options?: {
    probe?: (ref: PublicContentRef) => Promise<PublicEnvelopeProbeResult>;
  }
): Promise<PublicCacheReconcileResult> {
  const probe = options?.probe || probePublicEnvelope;
  let checked = 0;
  let removed = 0;
  let errors = 0;
  const removedFileIds: string[] = [];

  for (const row of rows) {
    if (!row.fileId) continue;
    checked++;

    const ref = isPublicContentRef(row.publicContentRef) ? row.publicContentRef : null;
    if (!ref) {
      try {
        await purgePublicCacheForFileIds({
          fileIds: [row.fileId],
          pnIdentifier: row.pnIdentifier,
        });
        removed++;
        removedFileIds.push(row.fileId);
      } catch (err) {
        errors++;
        safeLogger.warn('[reconcilePublicCache] missing-ref purge failed', {
          fileIdHash: hashIdentifier(row.fileId),
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    const status = await probe(ref);
    if (status === 'ok') continue;
    if (status === 'error') {
      errors++;
      continue;
    }

    try {
      await purgePublicCacheForFileIds({
        fileIds: [row.fileId],
        pnIdentifier: row.pnIdentifier,
      });
      removed++;
      removedFileIds.push(row.fileId);
    } catch (err) {
      errors++;
      safeLogger.warn('[reconcilePublicCache] NOT_FOUND purge failed', {
        fileIdHash: hashIdentifier(row.fileId),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked, removed, errors, removedFileIds };
}

/** Load public rows (optionally one pn) and reconcile OAuth-less. */
export async function reconcilePublicCacheToCloud(params?: {
  pnIdentifier?: string;
  probe?: (ref: PublicContentRef) => Promise<PublicEnvelopeProbeResult>;
}): Promise<PublicCacheReconcileResult> {
  const { AggregatorMetadataServiceDB } = await import('../aggregatorMetadataServiceDB');
  const service = AggregatorMetadataServiceDB.getInstance();
  const rows = await service.listPublicCacheRowsForReconcile(params?.pnIdentifier);
  return reconcilePublicCacheRows(rows, { probe: params?.probe });
}
