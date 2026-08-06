/**
 * Owned-assets helpers for dashboard (API registry on user Drive).
 */

import { fetchOwnedAssets, type OwnedAssetDto } from './ownedAssetsApi';

/**
 * Refresh count from the owned-assets API (Drive SoT via cloud token).
 */
export async function republishOwnedAssetsManifest(
  accessToken: string,
  pnIdentifier: string,
  _publicKey?: string
): Promise<{ assetCount: number; cid?: string }> {
  const list = await fetchOwnedAssets(accessToken, pnIdentifier);
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
