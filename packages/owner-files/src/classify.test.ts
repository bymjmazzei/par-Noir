import { describe, expect, it } from 'vitest';
import { classifyDriveListings, classifyOwnerIndexEntry } from './classify';
import { ownerScanFolderIds } from './folders';
import type { OwnerAccount } from './model';

const account: OwnerAccount = {
  accountKey: 'google_drive::acct',
  provider: 'google_drive',
  accountId: 'acct',
  label: 'me@example.com'
};

const f = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  mimeType: 'application/octet-stream',
  size: '100',
  ...extra
});

describe('classifyDriveListings', () => {
  it('pairs a thumbnail with its main file into one encrypted-upload row', () => {
    const rows = classifyDriveListings(account, [
      f('main-1', 'photo.jpg.encrypted', { size: '5000' }),
      f('thumb-1', 'thumb_photo.jpg.encrypted')
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'thumb-1',
      kind: 'encrypted-upload',
      driveFileId: 'main-1',
      thumbDriveFileId: 'thumb-1',
      metadataIndexFileId: 'thumb-1',
      mimeType: 'image/jpeg',
      displayName: 'photo',
      size: 5000,
      encrypted: true,
      accountKey: 'google_drive::acct',
      key: 'google_drive::acct:thumb-1'
    });
  });

  it('shows a private PDF with no thumbnail or index row as a standalone upload', () => {
    const rows = classifyDriveListings(account, [f('pdf-1', 'taxes.pdf.encrypted')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'pdf-1',
      kind: 'encrypted-upload',
      driveFileId: 'pdf-1',
      mimeType: 'application/pdf',
      displayName: 'taxes.pdf',
      visibility: 'private',
      indexed: false,
      encrypted: true
    });
    expect(rows[0]!.thumbDriveFileId).toBeUndefined();
  });

  it('pairs a PDF with its page-1 thumb and hides page thumbnails', () => {
    const rows = classifyDriveListings(account, [
      f('pdf-1', 'deck.pdf.encrypted'),
      f('t-1', 'thumb_deck.pdf.encrypted'),
      f('p-1', 'thumb_deck-page-1.png.encrypted'),
      f('p-2', 'thumb_deck-page-2.png.encrypted')
    ]);
    expect(rows.map((r) => r.id)).toEqual(['t-1']);
    expect(rows[0]!.driveFileId).toBe('pdf-1');
  });

  it('hides plumbing objects and folders', () => {
    const rows = classifyDriveListings(account, [
      f('e', 'public-envelope-abc.json'),
      f('p', 'feed-preview-abc-poster'),
      f('i', 'public-file-index.json'),
      f('d', 'content', { mimeType: 'application/vnd.google-apps.folder' })
    ]);
    expect(rows).toEqual([]);
  });

  it('represents notes by their thumbnail and hides the note payload', () => {
    const rows = classifyDriveListings(account, [
      f('n-main', 'note-123.note.encrypted'),
      f('n-thumb', 'thumb_note-123.png.encrypted')
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'n-thumb', kind: 'note', driveFileId: 'n-main' });
  });

  it('hides note-collection pages, payloads, and members of note collections', () => {
    const metadata = {
      'col-1': { name: 'Trip', isNoteCollection: true, collection: { collectionFileIds: ['nt-1', 'nt-2'] } },
      'nt-3': { fileType: 'note-collection-thumbnail' }
    };
    const rows = classifyDriveListings(
      account,
      [
        f('col-1', 'collection-1.collection.encrypted'),
        f('nt-1', 'thumb_note-a.png.encrypted'),
        f('nt-2', 'thumb_note-b.png.encrypted'),
        f('nt-3', 'thumb_note-c.png.encrypted'),
        f('nc', 'note-collection-9.note-collection.encrypted'),
        f('np', 'thumb_note-collection-page-1.png.encrypted')
      ],
      metadata
    );
    expect(rows.map((r) => r.id)).toEqual(['col-1']);
    expect(rows[0]).toMatchObject({ kind: 'collection', displayName: 'Trip', collectionFileIds: ['nt-1', 'nt-2'] });
  });

  it('keeps members of regular collections visible', () => {
    const rows = classifyDriveListings(
      account,
      [
        f('col-1', 'collection-1.collection.encrypted'),
        f('m-1', 'a.png.encrypted'),
        f('t-1', 'thumb_a.png.encrypted')
      ],
      { 'col-1': { collection: { collectionFileIds: ['t-1'] } } }
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['col-1', 't-1']);
  });

  it('reads visibility from metadata', () => {
    const rows = classifyDriveListings(
      account,
      [f('m', 'a.png.encrypted'), f('t', 'thumb_a.png.encrypted')],
      { t: { isPublic: true } }
    );
    expect(rows[0]).toMatchObject({ visibility: 'public', indexed: true });
  });
});

describe('classifyOwnerIndexEntry', () => {
  it('maps a dashboard index entry to an index row keyed by the full account key', () => {
    const row = classifyOwnerIndexEntry(account, {
      fileId: 'f1',
      googleDriveFileId: 'g1',
      fileName: 'doc.encrypted',
      originalName: 'doc.pdf',
      visibility: 'private',
      size: 12
    });
    expect(row).toMatchObject({
      key: 'google_drive::acct:f1',
      id: 'f1',
      driveFileId: 'g1',
      origin: 'index',
      displayName: 'doc.pdf',
      mimeType: 'application/pdf',
      encrypted: true,
      size: 12
    });
  });
});

describe('ownerScanFolderIds', () => {
  it('scans files/ and every content class folder once', () => {
    expect(
      ownerScanFolderIds({
        filesFolderId: 'files',
        contentNotesFolderId: 'notes',
        contentMediaFolderId: 'media',
        contentCollectionsFolderId: 'notes'
      })
    ).toEqual(['files', 'notes', 'media']);
    expect(ownerScanFolderIds({ filesFolderId: 'NOT_CONNECTED' })).toEqual([]);
  });
});
