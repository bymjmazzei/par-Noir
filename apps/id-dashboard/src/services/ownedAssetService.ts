/**
 * Owned-asset registry + delegations (Bearer + Drive session cloud token).
 */

import { ownerFetch, ownerGet } from './ownerApiService';

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

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (
    (body as { error_description?: string }).error_description ||
    (body as { error?: string }).error ||
    `Request failed (${res.status})`
  );
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
  const res = await ownerGet(
    accessToken,
    `/api/owned-assets/${ownedAssetId}/delegations`,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return ((data.delegations ?? []) as Omit<AssetDelegation, 'ownedAssetId'>[]).map((d) => ({
    ...d,
    ownedAssetId
  }));
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
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/owned-assets/${ownedAssetId}/delegations`,
    {
      delegateePnIdentifier: params.delegateePnIdentifier,
      scope: params.scope,
      expiresAt: params.expiresAt ?? null
    },
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return String(data.id);
}

export async function revokeAssetDelegation(
  accessToken: string,
  pnIdentifier: string,
  delegationId: string
): Promise<void> {
  const res = await ownerFetch(
    accessToken,
    'DELETE',
    `/api/owned-assets/delegations/${delegationId}`,
    undefined,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function ensureHumanOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  rootPn: string
): Promise<OwnedAsset> {
  const assets = await listOwnedAssets(accessToken, pnIdentifier);
  const human = assets.find((a) => a.kind === 'human' && a.status === 'active');
  if (human) return human;
  const res = await ownerFetch(
    accessToken,
    'POST',
    '/api/owned-assets',
    {
      kind: 'device',
      subjectPnIdentifier: rootPn,
      metadata: { label: 'Identity delegation root' }
    },
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.asset as OwnedAsset;
}
