/**
 * Owner catalog: Postgres-backed index rows (Pen publish, etc.) for Storage UI.
 */

import { apiGet } from './ownerApiFetch';

export type OwnerCatalogFile = {
  fileId: string;
  metadata: Record<string, unknown>;
  submittedAt?: string;
  pnIdentifier?: string;
};

export async function fetchOwnerCatalog(pnIdentifier: string): Promise<OwnerCatalogFile[]> {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const res = await apiGet(`/api/aggregator/owner-catalog?limit=500`, { pnIdentifier: pn });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return [];
    throw new Error(`owner_catalog_${res.status}`);
  }
  const data = (await res.json()) as { files?: OwnerCatalogFile[] };
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((f) => ({
    fileId: f.fileId || (f.metadata?.fileId as string) || '',
    metadata: f.metadata || {},
    submittedAt: f.submittedAt,
    pnIdentifier: f.pnIdentifier
  })).filter((f) => f.fileId);
}
