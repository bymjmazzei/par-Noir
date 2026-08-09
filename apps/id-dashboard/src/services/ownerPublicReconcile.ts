/**
 * Owner-device reconcile: purge aggregator public rows whose cloud blobs are gone.
 * Uses caller's cloud token only — never peer credentials.
 */

import { ownerFetch, ownerGet, getOwnerApiPnIdentifier } from './ownerApiService';
import { resolveOwnerApiToken } from './ownerApiToken';

export interface OwnerPublicReconcileResult {
  checked: number;
  removed: number;
  errors: number;
}

/**
 * After unlock / Drive ready: list my public aggregator files and DELETE any whose
 * publicContentRef object is missing on Drive (404).
 */
export async function reconcileOwnerPublicAggregator(params?: {
  pnIdentifier?: string;
  googleAccessToken?: string;
}): Promise<OwnerPublicReconcileResult> {
  const ownerToken = resolveOwnerApiToken();
  if (!ownerToken) {
    return { checked: 0, removed: 0, errors: 0 };
  }

  const pnIdentifier = params?.pnIdentifier || getOwnerApiPnIdentifier() || undefined;
  const cloudOpts = {
    pnIdentifier,
    googleAccessToken: params?.googleAccessToken,
  };

  const listRes = await ownerGet(ownerToken, '/api/aggregator/my-files', cloudOpts);
  if (!listRes.ok) {
    console.warn('[ownerPublicReconcile] my-files failed', listRes.status);
    return { checked: 0, removed: 0, errors: 1 };
  }

  const body = (await listRes.json()) as {
    files?: Array<{
      fileId?: string;
      metadata?: {
        isPublic?: boolean;
        publicContentRef?: { objectId?: string; backend?: string };
        backendFileId?: string;
      };
    }>;
  };

  const files = Array.isArray(body.files) ? body.files : [];
  let checked = 0;
  let removed = 0;
  let errors = 0;

  for (const entry of files) {
    const meta = entry.metadata || (entry as { metadata?: unknown }).metadata;
    const m = (meta || entry) as {
      isPublic?: boolean;
      fileId?: string;
      publicContentRef?: { objectId?: string; backend?: string };
    };
    if (m.isPublic === false) continue;

    const fileId = entry.fileId || m.fileId;
    const objectId = m.publicContentRef?.objectId;
    const backend = m.publicContentRef?.backend || 'google_drive';
    if (!fileId || !objectId) continue;

    checked++;

    try {
      if (backend !== 'google_drive') {
        // Portable: probe public URL via blind proxy; 404 purges server-side.
        const probe = await ownerGet(
          ownerToken,
          `/api/aggregator/public-content/${encodeURIComponent(fileId)}`,
          cloudOpts
        );
        if (probe.status === 404) {
          removed++;
        }
        continue;
      }

      // Drive: files.get with caller's token
      const probe = await ownerGet(
        ownerToken,
        `/api/drive/files/${encodeURIComponent(objectId)}`,
        cloudOpts
      );
      if (probe.status === 404) {
        const del = await ownerFetch(
          ownerToken,
          'DELETE',
          `/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`,
          undefined,
          cloudOpts
        );
        if (del.ok || del.status === 404) {
          removed++;
        } else {
          errors++;
        }
      }
    } catch (e) {
      errors++;
      console.warn('[ownerPublicReconcile] check failed', e);
    }
  }

  return { checked, removed, errors };
}
