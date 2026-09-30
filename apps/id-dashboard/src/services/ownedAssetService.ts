/**
 * Owned-asset registry + delegations (Bearer + Drive session cloud token).
 */

import {
  createDelegation,
  createOwnedAsset,
  fetchDelegations,
  revokeDelegation,
} from './ownedAssetsApi';

export interface OwnedAsset {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AssetDelegation {
  id: string;
  ownedAssetId: string;
  delegateePnIdentifier: string | null;
  delegateeClientId: string | null;
  scope: string;
  expiresAt: string | null;
  status: string;
  createdAt: string;
}

export async function listOwnedAssets(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<OwnedAsset[]> {
  const { fetchOwnedAssets } = await import('./ownedAssetsApi');
  const assets = await fetchOwnedAssets(accessToken, pnIdentifier, opts);
  return assets as OwnedAsset[];
}

export async function listAssetDelegations(
  accessToken: string,
  pnIdentifier: string,
  ownedAssetId: string
): Promise<AssetDelegation[]> {
  const data = await fetchDelegations(accessToken, pnIdentifier, ownedAssetId);
  return data.delegations.map((d) => ({ ...d, ownedAssetId }));
}

export async function listAllDelegations(
  accessToken: string,
  pnIdentifier: string
): Promise<AssetDelegation[]> {
  const assets = await listOwnedAssets(accessToken, pnIdentifier);
  const activeAssets = assets.filter((a) => a.status === 'active');
  const lists = await Promise.all(
    activeAssets.map((a) =>
      listAssetDelegations(accessToken, pnIdentifier, a.id).catch(() => [] as AssetDelegation[])
    )
  );
  return lists.flat().filter((d) => d.status === 'active');
}

export async function createAssetDelegation(
  accessToken: string,
  pnIdentifier: string,
  ownedAssetId: string,
  params: { delegateePnIdentifier: string; scope: string; expiresAt?: string | null }
): Promise<string> {
  return createDelegation(accessToken, pnIdentifier, ownedAssetId, {
    delegateePnIdentifier: params.delegateePnIdentifier,
    scope: params.scope,
    expiresAt: params.expiresAt ?? null,
  });
}

export async function revokeAssetDelegation(
  accessToken: string,
  pnIdentifier: string,
  delegationId: string
): Promise<void> {
  await revokeDelegation(accessToken, pnIdentifier, delegationId);
}

export async function ensureHumanOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  rootPn: string
): Promise<OwnedAsset> {
  const assets = await listOwnedAssets(accessToken, pnIdentifier);
  const human = assets.find((a) => a.kind === 'human' && a.status === 'active');
  if (human) return human;
  return createOwnedAsset(accessToken, pnIdentifier, {
    kind: 'device',
    subjectPnIdentifier: rootPn,
    metadata: { label: 'Identity delegation root' },
  });
}
