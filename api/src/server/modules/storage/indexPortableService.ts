import { contentClassIndexPath, type TableSchema } from '@par-noir/user-owned-storage';
import { indexEntryToRow } from '@par-noir/storage-migration';
import type { IndexFileEntry } from '../indexSheetsService';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableGetByKey,
  portableTableReplaceAll,
  portableTableScan
} from './portableTableService';
import { OWNER_FILE_INDEX_SCHEMA, PUBLIC_FILE_INDEX_SCHEMA } from './tableSchemas';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';
import { METADATA_DIR } from '@par-noir/user-owned-storage';

type ContentClassFolder = 'media' | 'thoughts' | 'collections';

function indexMetaPath(indexType: 'public' | 'owner', contentClass?: ContentClassFolder): string {
  if (contentClass) {
    return `${METADATA_DIR}/${contentClass}/${contentClass}-${indexType}-index-meta.json`;
  }
  return `${METADATA_DIR}/${indexType}-file-index-meta.json`;
}

export function resolveIndexSchema(
  indexType: 'public' | 'owner',
  contentClass?: ContentClassFolder
): TableSchema {
  if (contentClass) {
    return {
      id: `${contentClass}-${indexType}-index`,
      keyColumn: 'fileId',
      path: contentClassIndexPath(contentClass, indexType)
    };
  }
  return indexType === 'public' ? PUBLIC_FILE_INDEX_SCHEMA : OWNER_FILE_INDEX_SCHEMA;
}

function rowToEntry(row: Record<string, unknown>): IndexFileEntry {
  if (typeof row.entryData === 'string') {
    try {
      return JSON.parse(row.entryData) as IndexFileEntry;
    } catch {
      /* fall through */
    }
  }
  if (row.entryData && typeof row.entryData === 'object') {
    return row.entryData as IndexFileEntry;
  }
  return row as IndexFileEntry;
}

function entryToRow(entry: IndexFileEntry, indexType: 'public' | 'owner'): Record<string, unknown> {
  return indexEntryToRow(entry, { indexKind: indexType });
}

export async function getIndexFilesPortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  accountId?: string,
  options?: {
    visibility?: 'public' | 'private' | 'friends';
    contentClass?: 'media' | 'thought' | 'collection';
    limit?: number;
    offset?: number;
  },
  contentClassFolder?: ContentClassFolder
): Promise<{ files: IndexFileEntry[]; total: number }> {
  const schema = resolveIndexSchema(indexType, contentClassFolder);
  const rows = await portableTableScan<Record<string, unknown>>(pnIdentifier, schema, accountId);
  let files = rows.map(rowToEntry);

  if (options?.visibility) {
    files = files.filter((f) => f.visibility === options.visibility);
  }
  if (options?.contentClass) {
    files = files.filter((f) => f.contentClass === options.contentClass);
  }

  const total = files.length;
  const limit = options?.limit ?? files.length;
  const offset = options?.offset ?? 0;
  return { files: files.slice(offset, offset + limit), total };
}

export async function getIndexFileByIdPortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  fileId: string,
  accountId?: string,
  contentClassFolder?: ContentClassFolder
): Promise<IndexFileEntry | null> {
  const schema = resolveIndexSchema(indexType, contentClassFolder);
  const row = await portableTableGetByKey<Record<string, unknown>>(
    pnIdentifier,
    schema,
    fileId,
    accountId
  );
  return row ? rowToEntry(row) : null;
}

export async function addIndexFilePortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  entry: IndexFileEntry,
  accountId?: string,
  contentClassFolder?: ContentClassFolder
): Promise<void> {
  const schema = resolveIndexSchema(indexType, contentClassFolder);
  await portableTableAppend(pnIdentifier, schema, entryToRow(entry, indexType), accountId);
}

export async function updateIndexFilePortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  fileId: string,
  updates: Partial<IndexFileEntry>,
  accountId?: string,
  contentClassFolder?: ContentClassFolder
): Promise<void> {
  const existing = await getIndexFileByIdPortable(
    pnIdentifier,
    indexType,
    fileId,
    accountId,
    contentClassFolder
  );
  if (!existing) throw new Error('File not found in index');
  await addIndexFilePortable(
    pnIdentifier,
    indexType,
    { ...existing, ...updates, fileId },
    accountId,
    contentClassFolder
  );
}

export async function setAllIndexFilesPortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  entries: IndexFileEntry[],
  accountId?: string,
  updatedAt?: string,
  contentClassFolder?: ContentClassFolder
): Promise<void> {
  const schema = resolveIndexSchema(indexType, contentClassFolder);
  await portableTableReplaceAll(
    pnIdentifier,
    schema,
    entries.map((e) => entryToRow(e, indexType)),
    accountId,
    updatedAt ? { updatedAt } : undefined
  );
  if (updatedAt) {
    await writePortableJsonBlob(
      pnIdentifier,
      indexMetaPath(indexType, contentClassFolder),
      { updatedAt },
      accountId
    );
  }
}

export async function removeIndexFilePortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  fileId: string,
  accountId?: string,
  contentClassFolder?: ContentClassFolder
): Promise<void> {
  const schema = resolveIndexSchema(indexType, contentClassFolder);
  await portableTableDelete(pnIdentifier, schema, fileId, accountId);
}

export async function getIndexUpdatedAtPortable(
  pnIdentifier: string,
  indexType: 'public' | 'owner',
  accountId?: string,
  contentClassFolder?: ContentClassFolder
): Promise<string | null> {
  const meta = await readPortableJsonBlob<{ updatedAt?: string }>(
    pnIdentifier,
    indexMetaPath(indexType, contentClassFolder),
    accountId
  );
  return meta?.updatedAt ?? null;
}
