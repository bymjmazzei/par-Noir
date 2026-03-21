/**
 * par Noir API — owned-asset registry (OAuth Bearer).
 */

import { API_ENDPOINT } from '../config/api';

export interface OwnedAssetDto {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: string;
  status: string;
  metadata: Record<string, unknown>;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

async function authHeaders(accessToken: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
}

export async function fetchOwnedAssets(accessToken: string): Promise<OwnedAssetDto[]> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets`, {
    headers: await authHeaders(accessToken)
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error_description?: string }).error_description || res.statusText);
  }
  const data = (await res.json()) as { assets: OwnedAssetDto[] };
  return data.assets || [];
}

export async function createOwnedAsset(
  accessToken: string,
  body: {
    kind: string;
    subjectPnIdentifier?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<OwnedAssetDto> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets`, {
    method: 'POST',
    headers: await authHeaders(accessToken),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error_description?: string }).error_description || res.statusText);
  }
  const data = (await res.json()) as { asset: OwnedAssetDto };
  return data.asset;
}

export async function revokeOwnedAsset(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    headers: await authHeaders(accessToken)
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error_description?: string }).error_description || res.statusText);
  }
}

export async function auditSubExport(accessToken: string, assetId: string): Promise<void> {
  await fetch(`${API_ENDPOINT}/api/owned-assets/${encodeURIComponent(assetId)}/export-audit`, {
    method: 'POST',
    headers: await authHeaders(accessToken)
  });
}

export async function fetchDelegations(accessToken: string, assetId: string) {
  const res = await fetch(
    `${API_ENDPOINT}/api/owned-assets/${encodeURIComponent(assetId)}/delegations`,
    { headers: await authHeaders(accessToken) }
  );
  if (!res.ok) throw new Error('Failed to load delegations');
  return (await res.json()) as {
    delegations: Array<{
      id: string;
      delegateePnIdentifier: string | null;
      delegateeClientId: string | null;
      scope: string;
      expiresAt: string | null;
      status: string;
      createdAt: string;
    }>;
  };
}

export async function createDelegation(
  accessToken: string,
  assetId: string,
  body: {
    delegateePnIdentifier?: string;
    delegateeClientId?: string;
    scope?: string;
    expiresAt?: string | null;
  }
): Promise<string> {
  const res = await fetch(
    `${API_ENDPOINT}/api/owned-assets/${encodeURIComponent(assetId)}/delegations`,
    {
      method: 'POST',
      headers: await authHeaders(accessToken),
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error_description?: string }).error_description || res.statusText);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function revokeDelegation(accessToken: string, delegationId: string): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/owned-assets/delegations/${encodeURIComponent(delegationId)}`,
    { method: 'DELETE', headers: await authHeaders(accessToken) }
  );
  if (!res.ok) throw new Error('Failed to revoke delegation');
}

export async function postIpfsManifestPointer(accessToken: string, cid: string): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/owned-assets/ipfs-pointer`, {
    method: 'POST',
    headers: await authHeaders(accessToken),
    body: JSON.stringify({ cid })
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error_description?: string }).error_description || res.statusText);
  }
}
