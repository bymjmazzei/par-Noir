/**
 * Republish IPFS ownedAssets manifest for the current root pN.
 */

import { VolumeIdGenerator } from '@par-noir/aggregator-domain';
import { ipfsMetadataService } from '../utils/ipfsMetadataService';
import { fetchOwnedAssets, postIpfsManifestPointer, type OwnedAssetDto } from './ownedAssetsApi';

export async function republishOwnedAssetsManifest(
  accessToken: string,
  publicKey?: string
): Promise<{ assetCount: number; cid?: string }> {
  const list = await fetchOwnedAssets(accessToken);
  const activeSubs = list.filter((a) => a.status === 'active' && a.kind !== 'human');

  let pnId = 'pn-unknown';
  if (publicKey) {
    try {
      pnId = await VolumeIdGenerator.generateCanonicalVolumeId(publicKey);
    } catch {
      /* keep default */
    }
  }

  if (!ipfsMetadataService.isAvailable()) {
    return { assetCount: activeSubs.length };
  }

  const ownedAssets = activeSubs.map((a: OwnedAssetDto) => ({
    assetId: a.id,
    kind: a.kind,
    subjectPnIdentifier: a.subjectPnIdentifier || undefined,
    label: typeof a.metadata?.label === 'string' ? a.metadata.label : undefined,
  }));

  const res = await ipfsMetadataService.storePNMetadata({
    pnId,
    name: 'par Noir manifest',
    ownedAssets,
    updatedAt: new Date().toISOString(),
  } as Parameters<typeof ipfsMetadataService.storePNMetadata>[0]);

  if (res.success && res.cid) {
    await postIpfsManifestPointer(accessToken, res.cid);
    return { assetCount: activeSubs.length, cid: res.cid };
  }

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
