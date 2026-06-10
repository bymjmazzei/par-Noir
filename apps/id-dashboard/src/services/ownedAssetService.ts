/**
 * Owned-asset registry + delegations (dashboard OAuth).
 */

import { API_ENDPOINT } from '../config/api';

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

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (
    (body as { error_description?: string }).error_description ||
    (body as { error?: string }).error ||
    `Request failed (${res.status})`
  );
}

export async function listOwnedAssets(accessToken: string): Promise<OwnedAsset[]> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets`, {
    headers: authHeaders(accessToken)
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return (data.assets ?? []) as OwnedAsset[];
}

export async function listAssetDelegations(
  accessToken: string,
  ownedAssetId: string
): Promise<AssetDelegation[]> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets/${ownedAssetId}/delegations`, {
    headers: authHeaders(accessToken)
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return ((data.delegations ?? []) as Omit<AssetDelegation, 'ownedAssetId'>[]).map((d) => ({
    ...d,
    ownedAssetId
  }));
}

export async function listAllDelegations(accessToken: string): Promise<AssetDelegation[]> {
  const assets = await listOwnedAssets(accessToken);
  const activeAssets = assets.filter((a) => a.status === 'active');
  const lists = await Promise.all(
    activeAssets.map((a) =>
      listAssetDelegations(accessToken, a.id).catch(() => [] as AssetDelegation[])
    )
  );
  return lists.flat().filter((d) => d.status === 'active');
}

export async function createAssetDelegation(
  accessToken: string,
  ownedAssetId: string,
  params: { delegateePnIdentifier: string; scope: string; expiresAt?: string | null }
): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets/${ownedAssetId}/delegations`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      delegateePnIdentifier: params.delegateePnIdentifier,
      scope: params.scope,
      expiresAt: params.expiresAt ?? null
    })
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return String(data.id);
}

export async function revokeAssetDelegation(
  accessToken: string,
  delegationId: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets/delegations/${delegationId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken)
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function ensureHumanOwnedAsset(
  accessToken: string,
  rootPn: string
): Promise<OwnedAsset> {
  const assets = await listOwnedAssets(accessToken);
  const human = assets.find((a) => a.kind === 'human' && a.status === 'active');
  if (human) return human;
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      kind: 'device',
      subjectPnIdentifier: rootPn,
      metadata: { label: 'Identity delegation root' }
    })
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  return data.asset as OwnedAsset;
}
