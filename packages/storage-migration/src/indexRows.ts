/** Shared index row mapping for portable SQLite and Google Sheets. */

export interface IndexFileEntryLike {
  fileId: string;
  googleDriveFileId?: string;
  visibility: string;
  uploadedAt: string;
  [key: string]: unknown;
}

export type IndexSheetKind = 'owner' | 'public';

/** Google Sheets max cell size; stay under this for column E JSON payloads. */
export const SHEETS_INDEX_CELL_SAFE_CHARS = 45000;

function slimEngagement(engagement: unknown): Record<string, unknown> | undefined {
  if (!engagement || typeof engagement !== 'object') return undefined;
  const e = engagement as Record<string, unknown>;
  return {
    views: e.views ?? 0,
    likes: e.likes ?? 0,
    comments: e.comments ?? 0,
    shares: e.shares ?? 0,
    lastUpdated: e.lastUpdated,
  };
}

function collectionFileIdsFrom(raw: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(raw.collectionFileIds)) {
    return raw.collectionFileIds as string[];
  }
  const col = raw.collection as { collectionFileIds?: string[] } | undefined;
  if (col?.collectionFileIds && Array.isArray(col.collectionFileIds)) {
    return col.collectionFileIds;
  }
  return undefined;
}

function normalizeContentClass(raw: Record<string, unknown>): string | undefined {
  const cc = raw.contentClass;
  if (typeof cc !== 'string') return undefined;
  if (cc === 'thoughts') return 'thought';
  if (cc === 'collections') return 'collection';
  return cc;
}

/**
 * Strip companion-metadata bloat before writing index rows to Sheets or portable storage.
 * Full metadata lives in companion spreadsheets and Postgres aggregator tables.
 */
export function slimIndexEntry(
  entry: IndexFileEntryLike,
  options?: { indexKind?: IndexSheetKind; warnOnOversize?: boolean }
): IndexFileEntryLike {
  const raw = entry as Record<string, unknown>;
  const indexKind = options?.indexKind;

  const slim: Record<string, unknown> = {
    fileId: entry.fileId,
    googleDriveFileId:
      entry.googleDriveFileId ??
      (typeof raw.backendFileId === 'string' ? raw.backendFileId : undefined),
    visibility: entry.visibility,
    uploadedAt: entry.uploadedAt,
  };

  const contentClass = normalizeContentClass(raw);
  if (contentClass) slim.contentClass = contentClass;

  if (typeof raw.fileName === 'string') slim.fileName = raw.fileName;
  else if (typeof raw.originalName === 'string') slim.fileName = raw.originalName;
  if (typeof raw.originalName === 'string') slim.originalName = raw.originalName;
  if (typeof raw.mimeType === 'string') slim.mimeType = raw.mimeType;
  if (typeof raw.size === 'number') slim.size = raw.size;
  if (raw.owner && typeof raw.owner === 'object') slim.owner = raw.owner;
  if (Array.isArray(raw.tags)) slim.tags = raw.tags;
  if (typeof raw.description === 'string') slim.description = raw.description;

  if (raw.isThoughtThumbnail === true) slim.isThoughtThumbnail = true;
  if (typeof raw.mainFileId === 'string') slim.mainFileId = raw.mainFileId;
  if (typeof raw.thumbnailFileId === 'string') slim.thumbnailFileId = raw.thumbnailFileId;
  if (typeof raw.inReplyTo === 'string') slim.inReplyTo = raw.inReplyTo;
  if (typeof raw.repostOf === 'string') slim.repostOf = raw.repostOf;
  if (typeof raw.isPartOf === 'string') slim.isPartOf = raw.isPartOf;

  const collectionFileIds = collectionFileIdsFrom(raw);
  if (collectionFileIds?.length) slim.collectionFileIds = collectionFileIds;

  const engagement = slimEngagement(raw.engagement);
  if (engagement) slim.engagement = engagement;

  if (indexKind === 'public' || (indexKind !== 'owner' && entry.visibility === 'public')) {
    if (raw.indexingPermissions && typeof raw.indexingPermissions === 'object') {
      slim.indexingPermissions = raw.indexingPermissions;
    }
  }

  if (indexKind === 'owner' || indexKind !== 'public') {
    if (typeof raw.backend === 'string') slim.backend = raw.backend;
    if (typeof raw.backendFileId === 'string') slim.backendFileId = raw.backendFileId;
    if (typeof raw.backendAccountId === 'string') slim.backendAccountId = raw.backendAccountId;
  }

  const serialized = JSON.stringify(slim);

  if (
    serialized.length > SHEETS_INDEX_CELL_SAFE_CHARS &&
    options?.warnOnOversize !== false &&
    typeof process !== 'undefined'
  ) {
    const sizes: Record<string, number> = {};
    for (const key of Object.keys(slim)) {
      if (key === 'fileId') continue;
      sizes[key] = JSON.stringify(slim[key]).length;
    }
    console.warn(
      `[slimIndexEntry] row still exceeds ${SHEETS_INDEX_CELL_SAFE_CHARS} chars (${serialized.length}) for ${entry.fileId}:`,
      sizes
    );
  }

  return slim as IndexFileEntryLike;
}

export function rowToIndexEntry(row: Record<string, unknown>): IndexFileEntryLike {
  if (typeof row.entryData === 'string') {
    try {
      return JSON.parse(row.entryData) as IndexFileEntryLike;
    } catch {
      /* fall through */
    }
  }
  if (row.entryData && typeof row.entryData === 'object') {
    return row.entryData as IndexFileEntryLike;
  }
  return row as IndexFileEntryLike;
}

export function indexEntryToRow(
  entry: IndexFileEntryLike,
  options?: { indexKind?: IndexSheetKind }
): Record<string, unknown> {
  const slim = slimIndexEntry(entry, options);
  return {
    fileId: slim.fileId,
    visibility: slim.visibility,
    uploadedAt: slim.uploadedAt,
    entryData: JSON.stringify(slim),
  };
}

export function indexSheetsRowsToPortableRows(
  entries: IndexFileEntryLike[],
  options?: { indexKind?: IndexSheetKind }
): Record<string, unknown>[] {
  return entries.map((e) => indexEntryToRow(e, options));
}

export function portableRowsToIndexEntries(
  rows: Record<string, unknown>[]
): IndexFileEntryLike[] {
  return rows.map(rowToIndexEntry);
}

/** Serialize slim entry for Google Sheets column E. */
export function serializeSlimIndexEntryJson(
  entry: IndexFileEntryLike,
  options?: { indexKind?: IndexSheetKind }
): string {
  return JSON.stringify(slimIndexEntry(entry, options));
}
