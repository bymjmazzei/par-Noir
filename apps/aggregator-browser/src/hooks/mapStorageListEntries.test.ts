import { describe, expect, it } from 'vitest';
import {
  mapCollectionEntry,
  mapNoteThumbnailEntry,
} from './mapStorageListEntries';
import { mapCentralIndexEntryToIndexedFile } from '../services/metadata/mapCentralIndexEntry';

describe('mapNoteThumbnailEntry', () => {
  const thumb = {
    id: 'thumb-drive-id',
    name: 'thumb_thought-123.png.encrypted',
    mimeType: 'application/octet-stream',
    size: '10',
  };

  it('keeps orphan Drive thumbs when metadata is null (indexMissing)', () => {
    const entry = mapNoteThumbnailEntry({
      thumb,
      noteFileId: 'main-thought-id',
      metadata: null,
    });

    expect(entry).not.toBeNull();
    expect(entry.indexMissing).toBe(true);
    expect(entry.fileType).toBe('note-thumbnail');
    expect(entry.isThumbnail).toBe(true);
    expect(entry.mainFileId).toBe('main-thought-id');
    expect(entry.displayName).toBe('thought-123');
    expect(entry.isPartOfCollection).toBe(false);
  });

  it('uses metadata when present', () => {
    const entry = mapNoteThumbnailEntry({
      thumb,
      noteFileId: 'main-thought-id',
      metadata: {
        fileType: 'note-thumbnail',
        mainFileId: 'from-meta',
        isPartOfCollection: true,
      },
    });

    expect(entry.indexMissing).toBe(false);
    expect(entry.mainFileId).toBe('from-meta');
    expect(entry.isPartOfCollection).toBe(true);
  });
});

describe('mapCollectionEntry', () => {
  const file = {
    id: 'coll-id',
    name: 'collection-abc.collection.encrypted',
    mimeType: 'application/octet-stream',
    size: '10',
  };

  it('keeps orphan collections when metadata is null', () => {
    const entry = mapCollectionEntry({ file, metadata: null });
    expect(entry.indexMissing).toBe(true);
    expect(entry.fileType).toBe('collection');
    expect(entry.displayName).toBe('collection-abc');
  });
});

describe('mapCentralIndexEntryToIndexedFile', () => {
  it('preserves thought/textPost on historical thumb_thought rows', () => {
    const mapped = mapCentralIndexEntryToIndexedFile({
      fileId: '1YK6',
      pnIdentifier: 'pn-abc',
      metadata: {
        name: 'thumb_thought-1786289955537.png',
        fileType: 'note-thumbnail',
        contentClass: 'note',
        thought: { content: 'test', style: {} },
        textPost: { content: 'test', style: {} },
        publicToken: '{"shareKey":"x"}',
      },
    });

    expect(mapped.metadata.thought?.content).toBe('test');
    expect(mapped.metadata.textPost?.content).toBe('test');
    expect(mapped.metadata.fileId).toBe('1YK6');
    expect(mapped.publicToken).toBeTruthy();
  });
});
