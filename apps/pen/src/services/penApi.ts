import { apiFetch, apiGet } from './penOwnerFetch';
import type { PenClass, PenTemplate, PenTimestampToken } from '@par-noir/pen-protocol';
import { listClasses, listStarterTemplates, timeStampTokenMatches } from '@par-noir/pen-protocol';

/** RFC 3161 token for a SHA-256 imprint, through the API's TSA proxy. Only the hash leaves the device. */
export async function requestTimestamp(accessToken: string, imprintHex: string): Promise<PenTimestampToken> {
  const res = await apiFetch('POST', '/api/timestamp', { imprint: imprintHex }, { authToken: accessToken });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'timestamp_failed');
  }
  const { token } = (await res.json()) as { token?: string };
  if (!token || !timeStampTokenMatches(Uint8Array.from(atob(token), (c) => c.charCodeAt(0)), imprintHex)) {
    throw new Error('timestamp_mismatch');
  }
  return { kind: 'rfc3161', token };
}

export interface PenCatalogPayload {
  classes: PenClass[];
  templates: PenTemplate[];
}

const catalogCache = new Map<string, PenCatalogPayload>();
const tierCache = new Map<string, StorageTierName | null>();

export async function fetchPenCatalog(accessToken: string): Promise<PenCatalogPayload> {
  const cacheKey = accessToken.slice(0, 24);
  const hit = catalogCache.get(cacheKey);
  if (hit) return hit;

  const res = await apiGet('/api/pen/templates', { authToken: accessToken });
  if (!res.ok) throw new Error('templates_failed');
  const data = (await res.json()) as {
    classes?: PenClass[];
    templates?: PenTemplate[];
  };
  const payload: PenCatalogPayload = {
    classes: data.classes?.length ? data.classes : listClasses(),
    templates: data.templates?.length ? data.templates : listStarterTemplates()
  };
  catalogCache.set(cacheKey, payload);
  return payload;
}

/** @deprecated use fetchPenCatalog */
export async function fetchTemplates(accessToken: string) {
  const catalog = await fetchPenCatalog(accessToken);
  return catalog.templates;
}

export type StorageTierName = 'free' | 'feed' | 'self-hosted' | string;

export type PenMonetizationStatus = {
  maintenanceActive: boolean;
  connectReady: boolean;
};

/** Fund licensing membership = verified + active maintenance; Connect gates paid offers. */
export async function fetchMonetizationStatus(
  accessToken: string,
  pnIdentifier?: string
): Promise<PenMonetizationStatus> {
  try {
    const res = await apiGet('/api/monetization/status', {
      authToken: accessToken,
      pnIdentifier
    });
    if (!res.ok) return { maintenanceActive: false, connectReady: false };
    const data = (await res.json()) as {
      maintenanceActive?: boolean;
      connectOnboarded?: boolean;
    };
    return {
      maintenanceActive: data.maintenanceActive === true,
      connectReady: data.connectOnboarded === true
    };
  } catch {
    return { maintenanceActive: false, connectReady: false };
  }
}

/** @deprecated use fetchMonetizationStatus */
export async function fetchMonetizationConnectReady(
  accessToken: string,
  pnIdentifier?: string
): Promise<boolean> {
  const s = await fetchMonetizationStatus(accessToken, pnIdentifier);
  return s.connectReady;
}

/** Fail closed: returns null when lookup fails (treat as not entitled). */
export async function fetchStorageTier(
  accessToken: string,
  pnIdentifier: string
): Promise<StorageTierName | null> {
  const cacheKey = `${pnIdentifier}:${accessToken.slice(0, 24)}`;
  if (tierCache.has(cacheKey)) return tierCache.get(cacheKey) ?? null;
  try {
    const res = await apiGet(`/api/users/${encodeURIComponent(pnIdentifier)}/storage-tier`, {
      authToken: accessToken,
      pnIdentifier
    });
    if (!res.ok) {
      tierCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as { tier?: string };
    const tier = data.tier || null;
    tierCache.set(cacheKey, tier);
    return tier;
  } catch {
    tierCache.set(cacheKey, null);
    return null;
  }
}
