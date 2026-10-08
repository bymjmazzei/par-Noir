import { describe, expect, it } from 'vitest';
import { catalogFieldsForMetadataPut } from './shareMetadataPutBody';

describe('catalogFieldsForMetadataPut', () => {
  it('includes note defer fields for orphan note thumbnails', () => {
    const fields = catalogFieldsForMetadataPut({
      fileType: 'note-thumbnail',
      mainFileId: 'main-1',
      fileId: 'thumb-1',
    });
    expect(fields.isNoteThumbnail).toBe(true);
    expect(fields.contentClass).toBe('note');
    expect(fields.mainFileId).toBe('main-1');
    expect(fields.fileType).toBe('note-thumbnail');
  });

  it('returns empty object when metadata is missing', () => {
    expect(catalogFieldsForMetadataPut(null)).toEqual({});
  });
});
