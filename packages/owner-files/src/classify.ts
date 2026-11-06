/**
 * Drive listing → owner rows. One rule set for browse and dashboard:
 * - thumbnail sidecars pair with their main file (one row, thumb drives the tile)
 * - note thumbs represent notes; note-collection pages and payloads never show individually
 * - collection payloads are their own row
 * - any other main file is a standalone upload (private PDFs, dashboard cabinet uploads)
 */
import type { DriveListing, OwnerAccount, OwnerFileRow, OwnerIndexEntry } from './model';
import {
  DRIVE_FOLDER_MIME,
  cleanCollectionDisplayName,
  cleanThumbDisplayName,
  guessMimeFromName,
  isCollectionFileName,
  isEncryptedName,
  isNoteCollectionFileName,
  isNoteFileName,
  isNoteThumbnailFileName,
  isPageThumbnailFileName,
  isSystemArtifactName,
  isThumbnailFileName,
  noteBaseName,
  stripEncryptedSuffix,
  thumbnailTargetName
} from './names';

type Meta = Record<string, unknown>;
type MetadataLookup = Record<string, Meta | undefined>;

export function rowKey(accountKey: string, id: string): string {
  return `${accountKey}:${id}`;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function sizeOf(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function visibilityFromMetadata(meta: Meta | null | undefined): 'public' | 'private' {
  const v = meta?.isPublic;
  return v === true || v === 'true' ? 'public' : 'private';
}

export function collectionFileIdsFromMetadata(meta: Meta | null | undefined): string[] | undefined {
  const ids = (meta?.collection as { collectionFileIds?: unknown } | undefined)?.collectionFileIds;
  if (!Array.isArray(ids)) return undefined;
  const out = ids.filter((id): id is string => typeof id === 'string' && !!id);
  return out.length ? out : undefined;
}

function baseRow(
  account: OwnerAccount,
  fields: Omit<OwnerFileRow, 'key' | 'accountKey' | 'accountId' | 'provider'>
): OwnerFileRow {
  return {
    key: rowKey(account.accountKey, fields.id),
    accountKey: account.accountKey,
    accountId: account.accountId,
    provider: account.provider,
    ...fields
  };
}

export function classifyDriveListings(
  account: OwnerAccount,
  listings: DriveListing[],
  metadataById: MetadataLookup = {}
): OwnerFileRow[] {
  const files = listings.filter(
    (f) => f.id && f.name && f.mimeType !== DRIVE_FOLDER_MIME && !isSystemArtifactName(f.name)
  );
  const byId = new Map(files.map((f) => [f.id, f]));
  const thumbs = files.filter((f) => isThumbnailFileName(f.name));
  const mains = files.filter((f) => !f.name.toLowerCase().startsWith('thumb_'));

  const mainByBase = new Map<string, DriveListing>();
  for (const m of mains) {
    const base = stripEncryptedSuffix(m.name);
    if (!mainByBase.has(base)) mainByBase.set(base, m);
  }
  const noteMains = mains.filter((m) => isNoteFileName(m.name) && !isNoteCollectionFileName(m.name));
  const noteMainByBase = new Map(noteMains.map((m) => [noteBaseName(m.name), m]));
  const pairedMainIds = new Set<string>();

  const uploadRows: OwnerFileRow[] = [];
  const noteEntries: Array<{ row: OwnerFileRow; fileType?: string; mainIsNoteCollection: boolean }> = [];

  for (const thumb of thumbs) {
    const meta = metadataById[thumb.id];
    if (isNoteThumbnailFileName(thumb.name)) {
      const noteMain = noteMainByBase.get(noteBaseName(thumb.name));
      const mainFromMeta = str(meta?.mainFileId);
      const mainId = mainFromMeta || noteMain?.id;
      if (mainId) pairedMainIds.add(mainId);
      noteEntries.push({
        fileType: str(meta?.fileType),
        mainIsNoteCollection: Boolean(noteMain?.name.toLowerCase().endsWith('.note-collection.encrypted')),
        row: baseRow(account, {
          id: thumb.id,
          name: thumb.name,
          displayName: cleanThumbDisplayName(thumb.name),
          kind: 'note',
          origin: 'drive',
          driveFileId: mainId || thumb.id,
          thumbDriveFileId: thumb.id,
          metadataIndexFileId: thumb.id,
          mimeType: 'image/png',
          size: sizeOf(noteMain?.size ?? thumb.size),
          modifiedTime: thumb.modifiedTime,
          visibility: visibilityFromMetadata(meta),
          encrypted: true,
          indexed: Boolean(meta),
          metadata: meta
        })
      });
      continue;
    }
    if (isPageThumbnailFileName(thumb.name)) continue;

    const targetName = thumbnailTargetName(thumb.name);
    const main = mainByBase.get(targetName);
    if (main) pairedMainIds.add(main.id);
    uploadRows.push(
      baseRow(account, {
        id: thumb.id,
        name: main?.name ?? thumb.name,
        displayName: cleanThumbDisplayName(thumb.name),
        kind: 'encrypted-upload',
        origin: 'drive',
        driveFileId: main?.id || thumb.id,
        thumbDriveFileId: thumb.id,
        metadataIndexFileId: thumb.id,
        mimeType: guessMimeFromName(targetName) || (main?.mimeType !== 'application/octet-stream' ? main?.mimeType : undefined),
        size: sizeOf(main?.size ?? thumb.size),
        modifiedTime: main?.modifiedTime ?? thumb.modifiedTime,
        visibility: visibilityFromMetadata(meta),
        encrypted: main ? isEncryptedName(main.name) : true,
        indexed: Boolean(meta),
        metadata: meta
      })
    );
  }

  const collectionRows: Array<{ row: OwnerFileRow; isNoteCollection: boolean }> = [];
  for (const file of mains) {
    if (!isCollectionFileName(file.name)) continue;
    const meta = metadataById[file.id];
    collectionRows.push({
      isNoteCollection: meta?.isNoteCollection === true,
      row: baseRow(account, {
        id: file.id,
        name: file.name,
        displayName: str(meta?.name) || str(meta?.title) || cleanCollectionDisplayName(file.name),
        kind: 'collection',
        origin: 'drive',
        driveFileId: file.id,
        metadataIndexFileId: file.id,
        mimeType: 'application/json',
        size: sizeOf(file.size),
        modifiedTime: file.modifiedTime,
        visibility: visibilityFromMetadata(meta),
        encrypted: true,
        indexed: Boolean(meta),
        metadata: meta,
        collectionFileIds: collectionFileIdsFromMetadata(meta)
      })
    });
  }

  // Note collections (multi-page notes) hide their member pages; regular collections keep members visible.
  const noteThumbIds = new Set(noteEntries.map((e) => e.row.id));
  const hiddenThumbIds = new Set<string>();
  const hiddenMainIds = new Set<string>();
  for (const { row, isNoteCollection } of collectionRows) {
    const ids = row.collectionFileIds;
    if (!ids?.length) continue;
    const treatAsNoteCollection = isNoteCollection || ids.every((id) => noteThumbIds.has(id));
    if (!treatAsNoteCollection) continue;
    for (const id of ids) {
      hiddenThumbIds.add(id);
      const note = noteEntries.find((e) => e.row.id === id);
      if (note) {
        hiddenMainIds.add(note.row.driveFileId);
      } else {
        const direct = byId.get(id);
        if (direct && isNoteFileName(direct.name)) hiddenMainIds.add(id);
      }
    }
  }

  const noteRows = noteEntries
    .filter(({ row, fileType, mainIsNoteCollection }) => {
      if (fileType === 'note-collection-thumbnail') return false;
      if (mainIsNoteCollection) return false;
      if (isPageThumbnailFileName(row.name)) return false;
      if (hiddenThumbIds.has(row.id) || hiddenMainIds.has(row.driveFileId)) return false;
      return true;
    })
    .map((e) => e.row);

  const standaloneRows: OwnerFileRow[] = [];
  for (const file of mains) {
    if (pairedMainIds.has(file.id) || hiddenMainIds.has(file.id)) continue;
    if (isCollectionFileName(file.name) || isNoteCollectionFileName(file.name) || isNoteFileName(file.name)) {
      continue;
    }
    const meta = metadataById[file.id];
    const fileType = str(meta?.fileType);
    if (fileType === 'note-collection-page' || fileType === 'note-collection') continue;
    const baseName = stripEncryptedSuffix(file.name);
    standaloneRows.push(
      baseRow(account, {
        id: file.id,
        name: file.name,
        displayName: str(meta?.name) || baseName,
        kind: 'encrypted-upload',
        origin: 'drive',
        driveFileId: file.id,
        metadataIndexFileId: meta ? file.id : undefined,
        mimeType:
          guessMimeFromName(file.name) ||
          (file.mimeType && file.mimeType !== 'application/octet-stream' ? file.mimeType : undefined),
        size: sizeOf(file.size),
        modifiedTime: file.modifiedTime,
        visibility: visibilityFromMetadata(meta),
        encrypted: isEncryptedName(file.name),
        indexed: Boolean(meta),
        metadata: meta
      })
    );
  }

  return [...uploadRows, ...noteRows, ...collectionRows.map((c) => c.row), ...standaloneRows];
}

/** Device owner-index entry → row (dashboard uploads; always encrypted). */
export function classifyOwnerIndexEntry(account: OwnerAccount, entry: OwnerIndexEntry): OwnerFileRow {
  const driveFileId = entry.backendFileId || entry.googleDriveFileId || '';
  const name = entry.fileName || entry.originalName || 'Untitled';
  const id = entry.fileId || driveFileId || `${account.accountKey}:${name}`;
  const meta = entry.metadata;
  return baseRow(account, {
    id,
    name,
    displayName: stripEncryptedSuffix(entry.originalName || name),
    kind: isNoteFileName(name) ? 'note' : 'encrypted-upload',
    origin: 'index',
    driveFileId,
    metadataIndexFileId: entry.fileId || undefined,
    mimeType:
      (entry.mimeType && entry.mimeType !== 'application/octet-stream' ? entry.mimeType : undefined) ||
      guessMimeFromName(entry.originalName || name),
    size: sizeOf(entry.size),
    modifiedTime: entry.modifiedAt || entry.uploadedAt,
    visibility: entry.visibility === 'public' ? 'public' : 'private',
    encrypted: entry.encrypted !== false,
    indexed: true,
    metadata: meta
  });
}
