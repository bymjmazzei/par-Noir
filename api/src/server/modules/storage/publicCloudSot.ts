/**
 * Public post cloud source of truth.
 *
 * LIVE public post ⇔ metadata.publicContentRef is complete and the envelope
 * is still fetchable OAuth-less via publicUrl (see publicBlobAccess.fetchPublicBytes).
 * Postgres and R2 are cache — purge when SoT is gone. The owner's device prunes its
 * own index rows; the API never opens the owner's cloud.
 */

import {
  isPublicContentRef,
  type PublicContentRef,
} from '@par-noir/aggregator-domain';
import { hashIdentifier, safeLogger } from '../../../utils/logger';

export type PublicEnvelopeProbeResult = 'ok' | 'missing' | 'error';

export function getPublicContentRef(meta: unknown): PublicContentRef | null {
  if (!meta || typeof meta !== 'object') return null;
  const ref = (meta as { publicContentRef?: unknown }).publicContentRef;
  return isPublicContentRef(ref) ? ref : null;
}

export function hasPublicContentRefShape(meta: unknown): boolean {
  return getPublicContentRef(meta) !== null;
}

/** SQL fragment: row has complete publicContentRef (backend + objectId + publicUrl). */
export const PUBLIC_CONTENT_REF_SQL = `(
  metadata->'publicContentRef' IS NOT NULL
  AND COALESCE(metadata->'publicContentRef'->>'backend', '') <> ''
  AND COALESCE(metadata->'publicContentRef'->>'objectId', '') <> ''
  AND COALESCE(metadata->'publicContentRef'->>'publicUrl', '') <> ''
)`;

/**
 * OAuth-less existence probe. Uses the same publicUrl stack as serving;
 * maps NOT_FOUND → missing. Soft failures → error (do not purge).
 */
export async function probePublicEnvelope(
  ref: PublicContentRef
): Promise<PublicEnvelopeProbeResult> {
  const { fetchPublicBytes, PublicBlobAccessError } = await import('../publicBlobAccess');
  try {
    await fetchPublicBytes(ref);
    return 'ok';
  } catch (err) {
    if (err instanceof PublicBlobAccessError && err.code === 'NOT_FOUND') {
      return 'missing';
    }
    safeLogger.warn('[publicCloudSot] envelope probe soft failure', {
      objectHash: hashIdentifier(ref.objectId),
      code: err instanceof PublicBlobAccessError ? err.code : undefined,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'error';
  }
}

export interface PurgePublicCacheResult {
  postgresRemoved: number;
  postgresErrors: number;
}

/** One cascade for dead public posts: the Postgres row (and feed_posts via removeMetadata). */
export async function purgePublicCacheForFileIds(params: {
  fileIds: string[];
  pnIdentifier?: string;
}): Promise<PurgePublicCacheResult> {
  const uniqueIds = [
    ...new Set(params.fileIds.filter((id) => typeof id === 'string' && id.length > 0)),
  ];
  let postgresRemoved = 0;
  let postgresErrors = 0;

  for (const fileId of uniqueIds) {
    try {
      const { AggregatorMetadataServiceDB } = await import('../aggregatorMetadataServiceDB');
      const removed = await AggregatorMetadataServiceDB.getInstance().removeMetadata(fileId);
      if (removed) postgresRemoved++;
    } catch (err) {
      postgresErrors++;
      safeLogger.warn('[publicCloudSot] removeMetadata failed', {
        fileIdHash: hashIdentifier(fileId),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { postgresRemoved, postgresErrors };
}
