/**
 * Owner catalog from Postgres aggregator index (Pen publish, etc.).
 */

import { ownerCatalogDriveId } from '@par-noir/aggregator-domain';
import type { AggregatedFile, PublicMetadata } from '../types/aggregator';
import { ownerGet } from './ownerApiService';

export type OwnerCatalogFile = {
  fileId: string;
  metadata: Record<string, unknown>;
};

export async function fetchOwnerCatalog(
  pnIdentifier: string,
  authToken: string
): Promise<OwnerCatalogFile[]> {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const res = await ownerGet(authToken, `/api/aggregator/owner-catalog?limit=500`, { pnIdentifier: pn });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return [];
    throw new Error(`owner_catalog_${res.status}`);
  }
  const data = (await res.json()) as { files?: Array<{ fileId?: string; metadata?: Record<string, unknown> }> };
  const files = Array.isArray(data.files) ? data.files : [];
  return files
    .map((f) => ({
      fileId: f.fileId || (f.metadata?.fileId as string) || '',
      metadata: f.metadata || {}
    }))
    .filter((f) => f.fileId);
}

export function ownerCatalogToAggregatedFile(
  row: OwnerCatalogFile,
  backendId: string
): AggregatedFile {
  const driveId = ownerCatalogDriveId(
    row.metadata as { publicContentRef?: { objectId?: string }; fileId?: string },
    row.fileId
  );
  const id = driveId || row.fileId;
  const title =
    (typeof row.metadata.title === 'string' && row.metadata.title) ||
    (typeof row.metadata.name === 'string' && row.metadata.name) ||
    id;
  const backend = backendId.includes('::') ? backendId.split('::')[0] : backendId;
  const isPublic = row.metadata.isPublic === true || row.metadata.isPublic === 'true';

  return {
    id,
    name: title,
    originalName: title,
    mimeType: 'application/json',
    size: 0,
    backend,
    backendFileId: id,
    catalogBacked: true,
    metadataIndexFileId: row.fileId,
    visibility: isPublic ? 'public' : 'private'
  };
}

export function applyOwnerCatalogToLoad(params: {
  catalog: OwnerCatalogFile[];
  backendId: string;
  aggregatedAllFiles: AggregatedFile[];
  aggregatedMetadataMap: Map<string, PublicMetadata>;
}): void {
  const existing = new Set(
    params.aggregatedAllFiles.map((f) => f.backendFileId || f.id)
  );
  for (const row of params.catalog) {
    const agg = ownerCatalogToAggregatedFile(row, params.backendId);
    const key = agg.backendFileId || agg.id;
    if (existing.has(key)) continue;
    existing.add(key);
    params.aggregatedAllFiles.push(agg);
    const meta = row.metadata as PublicMetadata;
    params.aggregatedMetadataMap.set(agg.id, meta);
    params.aggregatedMetadataMap.set(row.fileId, meta);
    if (agg.metadataIndexFileId && agg.metadataIndexFileId !== agg.id) {
      params.aggregatedMetadataMap.set(agg.metadataIndexFileId, meta);
    }
  }
}
