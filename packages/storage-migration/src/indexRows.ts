/** Shared index row mapping for portable SQLite and Google Sheets. */

export interface IndexFileEntryLike {
  fileId: string;
  googleDriveFileId?: string;
  visibility: string;
  uploadedAt: string;
  [key: string]: unknown;
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

export function indexEntryToRow(entry: IndexFileEntryLike): Record<string, unknown> {
  return {
    ...entry,
    fileId: entry.fileId,
    visibility: entry.visibility,
    uploadedAt: entry.uploadedAt,
    entryData: JSON.stringify(entry)
  };
}

export function indexSheetsRowsToPortableRows(
  entries: IndexFileEntryLike[]
): Record<string, unknown>[] {
  return entries.map(indexEntryToRow);
}

export function portableRowsToIndexEntries(
  rows: Record<string, unknown>[]
): IndexFileEntryLike[] {
  return rows.map(rowToIndexEntry);
}
