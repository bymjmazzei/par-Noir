/**
 * par Noir API — owned-asset registry (Bearer + Drive session cloud token).
 */

import { ownerFetch, ownerGet } from './ownerApiService';
import {
  clearOwnedAssetsUnavailable,
  isOwnedAssetsUnavailable,
  markOwnedAssetsUnavailable,
} from './storage/ownedAssetsAvailability';

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

async function parseError(res: Response): Promise<string> {
  const j = await res.json().catch(() => ({}));
  return (
    (j as { error_description?: string }).error_description ||
    (j as { error?: string }).error ||
    res.statusText
  );
}

/**
 * List owned assets. On 409/401 (cloud token / Drive not ready), memoize and
 * return [] so keep-alive tabs do not re-storm the endpoint. Concurrent callers
 * share one in-flight GET.
 */
const ownedAssetsInFlight = new Map<string, Promise<OwnedAssetDto[]>>();

export async function fetchOwnedAssets(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<OwnedAssetDto[]> {
  const key = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  if (!opts?.force && isOwnedAssetsUnavailable(key)) {
    return [];
  }
  if (opts?.force) {
    clearOwnedAssetsUnavailable(key);
    ownedAssetsInFlight.delete(key);
  }
  const existing = ownedAssetsInFlight.get(key);
  if (existing && !opts?.force) {
    return existing;
  }

  const run = (async (): Promise<OwnedAssetDto[]> => {
    const res = await ownerGet(accessToken, '/api/owned-assets', { pnIdentifier: key });
    if (res.status === 409 || res.status === 401) {
      markOwnedAssetsUnavailable(key);
      return [];
    }
    if (!res.ok) throw new Error(await parseError(res));
    clearOwnedAssetsUnavailable(key);
    const data = (await res.json()) as { assets: OwnedAssetDto[] };
    return data.assets || [];
  })();

  ownedAssetsInFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (ownedAssetsInFlight.get(key) === run) {
      ownedAssetsInFlight.delete(key);
    }
  }
}

export async function createOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  body: {
    kind: string;
    subjectPnIdentifier?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<OwnedAssetDto> {
  const res = await ownerFetch(accessToken, 'POST', '/api/owned-assets', body, { pnIdentifier });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { asset: OwnedAssetDto };
  return data.asset;
}

export async function rekeyOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string,
  body: {
    newSubjectPnIdentifier: string;
    newSubjectPublicKey?: string;
    reason?: string;
    migrateDelegations?: boolean;
  }
): Promise<OwnedAssetDto> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/owned-assets/${encodeURIComponent(id)}/rekey`,
    body,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { asset: OwnedAssetDto };
  return data.asset;
}

export async function revokeOwnedAsset(
  accessToken: string,
  pnIdentifier: string,
  id: string
): Promise<void> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/owned-assets/${encodeURIComponent(id)}/revoke`,
    {},
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function auditSubExport(
  accessToken: string,
  pnIdentifier: string,
  assetId: string
): Promise<void> {
  await ownerFetch(
    accessToken,
    'POST',
    `/api/owned-assets/${encodeURIComponent(assetId)}/export-audit`,
    {},
    { pnIdentifier }
  );
}

export async function fetchDelegations(
  accessToken: string,
  pnIdentifier: string,
  assetId: string
) {
  const res = await ownerGet(
    accessToken,
    `/api/owned-assets/${encodeURIComponent(assetId)}/delegations`,
    { pnIdentifier }
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
  pnIdentifier: string,
  assetId: string,
  body: {
    delegateePnIdentifier?: string;
    delegateeClientId?: string;
    scope?: string;
    expiresAt?: string | null;
  }
): Promise<string> {
  const res = await ownerFetch(
    accessToken,
    'POST',
    `/api/owned-assets/${encodeURIComponent(assetId)}/delegations`,
    body,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function revokeDelegation(
  accessToken: string,
  pnIdentifier: string,
  delegationId: string
): Promise<void> {
  const res = await ownerFetch(
    accessToken,
    'DELETE',
    `/api/owned-assets/delegations/${encodeURIComponent(delegationId)}`,
    undefined,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error('Failed to revoke delegation');
}
