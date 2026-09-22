import { API_ENDPOINT } from '../config/api';
import type { PenClass, PenNotaryToken, PenTemplate } from '@par-noir/pen-protocol';
import { listClasses, listStarterTemplates } from '@par-noir/pen-protocol';

export async function requestNotaryStamp(
  accessToken: string,
  hash: string
): Promise<PenNotaryToken> {
  const res = await fetch(`${API_ENDPOINT}/api/pen/notary/timestamp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ hash })
  });
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

export async function fetchPenCatalog(accessToken: string): Promise<PenCatalogPayload> {
  const res = await fetch(`${API_ENDPOINT}/api/pen/templates`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('templates_failed');
  const data = (await res.json()) as {
    classes?: PenClass[];
    templates?: PenTemplate[];
  };
  return {
    classes: data.classes?.length ? data.classes : listClasses(),
    templates: data.templates?.length ? data.templates : listStarterTemplates()
  };
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
  try {
    const res = await fetch(
      `${API_ENDPOINT}/api/users/${encodeURIComponent(pnIdentifier)}/storage-tier`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tier?: string };
    return data.tier || null;
  } catch {
    return null;
  }
}
