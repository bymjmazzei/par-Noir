/**
 * Owner-triggered public cache reconcile (Cloud SoT).
 * Server probes publicContentRef OAuth-less — no googleAccessToken required for liveness.
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
 * After Drive layout ready / Refresh: purge public cache rows whose envelopes are gone.
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
  // Optional cloud token only helps Sheets scrub on other paths; liveness probe is OAuth-less.
  const cloudTok = params?.googleAccessToken?.trim();
  const res = await ownerFetch(
    ownerToken,
    'POST',
    `/api/storage/owner-index/${encodeURIComponent(pnId)}/reconcile`,
    undefined,
    {
      pnIdentifier: pnId,
      ...(cloudTok
        ? { extraHeaders: { 'X-PN-Cloud-Access-Token': cloudTok } }
        : {}),
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
