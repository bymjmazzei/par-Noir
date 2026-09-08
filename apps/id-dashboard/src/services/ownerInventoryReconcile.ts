/**
 * Owner inventory reconcile: purge Sheets/Postgres rows whose cloud blobs are gone.
 * Single durable path — POST /api/storage/owner-index/:id/reconcile.
 */

import { ownerFetch, getOwnerApiPnIdentifier } from './ownerApiService';
import { resolveOwnerApiToken } from './ownerApiToken';

export interface OwnerInventoryReconcileResult {
  checked: number;
  removed: number;
  errors: number;
  removedFileIds?: string[];
}

/**
 * After Drive layout ready / Refresh: align owner inventory with live cloud blobs.
 */
export async function reconcileOwnerInventory(params?: {
  pnIdentifier?: string;
  googleAccessToken?: string;
}): Promise<OwnerInventoryReconcileResult> {
  const ownerToken = resolveOwnerApiToken();
  if (!ownerToken) {
    return { checked: 0, removed: 0, errors: 0 };
  }

  const pnIdentifier = params?.pnIdentifier || getOwnerApiPnIdentifier() || undefined;
  if (!pnIdentifier) {
    return { checked: 0, removed: 0, errors: 0 };
  }

  const pnId = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const res = await ownerFetch(
    ownerToken,
    'POST',
    `/api/storage/owner-index/${encodeURIComponent(pnId)}/reconcile`,
    undefined,
    {
      pnIdentifier: pnId,
      googleAccessToken: params?.googleAccessToken,
    }
  );

  if (!res.ok) {
    console.warn('[ownerInventoryReconcile] failed', res.status);
    return { checked: 0, removed: 0, errors: 1 };
  }

  const body = (await res.json()) as OwnerInventoryReconcileResult;
  return {
    checked: body.checked ?? 0,
    removed: body.removed ?? 0,
    errors: body.errors ?? 0,
    removedFileIds: body.removedFileIds,
  };
}
