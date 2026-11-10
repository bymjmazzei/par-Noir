import {
  OWNER_FILE_INDEX_SCHEMA,
  PUBLIC_FILE_INDEX_SCHEMA,
  indexEntryToRow,
  rowToIndexEntry,
  type IndexFileEntryLike,
} from '@par-noir/user-owned-storage';
import {
  listDeviceOwnerFiles,
  removeDeviceIndexFiles,
  upsertDeviceOwnerFile,
  upsertDevicePublicIndexFile,
  type DeviceOwnerIndexFile,
} from '../deviceIndexes.js';
import type { DeviceSocialContext } from './socialContext.js';

export type FileIndexKind = 'owner' | 'public';

/** The pN's root owner or public file index, on whichever cloud holds its social tables. */
export interface DeviceFileIndex {
  list(): Promise<Record<string, unknown>[]>;
  upsert(entry: Record<string, unknown>): Promise<void>;
  /** Removes rows whose fileId or backend file id is listed. Returns how many were removed. */
  remove(ids: readonly string[]): Promise<number>;
}

const SHEET_KEYS: Record<FileIndexKind, 'owner-file-index' | 'public-file-index'> = {
  owner: 'owner-file-index',
  public: 'public-file-index',
};

export function indexEntryFromSheetRow(row: DeviceOwnerIndexFile): Record<string, unknown> {
  return {
    ...row.entry,
    fileId: row.fileId,
    googleDriveFileId: row.googleDriveFileId || row.entry.googleDriveFileId,
    backendFileId: row.googleDriveFileId || row.entry.backendFileId,
    visibility: row.visibility || row.entry.visibility,
    uploadedAt: row.uploadedAt || row.entry.uploadedAt,
    backend: row.entry.backend || 'google_drive',
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function deviceFileIndex(ctx: DeviceSocialContext, kind: FileIndexKind): DeviceFileIndex {
  return ctx.kind === 'google_drive' ? sheetIndex(ctx, kind) : tableIndex(ctx, kind);
}

function sheetIndex(
  ctx: Extract<DeviceSocialContext, { kind: 'google_drive' }>,
  kind: FileIndexKind
): DeviceFileIndex {
  const sheetId = ctx.index.sheetIds[SHEET_KEYS[kind]];
  return {
    async list() {
      if (!sheetId) return [];
      return (await listDeviceOwnerFiles(ctx.accessToken, sheetId)).map(indexEntryFromSheetRow);
    },
    async upsert(entry) {
      if (!sheetId) throw new Error(`${SHEET_KEYS[kind]} sheet missing`);
      if (kind === 'public') {
        await upsertDevicePublicIndexFile(ctx.accessToken, sheetId, entry);
        return;
      }
      await upsertDeviceOwnerFile(ctx.accessToken, sheetId, {
        fileId: str(entry.fileId),
        googleDriveFileId: str(entry.googleDriveFileId) || str(entry.backendFileId),
        visibility: str(entry.visibility) || 'private',
        uploadedAt: str(entry.uploadedAt),
        entry: { ...entry },
      });
    },
    async remove(ids) {
      if (!sheetId) return 0;
      return removeDeviceIndexFiles(ctx.accessToken, sheetId, ids);
    },
  };
}

function tableIndex(
  ctx: Extract<DeviceSocialContext, { kind: 'tables' }>,
  kind: FileIndexKind
): DeviceFileIndex {
  const schema = kind === 'owner' ? OWNER_FILE_INDEX_SCHEMA : PUBLIC_FILE_INDEX_SCHEMA;
  const open = () => ctx.tables.openTable(schema);
  return {
    async list() {
      const rows = await (await open()).scan();
      return rows.map((row) => rowToIndexEntry(row) as Record<string, unknown>);
    },
    async upsert(entry) {
      if (!str(entry.fileId)) throw new Error('index row requires fileId');
      const row = {
        ...entry,
        visibility: str(entry.visibility) || (entry.isPublic === true ? 'public' : 'private'),
        uploadedAt: str(entry.uploadedAt) || str(entry.uploadDate) || new Date().toISOString(),
      };
      await (await open()).append(indexEntryToRow(row as IndexFileEntryLike, { indexKind: kind }));
    },
    async remove(ids) {
      const drop = new Set(ids.filter(Boolean));
      if (drop.size === 0) return 0;
      const table = await open();
      const matches = (await table.scan())
        .map((row) => rowToIndexEntry(row))
        .filter((e) => drop.has(e.fileId) || drop.has(str(e.backendFileId)) || drop.has(str(e.googleDriveFileId)));
      for (const entry of matches) await table.delete(entry.fileId);
      return matches.length;
    },
  };
}
