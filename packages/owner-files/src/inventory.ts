/**
 * Pure inventory assembly: Drive listings + device owner index + owner catalog → rows per account.
 * Catalog rows (Pen publish and other indexed-only items) keep the full account key so downloads
 * and grouping never fall back to a bare provider id.
 */
import { isAggregatorCollectionPart, ownerCatalogDriveId } from '@par-noir/aggregator-domain';
import {
  classifyDriveListings,
  classifyOwnerIndexEntry,
  collectionFileIdsFromMetadata,
  rowKey,
  visibilityFromMetadata
} from './classify';
import type {
  DriveListing,
  OwnerAccount,
  OwnerCatalogRow,
  OwnerFileKind,
  OwnerFileRow,
  OwnerIndexEntry,
  OwnerInventory
} from './model';
import { guessMimeFromName, stripEncryptedSuffix } from './names';

type Meta = Record<string, unknown>;

export interface AccountSource {
  /** Drive scan of the canonical folders. Absent = not scanned this pass. */
  listings?: DriveListing[];
  /** Device owner index. `null`/absent/empty = no index. */
  index?: OwnerIndexEntry[] | null;
  error?: string;
}

export interface BuildOwnerInventoryInput {
  accounts: OwnerAccount[];
  sources: Record<string, AccountSource>;
  /** `null` when the catalog request failed. */
  catalog: OwnerCatalogRow[] | null;
  /** Extra metadata (e.g. single-row lookups when the catalog was unavailable). */
  metadataById?: Record<string, Meta>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export function catalogMetadataById(catalog: OwnerCatalogRow[] | null): Record<string, Meta> {
  const out: Record<string, Meta> = {};
  for (const row of catalog || []) {
    if (!row?.fileId || !row.metadata) continue;
    out[row.fileId] = row.metadata;
    const driveId = ownerCatalogDriveId(row.metadata, row.fileId);
    if (driveId && !out[driveId]) out[driveId] = row.metadata;
  }
  return out;
}

export function catalogKind(meta: Meta): OwnerFileKind {
  if (str(meta.penDocId)) return 'pen-post';
  const fileType = (str(meta.fileType) || '').toLowerCase();
  if (fileType === 'collection' || collectionFileIdsFromMetadata(meta)) return 'collection';
  if (fileType.includes('note') || str(meta.contentClass) === 'note') return 'note';
  return 'encrypted-upload';
}

export function accountForCatalogRow(accounts: OwnerAccount[], meta: Meta): OwnerAccount | undefined {
  if (!accounts.length) return undefined;
  const backend = str(meta.backend) || str(meta.storageBackend);
  const accountId = str(meta.accountId);
  const exact = accounts.find(
    (a) =>
      (backend && (a.accountKey === backend || backend.endsWith(`::${a.accountId}`))) ||
      (accountId && (a.accountId === accountId || a.accountKey === accountId))
  );
  if (exact) return exact;
  const provider = (backend || str(meta.storageProvider) || '').split('::')[0];
  return accounts.find((a) => provider && a.provider === provider) || accounts[0];
}

export function catalogRowToOwnerRow(account: OwnerAccount, row: OwnerCatalogRow): OwnerFileRow {
  const meta = row.metadata;
  const driveId = ownerCatalogDriveId(meta, row.fileId);
  const id = driveId || row.fileId;
  const title = str(meta.title) || str(meta.name) || id;
  const name = str(meta.name) || `catalog-${row.fileId.slice(0, 8)}`;
  const size = Number(meta.size ?? meta.fileSize ?? 0);
  return {
    key: rowKey(account.accountKey, id),
    id,
    accountKey: account.accountKey,
    accountId: account.accountId,
    provider: account.provider,
    name,
    displayName: stripEncryptedSuffix(title),
    kind: catalogKind(meta),
    origin: 'catalog',
    driveFileId: driveId,
    metadataIndexFileId: row.fileId,
    mimeType: str(meta.mimeType) || str(meta.contentType) || guessMimeFromName(name),
    size: Number.isFinite(size) && size > 0 ? size : 0,
    modifiedTime: str(meta.penPostUpdatedAt) || str(meta.uploadDate) || str(meta.createdAt),
    visibility: visibilityFromMetadata(meta),
    encrypted: false,
    indexed: true,
    penDocId: str(meta.penDocId),
    metadata: meta,
    collectionFileIds: collectionFileIdsFromMetadata(meta)
  };
}

function rowIds(row: OwnerFileRow): string[] {
  return [row.id, row.driveFileId, row.thumbDriveFileId, row.metadataIndexFileId].filter(
    (v): v is string => !!v
  );
}

function rowsForAccount(account: OwnerAccount, source: AccountSource, metadataById: Record<string, Meta>) {
  const index = source.index?.length ? source.index : null;
  if (!index) return classifyDriveListings(account, source.listings || [], metadataById);

  const indexRows = index.map((entry) => classifyOwnerIndexEntry(account, entry));
  if (!source.listings?.length) return indexRows;

  // Verify pass: keep index orphans (reconcile owns cleanup) and add Drive files the index lacks.
  const known = new Set(indexRows.flatMap(rowIds));
  const unindexed = classifyDriveListings(account, source.listings, metadataById).filter(
    (row) => !rowIds(row).some((id) => known.has(id))
  );
  return [...indexRows, ...unindexed];
}

export function buildOwnerInventory(input: BuildOwnerInventoryInput): OwnerInventory {
  const metadataById: Record<string, Meta> = {
    ...catalogMetadataById(input.catalog),
    ...(input.metadataById || {})
  };
  const rowsByAccount: Record<string, OwnerFileRow[]> = {};
  const errors: Record<string, string> = {};
  const byId = new Map<string, OwnerFileRow>();

  for (const account of input.accounts) {
    const source = input.sources[account.accountKey] || {};
    if (source.error) errors[account.accountKey] = source.error;
    const rows = rowsForAccount(account, source, metadataById);
    rowsByAccount[account.accountKey] = rows;
    for (const row of rows) for (const id of rowIds(row)) if (!byId.has(id)) byId.set(id, row);
  }

  for (const catalogRow of input.catalog || []) {
    const meta = catalogRow?.metadata;
    if (!catalogRow?.fileId || !meta || isAggregatorCollectionPart(meta)) continue;
    const driveId = ownerCatalogDriveId(meta, catalogRow.fileId);
    const existing = byId.get(catalogRow.fileId) || (driveId ? byId.get(driveId) : undefined);
    if (existing) {
      existing.metadata = { ...(existing.metadata || {}), ...meta };
      existing.metadataIndexFileId = existing.metadataIndexFileId || catalogRow.fileId;
      existing.visibility = visibilityFromMetadata(existing.metadata);
      existing.indexed = true;
      existing.penDocId = existing.penDocId || str(meta.penDocId);
      if (existing.penDocId) existing.kind = 'pen-post';
      existing.collectionFileIds = existing.collectionFileIds || collectionFileIdsFromMetadata(meta);
      continue;
    }
    const account = accountForCatalogRow(input.accounts, meta);
    if (!account) continue;
    const row = catalogRowToOwnerRow(account, catalogRow);
    (rowsByAccount[account.accountKey] ||= []).push(row);
    for (const id of rowIds(row)) if (!byId.has(id)) byId.set(id, row);
  }

  for (const rows of Object.values(rowsByAccount)) {
    for (const row of rows) {
      if (!row.metadata) continue;
      for (const id of rowIds(row)) if (!metadataById[id]) metadataById[id] = row.metadata;
    }
  }

  return {
    rows: input.accounts.flatMap((a) => rowsByAccount[a.accountKey] || []),
    rowsByAccount,
    metadataById,
    errors
  };
}
