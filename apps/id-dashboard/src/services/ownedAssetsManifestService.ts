/**
 * Owned-assets helpers for dashboard (API registry only — no IPFS manifest).
 */

import { fetchOwnedAssets, type OwnedAssetDto } from './ownedAssetsApi';

/**
 * Refresh count from the owned-assets API. IPFS republish was removed.
 */
export async function republishOwnedAssetsManifest(
  accessToken: string,
  _publicKey?: string
): Promise<{ assetCount: number; cid?: string }> {
  const list = await fetchOwnedAssets(accessToken);
  const activeSubs = list.filter((a) => a.status === 'active' && a.kind !== 'human');
  return { assetCount: activeSubs.length };
}

export function summarizeOwnedAssetsByKind(
  assets: OwnedAssetDto[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    if (a.status !== 'active' || a.kind === 'human') continue;
    counts[a.kind] = (counts[a.kind] || 0) + 1;
  }
  return counts;
}
