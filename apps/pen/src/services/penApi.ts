import { apiFetch, apiGet } from './penOwnerFetch';
import type { PenClass, PenNotaryToken, PenTemplate } from '@par-noir/pen-protocol';
import { listClasses, listStarterTemplates } from '@par-noir/pen-protocol';

export async function requestNotaryStamp(
  accessToken: string,
  hash: string
): Promise<PenNotaryToken> {
  const res = await apiFetch(
    'POST',
    '/api/pen/notary/timestamp',
    { hash },
    { authToken: accessToken }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'notary_failed');
  }
  return (await res.json()) as PenNotaryToken;
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
